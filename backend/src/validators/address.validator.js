const { body } = require('express-validator');

/**
 * Validation rules for creating/updating a saved address
 */
const addressValidation = [
  body('label')
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Label is too long'),

  body('fullName')
    .trim()
    .notEmpty()
    .withMessage('Recipient name is required')
    .isLength({ max: 100 })
    .withMessage('Recipient name is too long'),

  body('contactNumber')
    .trim()
    .notEmpty()
    .withMessage('Contact number is required')
    .matches(/^(\+63|0)?[0-9]{10}$/)
    .withMessage('Please provide a valid Philippine contact number'),

  body('municipalityId')
    .notEmpty()
    .withMessage('Municipality is required')
    .isUUID()
    .withMessage('Invalid municipality ID'),

  body('barangay')
    .trim()
    .notEmpty()
    .withMessage('Barangay is required')
    .isLength({ max: 100 })
    .withMessage('Barangay name is too long'),

  body('street')
    .trim()
    .notEmpty()
    .withMessage('Street / house address is required')
    .isLength({ max: 500 })
    .withMessage('Address is too long'),

  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be true or false'),
];

/**
 * Validation rules for updating an address (all fields optional)
 */
const addressUpdateValidation = [
  body('label').optional({ nullable: true }).trim().isLength({ max: 50 }).withMessage('Label is too long'),
  body('fullName').optional().trim().notEmpty().withMessage('Recipient name is required').isLength({ max: 100 }).withMessage('Recipient name is too long'),
  body('contactNumber').optional().trim().matches(/^(\+63|0)?[0-9]{10}$/).withMessage('Please provide a valid Philippine contact number'),
  body('municipalityId').optional().isUUID().withMessage('Invalid municipality ID'),
  body('barangay').optional().trim().notEmpty().withMessage('Barangay is required').isLength({ max: 100 }).withMessage('Barangay name is too long'),
  body('street').optional().trim().notEmpty().withMessage('Street / house address is required').isLength({ max: 500 }).withMessage('Address is too long'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be true or false'),
];

module.exports = {
  addressValidation,
  addressUpdateValidation,
};
