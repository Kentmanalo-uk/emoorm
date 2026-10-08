const { param, body } = require('express-validator');

const statusValidation = [
  param('token')
    .trim()
    .notEmpty()
    .withMessage('Token is required')
    .isLength({ min: 8, max: 200 })
    .withMessage('Invalid token'),
];

const scanValidation = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('QR code value is required')
    .isLength({ min: 8, max: 200 })
    .withMessage('Invalid QR code'),
];

const approveValidation = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Token is required')
    .isLength({ min: 8, max: 200 })
    .withMessage('Invalid token'),
  body('approve')
    .isBoolean()
    .withMessage('approve must be a boolean'),
  // The authenticator code, for accounts with two-factor sign-in on.
  body('code')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ min: 6, max: 12 })
    .withMessage('Invalid code'),
];

module.exports = {
  statusValidation,
  scanValidation,
  approveValidation,
};
