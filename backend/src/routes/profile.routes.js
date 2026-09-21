const express = require('express');
const profileController = require('../controllers/profile.controller');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Public profile routes
 */
router.get('/:id', optionalAuth, profileController.getPublicProfile);

module.exports = router;
