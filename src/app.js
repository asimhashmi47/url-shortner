const path = require('path');
const express = require('express');
const morgan = require('morgan');
const config = require('./config');
const securityHeaders = require('./middleware/security');
const { errorHandler, notFoundApiHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/apiRoutes');
const redirectRoute = require('./routes/redirectRoute');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // See config.trustProxy: keeps req.ip (the rate-limit key) accurate and
  // unspoofable whether or not the app sits behind a reverse proxy.
  app.set('trust proxy', config.trustProxy);
  app.use(securityHeaders);
  // No CORS middleware: the frontend is served from this same Express app
  // (same-origin), and the API needs no cross-origin access. Adding a
  // permissive `cors()` here would only widen the attack surface (e.g.
  // letting any third-party page read /api/urls from a visitor's browser).
  app.use(express.json({ limit: config.jsonBodyLimit }));

  if (config.env !== 'test') {
    app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
  }

  app.use(express.static(path.join(__dirname, '..', 'public')));

  // API routes are registered before the catch-all redirect route so they
  // can never be shadowed by it.
  app.use('/api', apiRoutes);
  app.use('/api', notFoundApiHandler);

  // Catch-all short-code redirect. Must come after /api.
  app.use('/', redirectRoute);

  // Anything left over (malformed short-code shape, unknown web path) gets
  // the same friendly 404 page as an unknown-but-valid-shaped short code.
  app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, '..', 'public', '404.html'));
  });

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
