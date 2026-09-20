const express = require('express');
const appSettingController = require('../controllers/appSetting.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { publicCache } = require('../middleware/httpCache');
const config = require('../config/env');

const router = express.Router();

router.get('/', publicCache(config.cache.ttl.appSettings), appSettingController.get);
router.put('/', authenticate, authorize('SUPER_ADMIN'), appSettingController.update);

module.exports = router;