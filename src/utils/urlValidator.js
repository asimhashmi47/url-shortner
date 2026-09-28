const config = require('../config');

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Comparable "hostname:port" key. A trailing root-label dot is dropped
 * because "sho.rt." resolves to the same server as "sho.rt".
 */
function hostKey(url) {
  return `${url.hostname.toLowerCase().replace(/\.$/, '')}:${url.port}`;
}

// Host of this shortener itself (e.g. "localhost:3000"). Links pointing back
// at it are rejected so short links can't be chained to hide a destination.
const OWN_HOST = (() => {
  try {
    return hostKey(new URL(config.baseUrl));
  } catch {
    return null;
  }
})();

const INVALID_URL_REASON = 'Please provide a valid HTTP or HTTPS URL.';

/**
 * Validates a candidate URL string server-side. Returns { valid: true, url }
 * with a normalized (trimmed) string on success, or { valid: false, reason }
 * on failure. Never throws — callers decide how to surface the reason.
 */
function validateUrl(input) {
  if (typeof input !== 'string' || input.trim().length === 0) {
    return { valid: false, reason: 'URL is required.' };
  }

  const trimmed = input.trim();
  const tooLong = {
    valid: false,
    reason: `URL must be ${config.maxUrlLength} characters or fewer.`,
  };

  if (trimmed.length > config.maxUrlLength) {
    return tooLong;
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: INVALID_URL_REASON };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { valid: false, reason: INVALID_URL_REASON };
  }

  if (!parsed.hostname) {
    return { valid: false, reason: INVALID_URL_REASON };
  }

  // `https://trusted.com@evil.com` is a classic phishing disguise, and any
  // real credentials would be exposed in the public URL list and Excel export.
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URLs containing a username or password are not allowed.' };
  }

  if (OWN_HOST && hostKey(parsed) === OWN_HOST) {
    return { valid: false, reason: 'This URL is already a short link from this site.' };
  }

  const normalized = parsed.toString();

  // Normalization percent-encodes non-ASCII/unsafe characters, which can grow
  // the string several-fold; enforce the cap on what is actually stored.
  if (normalized.length > config.maxUrlLength) {
    return tooLong;
  }

  return { valid: true, url: normalized };
}

module.exports = { validateUrl, ALLOWED_PROTOCOLS };
