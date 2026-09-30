# QA Job Alert System

A personal job-alert system built with Node.js to monitor legitimate job sources for new QA/software testing roles, filter them against actual QA experience, prevent duplicate alerts, and send immediate notifications.

## Project Structure

```
qa-job-alert/
├── src/
│   ├── sources/        # Job source fetchers / integrators
│   ├── matching/       # Rule/experience matching logic
│   ├── notifications/  # Notification services (e.g. Telegram)
│   ├── database/       # SQLite database connection and operations
│   └── index.js        # Main entry point
├── .env.example        # Environment variable template
├── .gitignore          # Git ignore configuration
├── package.json        # Node.js dependencies and scripts
└── README.md           # Documentation
```

## Getting Started

1. Clone or navigate to the repository.
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the application:
   ```bash
   npm start
   ```
