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

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors || null;
  
  // Handle Prisma errors
  if (err.code) {
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
  
  // Log error in development
  if (config.nodeEnv === 'development') {
    console.error('Error:', {
      message: err.message,
      statusCode,
      stack: err.stack,
      errors,
    });
  }
  
  // Send error response
  const response = {
    success: false,
    message,
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  // Include stack trace in development
  if (config.nodeEnv === 'development' && err.stack) {
    response.stack = err.stack;
  }
  
  res.status(statusCode).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.url} not found`,
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
