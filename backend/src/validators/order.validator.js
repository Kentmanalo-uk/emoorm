const { body, validationResult } = require('express-validator');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Order validation rules.
 *
 * These reject a request with 400 and the first failing rule's message, so
 * the buyer sees a single, plain sentence rather than a field list.
 */

const PAYMENT_METHODS = ['COD', 'GCASH', 'QRPH'];
const FULFILLMENT_METHODS = ['DELIVERY', 'PICKUP'];
const VERIFY_STATUSES = ['PAID', 'FAILED', 'REFUNDED'];

// Local mobile (09XXXXXXXXX) or its international form (+639XXXXXXXXX),
// once spaces and dashes are stripped.
const PH_MOBILE = /^(09\d{9}|\+639\d{9})$/;
const PAYMENT_REFERENCE = /^[A-Za-z0-9 -]+$/;
const PAYMENT_PROOF_URL = /^\/uploads\/[A-Za-z0-9._-]+\.(jpe?g|png|webp)$/i;

const stripPhone = (value) => String(value ?? '').replace(/[\s-]/g, '');

const isBlank = (value) => value === undefined || value === null || value === '';

const paymentReferenceRule = (field = 'paymentReference') => body(field)
  .customSanitizer((value) => (isBlank(value) ? value : String(value).trim()));

const paymentReferenceChecks = (chain) => chain
  .isLength({ min: 4, max: 64 })
  .withMessage('Payment reference must be 4 to 64 characters')
  .matches(PAYMENT_REFERENCE)
  .withMessage('Payment reference may only contain letters, numbers, spaces and dashes');

const paymentProofChecks = (chain) => chain
  .isString()
  .withMessage('Payment proof must be an uploaded image')
  .isLength({ max: 255 })
  .withMessage('Payment proof path is too long')
  .matches(PAYMENT_PROOF_URL)
  .withMessage('Payment proof must be an uploaded JPG, PNG or WEBP image');

const optionalText = (field, max, label) => body(field)
  .optional({ nullable: true })
  .isString()
  .withMessage(`${label} must be text`)
  .isLength({ max })
  .withMessage(`${label} must be at most ${max} characters`);

const createOrderValidation = [
  body('paymentMethod')
    .optional()
    .customSanitizer((value) => String(value).trim().toUpperCase())
    .custom((value) => {
      if (value === 'BANK_TRANSFER') throw new Error('Bank transfer is not available yet');
      if (!PAYMENT_METHODS.includes(value)) throw new Error('Invalid payment method');
      return true;
    }),

  body('fulfillmentMethod')
    .optional()
    .customSanitizer((value) => String(value).trim().toUpperCase())
    .isIn(FULFILLMENT_METHODS)
    .withMessage('Invalid fulfillment method'),

  body('contactNumber')
    .customSanitizer(stripPhone)
    .notEmpty()
    .withMessage('Contact number is required')
    .matches(PH_MOBILE)
    .withMessage('Please provide a valid Philippine mobile number (09XXXXXXXXX)'),

  paymentReferenceChecks(paymentReferenceRule().optional({ nullable: true, checkFalsy: true })),

  paymentProofChecks(body('paymentProofUrl').optional({ nullable: true, checkFalsy: true })),

  body('items')
    .isArray({ min: 1, max: 50 })
    .withMessage('Order must contain between 1 and 50 items'),
  body('items.*.productId')
    .isString()
    .withMessage('Each item needs a product')
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('Invalid product reference'),
  body('items.*.quantity')
    .isInt({ min: 1, max: 9999 })
    .withMessage('Each item quantity must be a whole number between 1 and 9999')
    .toInt(),

  optionalText('deliveryAddress', 500, 'Delivery address'),
  optionalText('deliveryNotes', 1000, 'Delivery notes'),
  optionalText('checkoutKey', 100, 'Checkout key'),
  optionalText('voucherCode', 64, 'Voucher code'),
];

const paymentProofValidation = [
  paymentReferenceChecks(
    paymentReferenceRule().notEmpty().withMessage('Payment reference is required'),
  ),
  paymentProofChecks(
    body('paymentProofUrl').notEmpty().withMessage('Payment proof is required'),
  ),
];

const verifyPaymentValidation = [
  body('paymentStatus')
    .customSanitizer((value) => String(value ?? '').trim().toUpperCase())
    .isIn(VERIFY_STATUSES)
    .withMessage('Payment status must be PAID, FAILED or REFUNDED'),
  optionalText('note', 200, 'Note'),
];

/**
 * Turn the first validation failure into a 400 ApiError.
 */
const rejectInvalid = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();
  const first = errors.array({ onlyFirstError: true })[0];
  return next(new ApiError(first.msg, 400));
};

module.exports = {
  createOrderValidation,
  paymentProofValidation,
  verifyPaymentValidation,
  rejectInvalid,
  PH_MOBILE,
  PAYMENT_REFERENCE,
  PAYMENT_PROOF_URL,
};
