const config = require('../config');
const urlRepository = require('../repositories/urlRepository');
const { generateUniqueShortCode } = require('./shortCodeService');
const { validateUrl } = require('../utils/urlValidator');
const { serializeUrl } = require('../utils/serializeUrl');
const AppError = require('../utils/AppError');

function createShortUrl(rawUrl) {
  if (rawUrl === undefined || rawUrl === null || rawUrl === '') {
    throw new AppError(400, 'MISSING_URL', 'A URL is required.');
  }

  const result = validateUrl(rawUrl);
  if (!result.valid) {
    throw new AppError(400, 'INVALID_URL', result.reason);
  }

  const shortCode = generateUniqueShortCode();
  const row = urlRepository.insertUrl({ shortCode, originalUrl: result.url });
  return serializeUrl(row);
}

function listUrls() {
  const rows = urlRepository.findAll();
  const stats = urlRepository.getStats();
  return { urls: rows.map(serializeUrl), stats };
}

function getUrlById(id) {
  const row = urlRepository.findById(id);
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'URL not found.');
  }
  return serializeUrl(row);
}

function deleteUrl(id) {
  const deleted = urlRepository.deleteById(id);
  if (!deleted) {
    throw new AppError(404, 'NOT_FOUND', 'URL not found.');
  }
}

/**
 * Validates and creates many URLs in one batch. Never throws for individual
 * bad entries — those are collected and returned as `invalid`. Only throws
 * for structural problems (empty batch, batch too large).
 */
function bulkCreate(rawUrls) {
  if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
    throw new AppError(400, 'EMPTY_BATCH', 'Provide at least one URL.');
  }

  if (rawUrls.length > config.bulkMaxUrls) {
    throw new AppError(
      400,
      'BATCH_TOO_LARGE',
      `A maximum of ${config.bulkMaxUrls} URLs can be submitted at once.`
    );
  }

  const invalid = [];
  const toInsert = [];
  const seen = new Set();
  const usedCodes = new Set();

  for (const raw of rawUrls) {
    const result = validateUrl(raw);
    if (!result.valid) {
      invalid.push({ url: describeInvalidEntry(raw), reason: result.reason });
      continue;
    }
    if (seen.has(result.url)) {
      invalid.push({ url: result.url, reason: 'Duplicate URL in this batch.' });
      continue;
    }
    seen.add(result.url);
    const shortCode = generateUniqueShortCode(usedCodes);
    usedCodes.add(shortCode);
    toInsert.push({ shortCode, originalUrl: result.url });
  }

  const created = toInsert.length > 0 ? urlRepository.insertManyUrls(toInsert) : [];

  return { created: created.map(serializeUrl), invalid };
}

const MAX_ECHO_LENGTH = 300;

/**
 * Safe, bounded echo of a rejected bulk entry. `String(raw)` would throw on
 * JSON objects like `{"toString":1}` (-> 500), and echoing oversized entries
 * back verbatim just amplifies the response.
 */
function describeInvalidEntry(raw) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw) ?? String(raw);
  return text.length > MAX_ECHO_LENGTH ? `${text.slice(0, MAX_ECHO_LENGTH)}…` : text;
}

module.exports = { createShortUrl, listUrls, getUrlById, deleteUrl, bulkCreate };
