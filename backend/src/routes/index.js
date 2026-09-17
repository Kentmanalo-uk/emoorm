const express = require('express');
const router = express.Router();

/**
 * API Routes Index
 * All API routes are mounted here
 */

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'E-MOORM API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// API info route
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to E-MOORM API',
    version: '1.0.0',
    description: 'E-Commerce Platform for Local Entrepreneurs and Agricultural Producers in Oriental Mindoro',
  });
});

// Feature routes
const authRoutes = require('./auth.routes');
const municipalityRoutes = require('./municipality.routes');
const categoryRoutes = require('./category.routes');
const storeRoutes = require('./store.routes');
const productRoutes = require('./product.routes');
const orderRoutes = require('./order.routes');
const reviewRoutes = require('./review.routes');
const reportRoutes = require('./report.routes');
const notificationRoutes = require('./notification.routes');
const uploadRoutes = require('./upload.routes');
const analyticsRoutes = require('./analytics.routes');
const auditLogRoutes = require('./auditLog.routes');
const announcementRoutes = require('./announcement.routes');
const adminRoutes = require('./admin.routes');
const mfaRoutes = require('./mfa.routes');
const messageRoutes = require('./message.routes');
const addressRoutes = require('./address.routes');
const qrLoginRoutes = require('./qrLogin.routes');
const supportRoutes = require('./support.routes');
const bannerRoutes = require('./banner.routes');
const voucherRoutes = require('./voucher.routes');
const appSettingRoutes = require('./appSetting.routes');

// Mount routes
router.use('/auth', authRoutes);
router.use('/municipalities', municipalityRoutes);
router.use('/categories', categoryRoutes);
router.use('/stores', storeRoutes);
router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/reviews', reviewRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/upload', uploadRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/announcements', announcementRoutes);
router.use('/admin', adminRoutes);
router.use('/auth/mfa', mfaRoutes);
router.use('/auth/qr', qrLoginRoutes);
router.use('/messages', messageRoutes);
router.use('/follows', require('./storeFollow.routes'));
router.use('/addresses', addressRoutes);
router.use('/returns', require('./return.routes'));
router.use('/support', supportRoutes);
router.use('/banners', bannerRoutes);
router.use('/vouchers', voucherRoutes);
router.use('/app-settings', appSettingRoutes);
router.use('/identity-verification', require('./identityVerification.routes'));
router.use('/moderation', require('./moderation.routes'));

module.exports = router;
