const { validationResult } = require('express-validator');
const { validationErrorResponse } = require('../utils/response');

/**
 * Middleware to handle validation results from express-validator
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    // The submitted value is not sent back: on a sign-up or password change it
    // is the password, and it would end up in logs and browser history tools.
    const formattedErrors = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
    }));
    
    return validationErrorResponse(res, formattedErrors);
  }
  
  next();
};

module.exports = validate;
