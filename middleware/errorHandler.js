const logger = require('../utils/logger');

// R2 — Central Express error handler (must be registered last in server.js)
// Route handlers call next(err) to reach here, or throw inside async wrappers.
function errorHandler(err, req, res, next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  logger.error('Unhandled route error', {
    status,
    method: req.method,
    url: req.originalUrl,
    err: message,
  });

  if (res.headersSent) return next(err);

  res.status(status).json({ ok: false, error: message });
}

module.exports = errorHandler;
