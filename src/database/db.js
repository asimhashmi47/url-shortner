const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

let db;

/**
 * Opens (creating if necessary) the SQLite database file and ensures the
 * schema exists. Safe to call once at startup; the connection is reused
 * everywhere else via getDb().
 */
function initDb() {
  const dbPath = config.databasePath;

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      short_code TEXT NOT NULL UNIQUE,
      original_url TEXT NOT NULL,
      click_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_urls_created_at ON urls (created_at);
  `);

  return db;
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

module.exports = { initDb, getDb, closeDb };
