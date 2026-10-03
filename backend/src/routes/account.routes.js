const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const controller = require('../controllers/account.controller');
const { authenticate, authorize } = require('../middleware/auth');

// A full export reads every table the user appears in: a few a day is plenty.
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'You can download your data a few times an hour. Try again later.' },
});

// Guessing the password here is as sensitive as at the login.
const closeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again later.' },
});

router.get('/deletion', authenticate, controller.deletionCheck);
router.post('/delete', authenticate, closeLimiter, controller.requestDeletion);
router.get('/export', authenticate, exportLimiter, controller.exportData);
router.post('/users/:id/restore', authenticate, authorize('SUPER_ADMIN'), controller.cancelDeletion);

module.exports = router;
