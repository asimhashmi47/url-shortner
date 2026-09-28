const config = require('../config');

/** Maps a DB row (snake_case) to the public API shape (camelCase). */
function serializeUrl(row) {
  return {
    id: row.id,
    shortCode: row.short_code,
    shortUrl: `${config.baseUrl}/${row.short_code}`,
    originalUrl: row.original_url,
    clickCount: row.click_count,
    createdAt: row.created_at,
  };
}

module.exports = { serializeUrl };
