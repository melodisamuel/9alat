const axios = require('axios');
require('dotenv').config();

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sanitizes strings to ensure bot tokens are never logged.
 * @param {string} str - Raw input string
 * @returns {string} Sanitized string
 */
function sanitizeSecrets(str) {
  if (!str) return '';
  return String(str).replace(/\d+:[A-Za-z0-9_-]{20,}/g, '[REDACTED_BOT_TOKEN]');
}

/**
 * Validates Telegram configuration variables.
 * @param {Object} options - Configuration options
 * @param {boolean} options.fatalInProduction - Whether to throw an error if missing in production
 * @returns {boolean} Whether Telegram config is valid
 */
function verifyTelegramConfig({ fatalInProduction = false } = {}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const isProduction = process.env.NODE_ENV === 'production';

  const isMissingOrPlaceholder =
    !token ||
    !chatId ||
    token.includes('your_telegram_bot_token') ||
    chatId.includes('your_telegram_chat_id');

  if (isMissingOrPlaceholder) {
    const errorMsg = '[Telegram Config Error] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing or contains placeholder values in .env';
    if (fatalInProduction || isProduction) {
      throw new Error(errorMsg);
    }
    console.warn(errorMsg);
    return false;
  }
  return true;
}

/**
 * Sends HTTP POST request to Telegram API with timeout and retries for transient errors.
 * @param {string} url - Telegram Bot API URL
 * @param {Object} payload - Message payload
 * @param {number} retries - Number of retry attempts
 * @param {number} delayMs - Delay between retries in milliseconds
 * @returns {Promise<boolean>} Success status
 */
async function sendRequestWithRetry(url, payload, retries = 2, delayMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        url,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        }
      );

      if (response.data && response.data.ok) {
        return true;
      }
    } catch (error) {
      const status = error.response ? error.response.status : null;
      const isTransient = !status || status === 429 || (status >= 500 && status < 600);

      const rawErrorDesc = error.response && error.response.data
        ? JSON.stringify(error.response.data)
        : error.message;
      const sanitizedErrorDesc = sanitizeSecrets(rawErrorDesc);

      if (attempt < retries && isTransient) {
        console.warn(`[Telegram Retry] Attempt ${attempt + 1} failed (${sanitizedErrorDesc}). Retrying in ${delayMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        console.error(`[Telegram Error] Failed to send notification (Attempt ${attempt + 1}/${retries + 1}): ${sanitizedErrorDesc}`);
        return false;
      }
    }
  }
  return false;
}

/**
 * Sends a raw HTML-formatted Telegram message.
 * @param {string} message - HTML message content
 * @returns {Promise<boolean>} Success status
 */
async function sendTelegramMessage(message) {
  if (!verifyTelegramConfig()) {
    return false;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const payload = {
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: false
  };

  return await sendRequestWithRetry(url, payload);
}

/**
 * Formats and sends a structured job alert message via Telegram.
 * @param {Object} job - The job object
 * @param {Object} matchResult - The evaluation result
 * @returns {Promise<boolean>} Success status
 */
async function sendJobAlert(job, matchResult) {
  if (!job) return false;

  const score = matchResult ? matchResult.score : (job.match_score || 0);
  const keywords = (matchResult && matchResult.matchedKeywords) || [];
  const reasons = (matchResult && matchResult.reasons) || [];

  const highlights = keywords.length > 0
    ? keywords.slice(0, 6).map(kw => `✓ ${kw.toUpperCase()}`)
    : (reasons.length > 0 ? reasons.slice(0, 4).map(r => `✓ ${r}`) : ['✓ Relevant QA Profile Match']);

  const messageLines = [
    '🚨 <b>NEW QA ROLE</b>\n',
    `<b>${escapeHtml(job.title)}</b>\n`,
    `<b>Company:</b> ${escapeHtml(job.company || 'N/A')}`,
    `<b>Location:</b> ${escapeHtml(job.location || 'Unspecified')}`,
    `<b>Match:</b> ${score}%\n`,
    '<b>Why it matches:</b>',
    ...highlights,
    '',
    `<b>Source:</b> ${escapeHtml(job.source || 'Djinni')}\n`,
    '<b>Apply:</b>',
    job.url
  ];

  const formattedMessage = messageLines.join('\n');
  return await sendTelegramMessage(formattedMessage);
}

/**
 * Formats and sends the Daily QA Job Summary to Telegram.
 * @param {Object} summaryData
 * @param {number} summaryData.discoveredTotal - Total jobs discovered in last 24h
 * @param {number} summaryData.relevantTotal - Total relevant jobs (score >= MIN_MATCH_SCORE)
 * @param {number} summaryData.newAlertsTotal - Total new notifications sent
 * @param {Array<Object>} summaryData.jobs - List of jobs from last 24h
 * @returns {Promise<boolean>} Success status
 */
async function sendDailySummary(summaryData) {
  const discovered = summaryData.discoveredTotal || 0;
  const relevant = summaryData.relevantTotal || 0;
  const newAlerts = summaryData.newAlertsTotal || 0;
  const jobs = summaryData.jobs || [];

  const tier90to100 = jobs.filter(j => (j.match_score || 0) >= 90 && (j.match_score || 0) <= 100);
  const tier80to89 = jobs.filter(j => (j.match_score || 0) >= 80 && (j.match_score || 0) <= 89);
  const tier70to79 = jobs.filter(j => (j.match_score || 0) >= 70 && (j.match_score || 0) <= 79);

  function formatTier(tierJobs) {
    if (!tierJobs || tierJobs.length === 0) {
      return '- None';
    }
    return tierJobs
      .slice(0, 5)
      .map(j => `- ${escapeHtml(j.title)} — ${escapeHtml(j.company || 'N/A')}`)
      .join('\n');
  }

  const messageLines = [
    '📊 <b>DAILY QA JOB SUMMARY</b>\n',
    `<b>Jobs discovered:</b> ${discovered}`,
    `<b>Relevant jobs:</b> ${relevant}`,
    `<b>New alerts:</b> ${newAlerts}\n`,
    '<b>90–100 Match</b>',
    formatTier(tier90to100),
    '',
    '<b>80–89 Match</b>',
    formatTier(tier80to89),
    '',
    '<b>70–79 Match</b>',
    formatTier(tier70to79)
  ];

  const formattedMessage = messageLines.join('\n');
  return await sendTelegramMessage(formattedMessage);
}

// Standalone CLI test runner
if (require.main === module) {
  console.log('--- Testing Telegram Notification Module ---\n');

  const testJob = {
    title: 'Senior Backend QA Engineer',
    company: 'Fintech Corp',
    location: 'Remote',
    url: 'https://example.com/jobs/qa-engineer-test',
    source: 'Djinni'
  };

  const testMatchResult = {
    score: 91,
    matchedKeywords: ['api testing', 'postman', 'backend testing', 'mobile testing'],
    reasons: ['Title matches target role (+40 pts)']
  };

  sendJobAlert(testJob, testMatchResult).then(success => {
    if (success) {
      console.log('SUCCESS: Telegram test job alert sent successfully!');
    } else {
      console.log('NOTICE: Telegram test notification was not sent. Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.');
    }
  });
}

module.exports = {
  verifyTelegramConfig,
  sendTelegramMessage,
  sendJobAlert,
  sendDailySummary,
  sanitizeSecrets
};
