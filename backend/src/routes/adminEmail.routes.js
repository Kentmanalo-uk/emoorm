const express = require('express');
const router = express.Router();
const adminEmailService = require('../services/adminEmail.service');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { successResponse } = require('../utils/response');

/*
 * Admins' emails to many people (services/adminEmail.service): a super
 * admin's to anyone, a municipal admin's to people of their own town.
 */
router.use(authenticate, authorize('MUNICIPAL_ADMIN', 'SUPER_ADMIN'));

// Emails already sent, with how many have gone.
router.get('/', asyncHandler(async (req, res) => {
  const result = await adminEmailService.list(req.user, req.query);
  res.json({
    success: true,
    message: 'Emails retrieved successfully',
    data: result.emails,
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
    },
  });
}));

// People to pick, by name or email.
router.get('/people', asyncHandler(async (req, res) => {
  successResponse(res, await adminEmailService.lookup(req.user, req.query), 'People found');
}));

// How many an email would reach, before it is sent.
router.post('/preview', asyncHandler(async (req, res) => {
  successResponse(res, await adminEmailService.preview(req.user, req.body), 'Recipients counted');
}));

// The email as people get it, and a test copy to the admin's own inbox.
router.post('/sample', asyncHandler(async (req, res) => {
  successResponse(res, await adminEmailService.sample(req.user, req.body), 'Sample ready');
}));

router.post('/test', asyncHandler(async (req, res) => {
  successResponse(res, await adminEmailService.sendTest(req.user, req.body), 'Test email sent');
}));

router.post('/', asyncHandler(async (req, res) => {
  successResponse(res, await adminEmailService.send(req.user, req.body, req), 'Email is being sent');
}));

module.exports = router;
