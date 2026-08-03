const { validationResult } = require('express-validator');
const { validationErrorResponse } = require('../utils/response');

/**
 * Middleware to handle validation results from express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));
    
    return validationErrorResponse(res, formattedErrors);
  }
  
  next();
};

module.exports = validate;
