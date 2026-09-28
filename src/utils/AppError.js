/**
 * Domain error carrying an HTTP status code and a stable machine-readable code.
 * Thrown from services/controllers and translated into the standard JSON
 * error envelope by the centralized error-handling middleware.
 */
class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = AppError;
