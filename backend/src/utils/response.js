/**
 * Standard API Response Utilities
 * Following APP_CONTEXT.md response format specifications
 */

/**
 * Send successful response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {String} message - Success message
 * @param {Number} statusCode - HTTP status code (default: 200)
 */
const successResponse = (res, data = null, message = 'Operation successful', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {String} message - Error message
 * @param {Number} statusCode - HTTP status code (default: 400)
 * @param {Array} errors - Array of error details (optional)
 */
const errorResponse = (res, message = 'Operation failed', statusCode = 400, errors = null) => {
  const response = {
    success: false,
    message,
  };
  
  if (errors) {
    response.errors = errors;
  }
  
  return res.status(statusCode).json(response);
};

/**
 * Send validation error response
 * @param {Object} res - Express response object
 * @param {Array} errors - Array of validation errors
 */
const validationErrorResponse = (res, errors) => {
  return res.status(422).json({
    success: false,
    message: 'Validation failed',
    errors,
  });
};

/**
 * Send not found response
 * @param {Object} res - Express response object
 * @param {String} resource - Resource name (e.g., 'User', 'Product')
 */
const notFoundResponse = (res, resource = 'Resource') => {
  return res.status(404).json({
    success: false,
    message: `${resource} not found`,
  });
};

/**
 * Send unauthorized response
 * @param {Object} res - Express response object
 * @param {String} message - Custom message (optional)
 */
const unauthorizedResponse = (res, message = 'Authentication required') => {
  return res.status(401).json({
    success: false,
    message,
  });
};

/**
 * Send forbidden response
 * @param {Object} res - Express response object
 * @param {String} message - Custom message (optional)
 */
const forbiddenResponse = (res, message = 'You do not have permission to access this resource') => {
  return res.status(403).json({
    success: false,
    message,
  });
};

/**
 * Send created response
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 * @param {String} message - Success message
 */
const createdResponse = (res, data, message = 'Resource created successfully') => {
  return successResponse(res, data, message, 201);
};

/**
 * Send no content response
 * @param {Object} res - Express response object
 */
const noContentResponse = (res) => {
  return res.status(204).send();
};

/**
 * Send paginated response
 * @param {Object} res - Express response object
 * @param {Array} data - Array of items
 * @param {Number} total - Total count of items
 * @param {Number} page - Current page number
 * @param {Number} pageSize - Items per page
 * @param {String} message - Success message
 */
const paginatedResponse = (res, data, total, page, pageSize, message = 'Data retrieved successfully') => {
  const totalPages = Math.ceil(total / pageSize);
  
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
};

module.exports = {
  successResponse,
  errorResponse,
  validationErrorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  createdResponse,
  noContentResponse,
  paginatedResponse,
};
