const express = require('express');
const feedbackController = require('../controllers/feedback.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Feedback Routes
 *
 * Anyone signed in may leave feedback; only the super admin may read it.
 * Municipal admins are deliberately excluded — feedback is about the platform,
 * and routing it per municipality would mean nobody owns "search is slow".
 */

router.post('/', authenticate, feedbackController.submitFeedback);

// Fixed segments before `/:id`, or "summary" would be read as an id.
router.get('/summary', authenticate, authorize('SUPER_ADMIN'), feedbackController.getSummary);
router.get('/unread-count', authenticate, authorize('SUPER_ADMIN'), feedbackController.getNewCount);

router.get('/', authenticate, authorize('SUPER_ADMIN'), feedbackController.listFeedback);
router.get('/:id', authenticate, authorize('SUPER_ADMIN'), feedbackController.getFeedbackById);
router.patch('/:id', authenticate, authorize('SUPER_ADMIN'), feedbackController.updateFeedback);

module.exports = router;
