require('dotenv').config();

/**
 * Express 'trust proxy' setting. Off by default (req.ip = socket address, so
 * X-Forwarded-For can't be spoofed to dodge rate limits). Behind a reverse
 * proxy, set TRUST_PROXY to the number of proxy hops (usually 1) so rate
 * limiting keys on the real client IP instead of lumping everyone together.
 * A bare "true" (trust any X-Forwarded-For) is deliberately treated as 1 hop.
 */
function parseTrustProxy(value) {
  if (!value || value === 'false' || value === '0') return false;
  if (value === 'true') return 1;
  if (/^\d+$/.test(value)) return Number(value);
  return value; // e.g. "loopback" or a comma-separated list of proxy IPs/subnets
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  databasePath: process.env.DATABASE_PATH || './data/urls.db',
  bulkMaxUrls: Number(process.env.BULK_MAX_URLS) || 100,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  rateLimit: {
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    max: Number(process.env.RATE_LIMIT_MAX) || 30,
    exportMax: Number(process.env.RATE_LIMIT_EXPORT_MAX) || 10,
  },
  maxUrlLength: 2048,
  jsonBodyLimit: '100kb',
};

module.exports = config;
