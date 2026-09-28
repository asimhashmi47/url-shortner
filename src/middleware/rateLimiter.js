const rateLimit = require('express-rate-limit');
const config = require('../config');

const RATE_LIMITED_BODY = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please slow down and try again shortly.',
  },
};

/**
 * Applied to state-changing endpoints (create, bulk create, delete). Kept
 * lenient enough that local dev/testing isn't hindered, per product
 * requirements. One shared budget, so mixing endpoints doesn't multiply it.
 */
const writeRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMITED_BODY,
});

/**
 * Excel export builds the whole workbook in memory, making it by far the most
 * expensive request per call; it gets its own, separate budget.
 */
const exportRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.exportMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMITED_BODY,
});

module.exports = { writeRateLimiter, exportRateLimiter };
