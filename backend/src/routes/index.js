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

// API info route: a page for browsers, the JSON welcome for everything else.
const API_INFO = {
  version: '1.0.0',
  description: 'E-Commerce Platform for Local Entrepreneurs and Agricultural Producers in Oriental Mindoro',
};
router.get('/', (req, res) => {
  if (req.accepts(['json', 'html']) === 'html') {
    const config = require('../config/env');
    const { renderApiHome } = require('../lib/apiHomePage');
    const { buildApiDocs } = require('../lib/apiDocs');
    return res.status(200).type('html').send(renderApiHome({
      origin: `${req.protocol}://${req.get('host')}`,
      prefix: req.baseUrl,
      version: API_INFO.version,
      description: API_INFO.description,
      rateLimit: config.rateLimit.maxRequests,
      docs: buildApiDocs(router, req.baseUrl),
    }));
  }
  return res.status(200).json({
    success: true,
    message: 'Welcome to E-MOORM API',
    ...API_INFO,
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
const adminMessageRoutes = require('./adminMessage.routes');
const feedbackRoutes = require('./feedback.routes');
const bannerRoutes = require('./banner.routes');
const courierRoutes = require('./courier.routes');
const voucherRoutes = require('./voucher.routes');
const appSettingRoutes = require('./appSetting.routes');

// Mount routes. mount() also records each prefix for the /api reference page
// (Express keeps no readable mount path on a router).
const mounted = [];
const mount = (prefix, handler) => {
  mounted.push({ prefix, handler });
  router.use(prefix, handler);
};
router.mounted = mounted;

mount('/auth', authRoutes);
mount('/account', require('./account.routes'));
mount('/me', require('./savedItems.routes'));
mount('/questions', require('./productQuestion.routes'));
mount('/views', require('./productView.routes'));
mount('/app', require('./app.routes'));
mount('/admin-team', require('./adminTeam.routes'));
mount('/offers', require('./priceOffer.routes'));
mount('/today', require('./availability.routes'));
mount('/push', require('./push.routes'));
mount('/auth/phone', require('./phoneVerify.routes'));
mount('/municipalities', municipalityRoutes);
mount('/categories', categoryRoutes);
mount('/stores', storeRoutes);
mount('/products', productRoutes);
// MoorMove riders: the seller's bookings, tracking (before the order routes).
const moormoveRoutes = require('./moormove.routes');
mount('/moormove', moormoveRoutes.router);
mount('/orders', moormoveRoutes.orderRouter);
mount('/orders', orderRoutes);
mount('/reviews', reviewRoutes);
mount('/reports', reportRoutes);
mount('/notifications', notificationRoutes);
mount('/upload', uploadRoutes);
mount('/analytics', analyticsRoutes);
mount('/audit-logs', auditLogRoutes);
mount('/announcements', announcementRoutes);
mount('/admin', adminRoutes);
mount('/auth/mfa', mfaRoutes);
mount('/auth/qr', qrLoginRoutes);
mount('/messages', messageRoutes);
mount('/follows', require('./storeFollow.routes'));
mount('/addresses', addressRoutes);
mount('/returns', require('./return.routes'));
mount('/support', supportRoutes);
mount('/admin-messages', adminMessageRoutes);
mount('/feedback', feedbackRoutes);
mount('/banners', bannerRoutes);
mount('/couriers', courierRoutes);
mount('/vouchers', voucherRoutes);
mount('/app-settings', appSettingRoutes);
mount('/profiles', require('./profile.routes'));
mount('/identity-verification', require('./identityVerification.routes'));
mount('/moderation', require('./moderation.routes'));
mount('/seller-assistant', require('./sellerAssistant.routes'));
mount('/buyer-assistant', require('./buyerAssistant.routes'));

module.exports = router;
