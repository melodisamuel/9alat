require('dotenv').config();
const { startScheduler } = require('./services/scheduler');

// Global error handlers to prevent unhandled promise rejections or crashes from downing the process
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] Reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception] Error:', error.message);
});

/**
 * Handles graceful shutdown for process signals (SIGINT, SIGTERM) sent by PM2 or Linux OS.
 */
function setupGracefulShutdown() {
  const shutdown = (signal) => {
    console.log(`\n[Process] Received ${signal}. Shutting down QA Job Alert Service gracefully...`);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main() {
  console.log('QA Job Alert Service has started successfully.\n');
  setupGracefulShutdown();
  await startScheduler();
}

main();
