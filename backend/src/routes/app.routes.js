const express = require('express');
const { rateLimit } = require('express-rate-limit');
const router = express.Router();
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { recordPing, getStats, getPublicDownloads } = require('../services/appInstall.service');
const playTesters = require('../services/playTester.service');

// A phone pings once per launch and once per sign-in; this is generous.
const pingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests.' },
});

// The site, running inside the Android app, says it is in use on this phone.
router.post('/ping', pingLimiter, optionalAuth, asyncHandler(async (req, res) => {
  const recorded = await recordPing({
    installId: req.body?.installId,
    userAgent: req.get('user-agent'),
    userId: req.user?.id || null,
    launch: req.body?.launch === true,
  });
  res.status(202).json({ success: true, recorded });
}));

// Everyone: the rounded download count for the /app page ("100+").
router.get('/downloads', asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'public, max-age=600');
  res.json({ success: true, data: await getPublicDownloads() });
}));

// Super admin: downloads, installs per version and who uses the app.
router.get('/stats', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await getStats() });
}));

// The early version on Google Play: a few tries per person is plenty.
const testerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many tries. Please wait a while.' },
});

// Everyone: leave a Gmail to be added to the Play Store tester list.
router.post('/testers', testerLimiter, optionalAuth, asyncHandler(async (req, res) => {
  const data = await playTesters.join({ email: req.body?.email, userId: req.user?.id || null });
  res.status(201).json({ success: true, data });
}));

// Super admin: the list, marking people added (emails them), removing one.
router.get('/testers', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await playTesters.list() });
}));

router.post('/testers/added', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await playTesters.markAdded(req.body?.ids) });
}));

router.delete('/testers/:id', authenticate, authorize('SUPER_ADMIN'), asyncHandler(async (req, res) => {
  await playTesters.remove(req.params.id);
  res.json({ success: true });
}));

module.exports = router;
