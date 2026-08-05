const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcement.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.post(
  '/',
  authenticate,
  authorize('MUNICIPAL_ADMIN', 'SUPER_ADMIN'),
  announcementController.broadcast
);

module.exports = router;
