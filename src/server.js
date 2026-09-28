const config = require('./config');
const { initDb } = require('./database/db');
const createApp = require('./app');

function start() {
  try {
    initDb();
    // eslint-disable-next-line no-console
    console.log(`[startup] Database ready at ${config.databasePath}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[startup] Failed to initialize database:', err);
    process.exit(1);
  }

  const app = createApp();

  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[startup] URLShortener listening on ${config.baseUrl} (env: ${config.env})`);
  });

  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());

  return server;
}

if (require.main === module) {
  start();
}

module.exports = start;
