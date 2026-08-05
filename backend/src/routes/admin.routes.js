const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminManagement.controller');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('SUPER_ADMIN'));

router.get('/junior-admins', controller.listJuniorAdmins);
router.post('/junior-admins', controller.assignJuniorAdmin);
router.delete('/junior-admins/:id', controller.removeJuniorAdmin);

module.exports = router;
