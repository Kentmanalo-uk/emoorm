const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const referralController = require('../controllers/referral.controller');
const { authenticate, authorize } = require('../middleware/auth');

/**
 * Invites (services/referral). Everything answers "off" until a super admin
 * turns invites on in Settings.
 */
const router = express.Router();

// An invite page names the inviter, so codes cannot be tried by the thousand.
const inviteLookupLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { success: false, message: 'Too many requests. Please wait a moment and try again.' },
});

// Public: the invite landing page, and a shop's invite rewards for its page.
router.get('/invite/:code', inviteLookupLimiter, referralController.getInvite);
router.get('/shop/:storeId', referralController.getShopRewards);

// The person's own: Invite friends, and their invite vouchers (checkout).
router.get('/me', authenticate, referralController.getMine);
router.get('/vouchers', authenticate, referralController.myVouchers);

// A seller's own invite rewards.
router.get('/my-shop', authenticate, authorize('SELLER'), referralController.getMyProgram);
router.put('/my-shop', authenticate, authorize('SELLER'), referralController.saveMyProgram);

// Admins: every invite (a municipal admin: their town's), deciding held ones.
router.get('/admin', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), referralController.listAdmin);
router.post('/admin/:id/:action', authenticate, authorize('SUPER_ADMIN', 'MUNICIPAL_ADMIN'), referralController.decide);

module.exports = router;
