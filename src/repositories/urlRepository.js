const { getDb } = require('../database/db');

/** All SQL access for the `urls` table lives here, using parameterized
 * statements exclusively — never string-concatenated SQL. */

function insertUrl({ shortCode, originalUrl }) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO urls (short_code, original_url) VALUES (@shortCode, @originalUrl)`
  );
  const info = stmt.run({ shortCode, originalUrl });
  return findById(info.lastInsertRowid);
}

function insertManyUrls(rows) {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO urls (short_code, original_url) VALUES (@shortCode, @originalUrl)`
  );
  const insertAll = db.transaction((items) => {
    const ids = [];
    for (const item of items) {
      const info = stmt.run(item);
      ids.push(info.lastInsertRowid);
    }
    return ids;
  });
  const ids = insertAll(rows);
  return ids.map((id) => findById(id));
}

function findById(id) {
  const db = getDb();
  return db.prepare(`SELECT * FROM urls WHERE id = ?`).get(id);
}

function findByShortCode(shortCode) {
  const db = getDb();
  return db.prepare(`SELECT * FROM urls WHERE short_code = ?`).get(shortCode);
}

function shortCodeExists(shortCode) {
  const db = getDb();
  const row = db.prepare(`SELECT 1 FROM urls WHERE short_code = ?`).get(shortCode);
  return Boolean(row);
}

function findAll({ ids } = {}) {
  const db = getDb();
  // `ids: undefined` (the key simply absent) means "no filter, return
  // everything". An explicit array — including an empty one — means the
  // caller asked to filter to a specific set, so an empty array correctly
  // yields no rows rather than silently falling back to "all".
  if (Array.isArray(ids)) {
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => '?').join(',');
    return db
      .prepare(`SELECT * FROM urls WHERE id IN (${placeholders}) ORDER BY created_at DESC, id DESC`)
      .all(...ids);
  }
  return db.prepare(`SELECT * FROM urls ORDER BY created_at DESC, id DESC`).all();
}

function getStats() {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS totalUrls, COALESCE(SUM(click_count), 0) AS totalClicks FROM urls`)
    .get();
  return { totalUrls: row.totalUrls, totalClicks: row.totalClicks };
}

function incrementClickCount(shortCode) {
  const db = getDb();
  db.prepare(
    `UPDATE urls SET click_count = click_count + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE short_code = ?`
  ).run(shortCode);
}

function deleteById(id) {
  const db = getDb();
  const info = db.prepare(`DELETE FROM urls WHERE id = ?`).run(id);
  return info.changes > 0;
}

module.exports = {
  insertUrl,
  insertManyUrls,
  findById,
  findByShortCode,
  shortCodeExists,
  findAll,
  getStats,
  incrementClickCount,
  deleteById,
};
