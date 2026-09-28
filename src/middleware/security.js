const helmet = require('helmet');

/**
 * Helmet with a restrictive CSP suited to this app: same-origin only, no
 * inline script execution, no framing. The frontend is plain JS files
 * served from /js so 'unsafe-inline' is never needed for scripts.
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-origin' },
});

module.exports = securityHeaders;
