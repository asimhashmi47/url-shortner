const AppError = require('../utils/AppError');

/**
 * Centralized error handler. Known AppErrors are translated to their
 * intended status/code/message. Anything else (programming errors, DB
 * failures, etc.) is logged server-side and returned as a generic 500 with
 * no internal detail leaked to the client.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
  }

  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' },
    });
  }

  if (err && err.status === 400 && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    });
  }

  // Other client errors raised by Express/body-parser (malformed %-encoding in
  // a path param, unsupported body encoding, aborted request, ...). These are
  // the client's fault, not ours: return a generic 4xx and skip the stack
  // trace log so junk requests can't flood the logs.
  const status = err && (err.status || err.statusCode);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({
      error: { code: 'BAD_REQUEST', message: 'The request could not be processed.' },
    });
  }

  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);

  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
}

function notFoundApiHandler(req, res) {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  });
}

module.exports = { errorHandler, notFoundApiHandler };
