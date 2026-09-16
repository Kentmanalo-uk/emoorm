const express = require('express');
const supportController = require('../controllers/support.controller');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticate, supportController.createTicket);
router.get('/my', authenticate, supportController.getMyTickets);

module.exports = router;
