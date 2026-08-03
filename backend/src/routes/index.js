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

// Mount routes
router.use('/auth', authRoutes);

// TODO: Mount additional feature routes as they are created
// const productRoutes = require('./product.routes');
// const orderRoutes = require('./order.routes');
// const storeRoutes = require('./store.routes');
// const categoryRoutes = require('./category.routes');
// const municipalityRoutes = require('./municipality.routes');
// const reviewRoutes = require('./review.routes');
// const reportRoutes = require('./report.routes');
// const notificationRoutes = require('./notification.routes');

// router.use('/products', productRoutes);
// router.use('/orders', orderRoutes);
// router.use('/stores', storeRoutes);
// router.use('/categories', categoryRoutes);
// router.use('/municipalities', municipalityRoutes);
// router.use('/reviews', reviewRoutes);
// router.use('/reports', reportRoutes);
// router.use('/notifications', notificationRoutes);

module.exports = router;
