const { nanoid } = require('nanoid');
const urlRepository = require('../repositories/urlRepository');

const CODE_LENGTH = 7;
const MAX_ATTEMPTS = 5;

/**
 * Generates a random, URL-safe short code and guards against the
 * (extremely unlikely) case of a collision with an existing code by
 * retrying a bounded number of times before giving up loudly.
 */
function generateUniqueShortCode(excludeSet) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = nanoid(CODE_LENGTH);
    const collidesWithBatch = excludeSet instanceof Set && excludeSet.has(code);
    if (!collidesWithBatch && !urlRepository.shortCodeExists(code)) {
      return code;
    }
  }
  throw new Error('Failed to generate a unique short code after multiple attempts.');
}

module.exports = { generateUniqueShortCode, CODE_LENGTH };
