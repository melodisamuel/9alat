require('dotenv').config();
const { fetchDjinniJobs } = require('../sources/djinni');
const { fetchRemoteOkJobs } = require('../sources/remoteok');
const { evaluateJob } = require('../matching/jobMatcher');
const { initializeDatabase, jobExists, saveJob, markJobNotified, getJobsLast24Hours } = require('../database/jobs');
const { sendJobAlert, sendDailySummary, verifyTelegramConfig } = require('../notifications/telegram');

/**
 * Process fetched jobs from all active sources (Djinni, RemoteOK), evaluate relevance, check DB, save new jobs, and send Telegram notifications.
 */
async function processJobs() {
  initializeDatabase();

  verifyTelegramConfig({ fatalInProduction: false });

  const minScore = parseInt(process.env.MIN_MATCH_SCORE || '70', 10);
  console.log(`Starting job processing pipeline (Minimum match score: ${minScore})...\n`);

  // 1. Fetch normalized jobs concurrently from all active sources
  const [djinniJobs, remoteOkJobs] = await Promise.all([
    fetchDjinniJobs().catch(err => {
      console.error('[Processor Warning] Djinni fetch error:', err.message);
      return [];
    }),
    fetchRemoteOkJobs().catch(err => {
      console.error('[Processor Warning] RemoteOK fetch error:', err.message);
      return [];
    })
  ]);

  console.log(`Source Stats -> Djinni: ${djinniJobs.length} jobs | RemoteOK: ${remoteOkJobs.length} jobs`);

  const allJobs = [...djinniJobs, ...remoteOkJobs];
  const fetchedTotal = allJobs.length;

  let relevantCount = 0;
  let newSavedCount = 0;
  let alreadySeenCount = 0;
  let skippedLowScoreCount = 0;
  let notificationsSentCount = 0;
  let notificationFailuresCount = 0;

  const newRelevantJobs = [];

  // 2. Process each job through matching, DB persistence, and Telegram notification
  for (const job of allJobs) {
    const evaluation = evaluateJob(job);
    const score = evaluation.score;

    if (score < minScore) {
      skippedLowScoreCount++;
      continue;
    }

    relevantCount++;

    const isDuplicate = jobExists(job.url);

    if (isDuplicate) {
      alreadySeenCount++;
    } else {
      // Step A: Save job in SQLite FIRST to prevent duplicate notifications
      const saved = saveJob({
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        source: job.source,
        published_at: job.publishedAt,
        match_score: score,
        is_notified: 0
      });

      if (saved) {
        newSavedCount++;
        newRelevantJobs.push({
          ...job,
          score,
          evaluation
        });

        // Step B: Send Telegram Notification
        try {
          const notified = await sendJobAlert(job, evaluation);
          if (notified) {
            notificationsSentCount++;
            markJobNotified(job.url);
          } else {
            notificationFailuresCount++;
          }
        } catch (err) {
          console.error(`[Processor Warning] Notification dispatch failed for ${job.url}:`, err.message);
          notificationFailuresCount++;
        }
      }
    }
  }

  // 3. Output clean processing statistics summary
  console.log('\n=== Job Processing Summary ===');
  console.log(`Fetched:               ${fetchedTotal} jobs (Djinni: ${djinniJobs.length}, RemoteOK: ${remoteOkJobs.length})`);
  console.log(`Relevant:              ${relevantCount} jobs (Score >= ${minScore})`);
  console.log(`New:                   ${newSavedCount} jobs`);
  console.log(`Already seen:          ${alreadySeenCount} jobs`);
  console.log(`Notifications sent:     ${notificationsSentCount}`);
  console.log(`Notification failures: ${notificationFailuresCount}`);
  console.log(`Low score:             ${skippedLowScoreCount} jobs skipped (< ${minScore})`);
  console.log('==============================\n');

  return {
    fetchedTotal,
    relevantCount,
    newSavedCount,
    alreadySeenCount,
    notificationsSentCount,
    notificationFailuresCount,
    skippedLowScoreCount,
    newRelevantJobs
  };
}

/**
 * Computes last 24h statistics and triggers daily summary Telegram notification.
 */
async function triggerDailySummary() {
  initializeDatabase();

  const jobsLast24h = getJobsLast24Hours();
  const minScore = parseInt(process.env.MIN_MATCH_SCORE || '70', 10);

  const discoveredTotal = jobsLast24h.length;
  const relevantJobs = jobsLast24h.filter(j => (j.match_score || 0) >= minScore);
  const newAlertsTotal = relevantJobs.filter(j => j.is_notified === 1).length;

  console.log(`[Summary] Generating Daily Summary (Discovered: ${discoveredTotal}, Relevant: ${relevantJobs.length}, Notified: ${newAlertsTotal})...`);

  const summaryData = {
    discoveredTotal,
    relevantTotal: relevantJobs.length,
    newAlertsTotal,
    jobs: relevantJobs
  };

  const success = await sendDailySummary(summaryData);
  if (success) {
    console.log('[Summary] Daily summary sent to Telegram successfully.');
  } else {
    console.warn('[Summary Warning] Could not send daily summary to Telegram.');
  }

  return summaryData;
}

module.exports = {
  processJobs,
  triggerDailySummary
};
