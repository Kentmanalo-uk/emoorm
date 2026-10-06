const { verifyAccessToken } = require('../utils/jwt');
const prisma = require('../config/database');

/**
 * The account behind a session token, as every signed-in request needs it.
 *
 * Each request used to read it from the database, so a page firing a dozen
 * requests read the same row a dozen times, and under a rush those reads took
 * a good share of the few database connections. The row is kept here for a
 * few seconds instead. Any change to an account through Prisma (suspending,
 * deleting, a role change, a new password) drops it at once, so a suspended
 * account or an old password's session is not let in from here; the short
 * lifetime covers a change made outside this process.
 */
const SESSION_USER_TTL_MS = 15 * 1000;
const SESSION_USER_MAX = 5000;
const sessionUsers = new Map();

const SESSION_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  municipalityId: true,
  isActive: true,
  deletedAt: true,
  adminAccessExpiresAt: true,
  tokenVersion: true,
};

const USER_WRITES = new Set(['update', 'updateMany', 'upsert', 'delete', 'deleteMany']);
prisma.$use(async (params, next) => {
  if (params.model === 'User' && USER_WRITES.has(params.action)) {
    const id = params.args?.where?.id;
    if (typeof id === 'string') sessionUsers.delete(id);
    else sessionUsers.clear();
  }
  return next(params);
});

/** A fresh copy of the account (callers change it), or null. */
const loadSessionUser = async (id) => {
  const hit = sessionUsers.get(id);
  if (hit && hit.expiresAt > Date.now()) return hit.user && { ...hit.user };
  const user = await prisma.user.findUnique({ where: { id }, select: SESSION_USER_SELECT });
  sessionUsers.delete(id);
  sessionUsers.set(id, { user, expiresAt: Date.now() + SESSION_USER_TTL_MS });
  if (sessionUsers.size > SESSION_USER_MAX) sessionUsers.delete(sessionUsers.keys().next().value);
  return user && { ...user };
};

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
    const user = await loadSessionUser(decoded.id);

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

    // The password has changed since this token was issued, so the session
    // it represents is over. Tokens minted before the column existed carry
    // no claim at all; they read as 0, which is the default every existing
    // row got, so nobody is signed out merely by deploying this.
    if ((decoded.tokenVersion ?? 0) !== user.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Session expired because the account password was changed. Please sign in again.',
      });
    }
    delete user.tokenVersion;

    // Admin access is only granted through a sign-in that passed MFA. A
    // session opened under another role (a buyer just made an admin), or for
    // another municipality, must sign in again rather than carry over.
    if (adminAccessChanged(decoded, user)) {
      return res.status(401).json({
        success: false,
        message: 'Your access has changed. Please sign in again.',
      });
    }

    // Temporary (backup) municipal admin whose access has ended → plain buyer again.
    if (user.role === 'MUNICIPAL_ADMIN' && user.adminAccessExpiresAt && user.adminAccessExpiresAt <= new Date()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'BUYER', adminAccessExpiresAt: null },
      });
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          userEmail: user.email,
          action: 'BACKUP_ADMIN_EXPIRED',
          entity: 'User',
          entityId: user.id,
          municipalityId: user.municipalityId,
        },
      }).catch(() => {});
      user.role = 'BUYER';
    }
    delete user.adminAccessExpiresAt;

    if (user.role === 'MUNICIPAL_ADMIN' && !user.municipalityId) {
      return res.status(403).json({
        success: false,
        message: 'No municipality is assigned to this municipal admin account.',
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
 * Whether a session's token was issued for a different admin access than the
 * account has now (role, or municipality for a municipal admin).
 */
const ADMIN_ROLES = ['MUNICIPAL_ADMIN', 'SUPER_ADMIN'];
function adminAccessChanged(decoded, user) {
  if (!ADMIN_ROLES.includes(user.role) && !ADMIN_ROLES.includes(decoded.role)) return false;
  if (decoded.role !== user.role) return true;
  return user.role === 'MUNICIPAL_ADMIN' && (decoded.municipalityId || null) !== (user.municipalityId || null);
}

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
      console.error('[auth] municipality access check failed:', error.message);
      return res.status(500).json({
        success: false,
        message: 'Error checking municipality access.',
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
    console.error('[auth] store ownership check failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error checking store ownership.',
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

    const user = await loadSessionUser(decoded.id);

    if (user && !user.deletedAt && user.isActive
      && (decoded.tokenVersion ?? 0) === user.tokenVersion) {
      // A temporary municipal admin whose window has closed is a buyer here
      // too. This used to be checked only in authenticate(), so an expired
      // backup admin still carried MUNICIPAL_ADMIN into every optionalAuth
      // route — and those routes branch on the role.
      if (user.role === 'MUNICIPAL_ADMIN' && user.adminAccessExpiresAt
        && user.adminAccessExpiresAt <= new Date()) {
        user.role = 'BUYER';
      }
      delete user.adminAccessExpiresAt;
      delete user.tokenVersion;
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
