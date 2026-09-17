const prisma = require('../config/database');

/**
 * User Repository
 * Handles all database operations related to users
 */

/**
 * Create a new user
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
const createUser = async (userData) => {
  return prisma.user.create({
    data: userData,
    select: {
      id: true,
      email: true,
      fullName: true,
      contactNumber: true,
      profilePhoto: true,
      municipalityId: true,
      municipality: {
        select: {
          id: true,
          name: true,
          code: true,
          logo: true,
        },
      },
      barangay: true,
      address: true,
      province: true,
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logo: true,
          pickupAddress: true,
          isActive: true,
          isSuspended: true,
          suspensionReason: true,
          _count: { select: { products: true, orders: true } },
        },
      },
      role: true,
      isActive: true,
      isVerified: true,
      createdAt: true,
    },
  });
};

/**
 * Find user by email
 * @param {String} email - User email
 * @param {Boolean} includePassword - Whether to include password in result
 * @returns {Promise<Object|null>} User or null
 */
const findByEmail = async (email, includePassword = false) => {
  const select = {
    id: true,
    email: true,
    fullName: true,
    contactNumber: true,
    profilePhoto: true,
    municipalityId: true,
    municipality: {
      select: {
        id: true,
        name: true,
        code: true,
        logo: true,
      },
    },
    barangay: true,
    address: true,
    role: true,
    isActive: true,
    isVerified: true,
    sellerApplicationStatus: true,
    sellerApplicationDate: true,
    mfaEnabled: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
  };

  if (includePassword) {
    select.password = true;
  }

  return prisma.user.findUnique({
    where: { email },
    select,
  });
};

/**
 * Find user by ID
 * @param {String} id - User ID
 * @returns {Promise<Object|null>} User or null
 */
const findById = async (id) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      fullName: true,
      contactNumber: true,
      profilePhoto: true,
      municipalityId: true,
      municipality: {
        select: {
          id: true,
          name: true,
          code: true,
          logo: true,
        },
      },
      barangay: true,
      address: true,
      province: true,
      store: {
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          logo: true,
          pickupAddress: true,
          isActive: true,
          isSuspended: true,
          _count: { select: { products: true, orders: true } },
        },
      },
      role: true,
      isActive: true,
      isVerified: true,
      sellerApplicationStatus: true,
      sellerApplicationDate: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
    },
  });
};

/**
 * Update user by ID
 * @param {String} id - User ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated user
 */
const updateUser = async (id, updateData) => {
  return prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      fullName: true,
      contactNumber: true,
      profilePhoto: true,
      municipalityId: true,
      municipality: {
        select: {
          id: true,
          name: true,
          code: true,
          logo: true,
        },
      },
      barangay: true,
      address: true,
      role: true,
      isActive: true,
      isVerified: true,
      sellerApplicationStatus: true,
      sellerApplicationDate: true,
      createdAt: true,
      updatedAt: true,
    },
  });
};

/**
 * Soft delete user by ID
 * @param {String} id - User ID
 * @returns {Promise<Object>} Deleted user
 */
const softDeleteUser = async (id) => {
  return prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      isActive: false,
    },
  });
};

/**
 * Check if email exists
 * @param {String} email - Email to check
 * @returns {Promise<Boolean>} True if exists
 */
const emailExists = async (email) => {
  const count = await prisma.user.count({
    where: { email },
  });
  return count > 0;
};

/**
 * Get all users with pagination and filters
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Users and pagination info
 */
