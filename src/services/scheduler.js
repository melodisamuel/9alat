const cron = require('node-cron');
require('dotenv').config();
const { processJobs, triggerDailySummary } = require('./jobProcessor');
const { initializeDatabase } = require('../database/jobs');

let isRunning = false;

/**
 * Executes a single job checking pass with concurrency lock to prevent overlapping runs.
 */
async function runJobCheck() {
  if (isRunning) {
    console.warn('[Scheduler] Previous check still running, skipping this tick.');
    return;
  }

  isRunning = true;
  console.log('[Scheduler] Starting job check...');

  try {
    await processJobs();
    console.log('[Scheduler] Finished job check.');
  } catch (error) {
    console.error('[Scheduler Error] Job check failed:', error.message);
  } finally {
    isRunning = false;
  }
}

/**
 * Initializes database, performs immediate startup check, and starts node-cron scheduler.
 */
async function startScheduler() {
  initializeDatabase();

  const jobCron = process.env.JOB_CHECK_CRON || process.env.CRON_SCHEDULE || '*/5 * * * *';
  const summaryCron = process.env.DAILY_SUMMARY_CRON || '0 18 * * *';

  if (!cron.validate(jobCron)) {
    console.error(`[Scheduler Error] Invalid job check cron expression: "${jobCron}"`);
    return;
  }

  // 1. Initial immediate run on startup
  console.log('[Scheduler] Executing initial job check on startup...');
  await runJobCheck();

  // 2. Schedule recurring job check task
  console.log(`[Scheduler] Next job check scheduled with cron expression: "${jobCron}"`);
  cron.schedule(jobCron, () => {
    runJobCheck();
  });

  // 3. Schedule daily summary cron task
  if (cron.validate(summaryCron)) {
    console.log(`[Scheduler] Daily summary scheduled with cron expression: "${summaryCron}"`);
    cron.schedule(summaryCron, () => {
      triggerDailySummary().catch(err => {
        console.error('[Scheduler Error] Daily summary failed:', err.message);
      });
    });
  } else {
    console.warn(`[Scheduler Warning] Invalid daily summary cron expression: "${summaryCron}"`);
  }
}

module.exports = {
  startScheduler,
  runJobCheck,
  triggerDailySummary
};
