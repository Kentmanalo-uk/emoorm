const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/database');

/**
 * Middleware to authenticate requests using JWT
 * Verifies token and attaches user to request object
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid token.',
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Verify token
    const decoded = verifyAccessToken(token);
    
    // Check if user still exists and is active
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        municipalityId: true,
        isActive: true,
        deletedAt: true,
      },
    });
    
    if (!user || user.deletedAt) {
      return res.status(401).json({
        success: false,
        message: 'User not found or account has been deleted.',
      });
    }
    
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is suspended. Please contact support.',
      });
    }
    
    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message || 'Invalid or expired token.',
    });
  }
};

/**
 * Middleware to check if user has required role(s)
 * @param {Array<String>} allowedRoles - Array of allowed roles
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource.',
      });
    }
    
    next();
  };
};

/**
 * Middleware to check if user has access to municipality-scoped resources
 * Ensures Municipal Admins can only access their assigned municipality
 * @param {String} municipalityIdParam - Request parameter or body field containing municipality ID
 */
const checkMunicipalityAccess = (municipalityIdParam = 'municipalityId') => {
  return async (req, res, next) => {
    try {
      // Super Admin has access to all municipalities
      if (req.user.role === 'SUPER_ADMIN') {
        return next();
      }
      
      // Get municipality ID from request (params, body, or query)
      const requestedMunicipalityId = 
        req.params[municipalityIdParam] || 
        req.body[municipalityIdParam] || 
        req.query[municipalityIdParam];
      
      // If no municipality specified, allow (will be handled by other validations)
      if (!requestedMunicipalityId) {
        return next();
      }
      
      // Municipal Admin can only access their assigned municipality
      if (req.user.role === 'MUNICIPAL_ADMIN') {
        if (req.user.municipalityId !== requestedMunicipalityId) {
          return res.status(403).json({
            success: false,
            message: 'You can only access resources in your assigned municipality.',
          });
        }
      }
      
      // Buyers and Sellers can only access their own municipality
      if (req.user.role === 'BUYER' || req.user.role === 'SELLER') {
        if (req.user.municipalityId !== requestedMunicipalityId) {
          return res.status(403).json({
            success: false,
            message: 'You can only access resources in your municipality.',
          });
        }
      }
      
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error checking municipality access.',
        error: error.message,
      });
    }
  };
};

/**
 * Middleware to check if seller owns the store
 */
const checkStoreOwnership = async (req, res, next) => {
  try {
    const storeId = req.params.id || req.params.storeId || req.body.storeId;
    
    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: 'Store ID is required.',
      });
    }
    
    // Super Admin can access any store
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }
    
    // Check if store exists and belongs to user
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { ownerId: true, municipalityId: true },
    });
    
    if (!store) {
      return res.status(404).json({
        success: false,
        message: 'Store not found.',
      });
    }
    
    // Municipal Admin can access stores in their municipality
    if (req.user.role === 'MUNICIPAL_ADMIN') {
      if (store.municipalityId !== req.user.municipalityId) {
        return res.status(403).json({
          success: false,
          message: 'You can only access stores in your municipality.',
        });
      }
      return next();
    }
    
    // Seller must own the store
    if (store.ownerId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own store.',
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error checking store ownership.',
      error: error.message,
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token provided
 * But validates token if present
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided, continue without user
      return next();
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        municipalityId: true,
        isActive: true,
        deletedAt: true,
      },
    });
    
    if (user && !user.deletedAt && user.isActive) {
      req.user = user;
    }
    
    next();
  } catch (error) {
    // Invalid token, but continue without user
    next();
  }
};

module.exports = {
  authenticate,
  authorize,
  checkMunicipalityAccess,
  checkStoreOwnership,
  optionalAuth,
};
