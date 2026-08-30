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
];

module.exports = {
  statusValidation,
  scanValidation,
  approveValidation,
};
