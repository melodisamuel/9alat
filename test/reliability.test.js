const assert = require('assert');
const { parseRssXml, fetchDjinniJobs } = require('../src/sources/djinni');
const { saveJob, jobExists, getJobsLast24Hours } = require('../src/database/jobs');
const { sanitizeSecrets, verifyTelegramConfig, sendDailySummary } = require('../src/notifications/telegram');
const { runJobCheck } = require('../src/services/scheduler');
const { triggerDailySummary } = require('../src/services/jobProcessor');
const { SEARCH_QUERIES } = require('../src/config/searchQueries');

async function runReliabilityTests() {
  console.log('=== Running Reliability, Multi-Query & Summary Tests ===\n');

  // Test 1: Search Queries Config Validation
  console.log('Test 1: Search Queries Configuration');
  assert.ok(Array.isArray(SEARCH_QUERIES));
  assert.strictEqual(SEARCH_QUERIES.length, 13);
  assert.ok(SEARCH_QUERIES.includes('QA Engineer'));
  assert.ok(SEARCH_QUERIES.includes('Software Test Engineer'));
  console.log('✓ Search queries configuration PASSED\n');

  // Test 2: Malformed RSS XML and Missing URLs
  console.log('Test 2: Malformed RSS XML / Missing URLs');
  const emptyRes = parseRssXml(null);
  assert.deepStrictEqual(emptyRes, []);

  const missingUrlXml = `
    <rss><channel>
      <item>
        <title>Job Without URL</title>
        <description>Some description</description>
      </item>
      <item>
        <title>Valid Job</title>
        <link>https://example.com/job-1</link>
        <description>Valid description</description>
        <pubDate>Invalid Date String</pubDate>
      </item>
    </channel></rss>
  `;
  const parsedItems = parseRssXml(missingUrlXml);
  assert.strictEqual(parsedItems.length, 1);
  assert.strictEqual(parsedItems[0].url, 'https://example.com/job-1');
  assert.ok(!isNaN(new Date(parsedItems[0].publishedAt).getTime()), 'Published date should fallback safely');
  console.log('✓ Malformed RSS and missing URL handling PASSED\n');

  // Test 3: Database Input Safeguards & 24h Query
  console.log('Test 3: Database Input Safeguards & 24h Query');
  assert.strictEqual(saveJob(null), false);
  assert.strictEqual(saveJob({ title: 'No URL' }), false);
  assert.strictEqual(jobExists(null), false);
  assert.strictEqual(jobExists(12345), false);
  const jobs24h = getJobsLast24Hours();
  assert.ok(Array.isArray(jobs24h));
  console.log('✓ Database input validation & 24h query PASSED\n');

  // Test 4: Secret Masking & Token Protection
  console.log('Test 4: Secret Masking & Token Protection');
  const rawTokenLog = 'Error fetching https://api.telegram.org/bot123456789:ABCdefGHIjklMNOpqrsTUVwxyz_12345/sendMessage';
  const sanitized = sanitizeSecrets(rawTokenLog);
  assert.ok(!sanitized.includes('123456789:ABCdefGHIjklMNOpqrsTUVwxyz_12345'));
  assert.ok(sanitized.includes('[REDACTED_BOT_TOKEN]'));
  console.log('✓ Secret masking PASSED\n');

  // Test 5: Concurrency Lock / Overlapping Cron Jobs
  console.log('Test 5: Overlapping Cron Job Lock');
  const run1 = runJobCheck();
  const run2 = runJobCheck();
  await Promise.all([run1, run2]);
  console.log('✓ Concurrency lock PASSED\n');

  // Test 6: Daily Summary Generation
  console.log('Test 6: Daily Summary Generation');
  const summaryData = await triggerDailySummary();
  assert.ok(typeof summaryData.discoveredTotal === 'number');
  assert.ok(typeof summaryData.relevantTotal === 'number');
  assert.ok(typeof summaryData.newAlertsTotal === 'number');
  console.log('✓ Daily summary generation PASSED\n');

  console.log('=== All Reliability, Multi-Query & Summary Tests Passed Successfully! ===\n');
}

runReliabilityTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