const findAll = async (options = {}) => {
  const {
    page = 1,
    pageSize = 20,
    role,
    municipalityId,
    isActive,
    search,
    sellerApplicationStatus,
  } = options;

  const where = {
    deletedAt: null,
  };

  if (Array.isArray(role)) where.role = { in: role };
  else if (role) where.role = role;
  if (municipalityId) where.municipalityId = municipalityId;
  if (isActive !== undefined) where.isActive = isActive;
  if (sellerApplicationStatus) where.sellerApplicationStatus = sellerApplicationStatus;
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { email: { contains: search } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        fullName: true,
        contactNumber: true,
        profilePhoto: true,
        municipalityId: true,
        municipality: {
          select: {
            id: true,
            name: true,
            code: true,
            logo: true,
          },
        },
        province: true,
        barangay: true,
        address: true,
        store: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            logo: true,
            pickupAddress: true,
            isActive: true,
            isSuspended: true,
            _count: { select: { products: true, orders: true } },
          },
        },
        role: true,
        isActive: true,
        isVerified: true,
        sellerApplicationStatus: true,
        sellerApplicationDate: true,
        shopName: true,
        shopDescription: true,
        shopAddress: true,
        idType: true,
        idFrontUrl: true,
        idBackUrl: true,
        selfieUrl: true,
        createdAt: true,
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    total,
    page,
    pageSize,
  };
};

/**
 * Apply to become a seller
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const applyForSeller = async (userId, data = {}) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      sellerApplicationStatus: 'PENDING',
      sellerApplicationDate: new Date(),
      ...(data.shopName && { shopName: data.shopName }),
      ...(data.shopDescription && { shopDescription: data.shopDescription }),
      ...(data.shopAddress && { shopAddress: data.shopAddress }),
      ...(data.idType && { idType: data.idType }),
      ...(data.idFrontUrl && { idFrontUrl: data.idFrontUrl }),
      ...(data.idBackUrl && { idBackUrl: data.idBackUrl }),
      ...(data.selfieUrl && { selfieUrl: data.selfieUrl }),
    },
  });
};

/**
 * Approve seller application
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const approveSeller = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      role: 'SELLER',
      sellerApplicationStatus: 'APPROVED',
    },
  });
};

/**
 * Promote user to SELLER role without changing application status.
 * Used when a user applies — role becomes SELLER immediately, but their
 * store stays inactive until an admin approves the pending application.
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const promoteToSeller = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: { role: 'SELLER' },
  });
};

/**
 * Reject seller application
 * @param {String} userId - User ID
 * @returns {Promise<Object>} Updated user
 */
const rejectSeller = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      sellerApplicationStatus: 'REJECTED',
    },
  });
};

/**
 * Get users by municipality
 * @param {String} municipalityId - Municipality ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Users and pagination info
 */
const findByMunicipality = async (municipalityId, options = {}) => {
  return findAll({ ...options, municipalityId });
};

const setPasswordResetToken = async (userId, hashedToken, expiry) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetToken: hashedToken,
      passwordResetExpiry: expiry,
    },
  });
};

const findByResetToken = async (hashedToken) => {
  return prisma.user.findFirst({
    where: {
      passwordResetToken: hashedToken,
      passwordResetExpiry: { gt: new Date() },
      deletedAt: null,
    },
  });
};

const clearPasswordResetToken = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      passwordResetToken: null,
      passwordResetExpiry: null,
    },
  });
};

/**
 * Find the minimal fields needed to authorize and resolve a KYC photo request.
 * Deliberately excludes everything not needed for that check.
 * @param {String} id - User ID
 * @returns {Promise<Object|null>} User or null
 */
const findKycRecordById = async (id) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      municipalityId: true,
      idFrontUrl: true,
      idBackUrl: true,
      selfieUrl: true,
    },
  });
};

module.exports = {
  createUser,
  findByEmail,
  findByGoogleId: async (googleId) => {
    return prisma.user.findUnique({
      where: { googleId },
      select: {
        id: true,
        email: true,
        fullName: true,
        contactNumber: true,
        profilePhoto: true,
        googleId: true,
        municipalityId: true,
        municipality: { select: { id: true, name: true, code: true } },
        barangay: true,
        address: true,
        province: true,
        role: true,
        isActive: true,
        isVerified: true,
        mfaEnabled: true,
        deletedAt: true,
        createdAt: true,
      },
    });
  },
  findById,
  updateUser,
  softDeleteUser,
  emailExists,
  findAll,
  applyForSeller,
  approveSeller,
  promoteToSeller,
  rejectSeller,
  findByMunicipality,
  setPasswordResetToken,
  findByResetToken,
  clearPasswordResetToken,
  findKycRecordById,
};
