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
        },
      },
      barangay: true,
      address: true,
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
  } = options;

  const where = {
    deletedAt: null,
  };

  if (role) where.role = role;
  if (municipalityId) where.municipalityId = municipalityId;
  if (isActive !== undefined) where.isActive = isActive;
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
          },
        },
        role: true,
        isActive: true,
        isVerified: true,
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
const applyForSeller = async (userId) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      sellerApplicationStatus: 'PENDING',
      sellerApplicationDate: new Date(),
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

module.exports = {
  createUser,
  findByEmail,
  findById,
  updateUser,
  softDeleteUser,
  emailExists,
  findAll,
  applyForSeller,
  approveSeller,
  rejectSeller,
  findByMunicipality,
};
