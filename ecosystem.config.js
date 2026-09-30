module.exports = {
  apps: [
    {
      name: 'qa-job-alert',
      script: 'src/index.js',
      instances: 1, // Single instance runner to prevent overlapping cron triggers
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env_production: {
        NODE_ENV: 'production'
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true
    }
  ]
};
