const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(process.cwd(), 'jobs.db');

let db;

function getDb() {
  if (!db) {
    try {
      db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
    } catch (err) {
      console.error(`[Database Error] Failed to open SQLite database at ${dbPath}:`, err.message);
      throw err;
    }
  }
  return db;
}

function initializeDatabase() {
  try {
    const instance = getDb();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        company TEXT,
        location TEXT,
        description TEXT,
        source TEXT NOT NULL,
        published_at TEXT,
        discovered_at TEXT DEFAULT (datetime('now')),
        match_score REAL DEFAULT 0,
        is_notified INTEGER DEFAULT 0
      );
    `;

    instance.exec(createTableQuery);

    const createIndexQuery = `
      CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_url ON jobs (url);
    `;
    instance.exec(createIndexQuery);
  } catch (err) {
    console.error('[Database Error] Initialization failed:', err.message);
  }
}

function jobExists(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const instance = getDb();
    const stmt = instance.prepare('SELECT 1 FROM jobs WHERE url = ?');
    const result = stmt.get(url);
    return Boolean(result);
  } catch (err) {
    console.error(`[Database Error] Failed to check if job exists (${url}):`, err.message);
    return false;
  }
}

function saveJob(job) {
  if (!job || !job.url || !job.title || !job.source) {
    console.warn('[Database Warning] Cannot save job missing required fields (url, title, source).');
    return false;
  }

  try {
    const instance = getDb();
    const stmt = instance.prepare(`
      INSERT INTO jobs (
        url,
        title,
        company,
        location,
        description,
        source,
        published_at,
        discovered_at,
        match_score,
        is_notified
      ) VALUES (
        @url,
        @title,
        @company,
        @location,
        @description,
        @source,
        @published_at,
        @discovered_at,
        @match_score,
        @is_notified
      )
      ON CONFLICT(url) DO NOTHING
    `);

    const info = stmt.run({
      url: String(job.url),
      title: String(job.title),
      company: job.company ? String(job.company) : null,
      location: job.location ? String(job.location) : null,
      description: job.description ? String(job.description) : null,
      source: String(job.source),
      published_at: job.published_at ? String(job.published_at) : null,
      discovered_at: job.discovered_at ? String(job.discovered_at) : new Date().toISOString(),
      match_score: typeof job.match_score === 'number' ? job.match_score : 0,
      is_notified: job.is_notified ? 1 : 0
    });

    return info.changes > 0;
  } catch (err) {
    console.error(`[Database Error] Failed to save job (${job.url}):`, err.message);
    return false;
  }
}

function markJobNotified(url) {
  if (!url) return false;
  try {
    const instance = getDb();
    const stmt = instance.prepare('UPDATE jobs SET is_notified = 1 WHERE url = ?');
    const info = stmt.run(url);
    return info.changes > 0;
  } catch (err) {
    console.error(`[Database Error] Failed to mark job as notified (${url}):`, err.message);
    return false;
  }
}

function getJobByUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  try {
    const instance = getDb();
    const stmt = instance.prepare('SELECT * FROM jobs WHERE url = ?');
    return stmt.get(url) || null;
  } catch (err) {
    console.error(`[Database Error] Failed to fetch job by url (${url}):`, err.message);
    return null;
  }
}

function getRecentJobs(limit = 10) {
  try {
    const instance = getDb();
    const stmt = instance.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT ?');
    return stmt.all(limit);
  } catch (err) {
    console.error('[Database Error] Failed to fetch recent jobs:', err.message);
    return [];
  }
}

function getJobsLast24Hours() {
  try {
    const instance = getDb();
    const twentyFourHoursAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stmt = instance.prepare(`
      SELECT * FROM jobs 
      WHERE discovered_at >= ? OR discovered_at >= datetime('now', '-24 hours')
      ORDER BY match_score DESC
    `);
    return stmt.all(twentyFourHoursAgoIso);
  } catch (err) {
    console.error('[Database Error] Failed to fetch jobs for last 24 hours:', err.message);
    return [];
  }
}

module.exports = {
  initializeDatabase,
  jobExists,
  saveJob,
  markJobNotified,
  getJobByUrl,
  getRecentJobs,
  getJobsLast24Hours
};
