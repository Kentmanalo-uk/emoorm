const express = require('express');
const appSettingController = require('../controllers/appSetting.controller');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', appSettingController.get);
router.put('/', authenticate, authorize('SUPER_ADMIN'), appSettingController.update);

module.exports = router;