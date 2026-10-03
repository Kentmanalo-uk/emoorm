const config = require('../config/env');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// An optional error tracker (lib/errorTracking.js) gets every 5xx too.
let reportError = null;
try {
  // eslint-disable-next-line global-require
  ({ reportError } = require('../lib/errorTracking'));
} catch { /* no tracker */ }

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // `statusCode` is our own ApiError convention; `status` is what Express and
  // its middleware set (express.static uses it for a missing file). Reading
  // only the first turned every 404 from those into a 500, which buries real
  // faults in monitoring under a pile of missing images.
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;

  // A missing file is not a server fault. serve-static surfaces it as an
  // ENOENT, which fell through to the Prisma branch below and was reported as
  // "Database operation failed" with a 500 — misleading in the response and
  // in monitoring.
  // The database was briefly unreachable, its connections all taken, or the
  // pool wait ran out. Nothing about the request was wrong: say "busy, try
  // again" (503 + Retry-After, which the web app retries once for reads)
  // rather than a 500 carrying Prisma's text, which names the database host.
  const dbCode = err.errorCode || err.code;
  const dbUnavailable = ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(dbCode)
    || err.name === 'PrismaClientInitializationError'
    || err.name === 'PrismaClientRustPanicError';

  if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
    statusCode = 404;
    message = 'Not found';
  } else if (dbUnavailable) {
    statusCode = 503;
    message = 'The service is busy right now. Please try again.';
    errors = null;
    res.set('Retry-After', '1');
  } else if (err.code && String(err.code).startsWith('P')) {
    // Prisma error codes are all P-prefixed (P1xxx, P2xxx). Matching on the
    // presence of `code` alone swept in every Node system error too.
    switch (err.code) {
      case 'P2002':
        // Unique constraint violation
        statusCode = 409;
        message = 'A record with this value already exists';
        const target = err.meta?.target;
        if (target) {
          errors = [`${target.join(', ')} must be unique`];
        }
        break;

      case 'P2025':
        // Record not found
        statusCode = 404;
        message = 'Record not found';
        break;

      case 'P2003':
        // Foreign key constraint violation
        statusCode = 400;
        message = 'Related record not found';
        break;

      case 'P2014':
        // Invalid relation
        statusCode = 400;
        message = 'Invalid relationship between records';
        break;

      default:
        statusCode = 500;
        message = 'Database operation failed';
    }
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Handle validation errors
  if (err.name === 'ValidationError') {
    statusCode = 422;
    message = 'Validation failed';
  }

  // Handle multer errors (file upload)
  if (err.name === 'MulterError') {
    statusCode = 400;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'File too large';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field';
    }
  }

  // File-filter and upload validation errors are client input errors.
  if (err.message?.startsWith('Invalid file type') || err.message?.startsWith('Only image files')) {
    statusCode = 400;
    message = err.message;
  }

  // A query the database layer could not even build (a list where one value
  // was expected, e.g. ?storeId=a&storeId=b) is a bad request, not a fault.
  if (err.name === 'PrismaClientValidationError') {
    statusCode = 400;
    message = 'Invalid request';
    errors = null;
  }

  // Our own failures (not an ApiError we raised on purpose) say nothing about
  // the inside: Prisma's text, file paths and model names stay in the log.
  const unexpected = statusCode >= 500 && !(err instanceof ApiError);
  if (unexpected && !dbUnavailable) {
    message = 'Something went wrong on our side. Please try again.';
    errors = null;
  }

  // Every server-side failure is logged, in production too (one JSON line, so
  // the host's log viewer and any log tool can read it); in development the
  // readable form for every error.
  if (config.nodeEnv !== 'production') {
    console.error('Error:', {
      message: err.message,
      statusCode,
      stack: err.stack,
      errors,
    });
  } else if (statusCode >= 500) {
    console.error(JSON.stringify({
      level: 'error',
      time: new Date().toISOString(),
      status: statusCode,
      method: req.method,
      path: req.originalUrl?.split('?')[0],
      user: req.user?.id || null,
      name: err.name,
      code: err.code || err.errorCode || null,
      message: err.message,
      stack: String(err.stack || '').split('\n').slice(0, 8).join('\n'),
    }));
  }
  reportError?.(err, req, statusCode);

  // Send error response
  const response = {
    success: false,
    message,
  };

  if (errors) {
    response.errors = errors;
  }

  // Stack traces leak absolute paths and internal structure, so they are
  // opt-IN. This deliberately reads process.env directly rather than
  // config.nodeEnv, which defaults to 'development' when the variable is
  // unset — a deploy that forgets NODE_ENV would otherwise start handing
  // stack traces to the internet. An absent variable must fail safe.
  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  // The path is not echoed back: reflecting attacker-controlled text into a
  // response is a habit worth not having, and it tells a prober nothing
  // useful anyway.
  res.status(404).json({
    success: false,
    message: 'The requested endpoint does not exist',
  });
};

/**
 * Async handler wrapper to catch errors in async route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
  asyncHandler,
};
