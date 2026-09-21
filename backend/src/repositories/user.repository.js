const { Prisma } = require('@prisma/client');
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
      username: true,
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
    username: true,
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
    tokenVersion: true,
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
      username: true,
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
      sellerRejectionReason: true,
      sellerReviewedAt: true,
      tokenVersion: true,
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
      username: true,
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
      // province must be selected here because the caller diffs this result
      // against findById() to decide whether the change invalidates identity
      // verification. Leaving it out made province look changed on every
      // update and silently revoked a verified buyer's status.
      province: true,
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
 * Find whoever holds a username. Deleted accounts still count: their handle
 * stays claimed so an old profile link can never point at someone new.
 * @param {String} username - Normalized (lowercase) username
 * @returns {Promise<Object|null>} { id, username } or null
 */
const findByUsername = async (username) => {
  return prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
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
    includeShopMunicipality = false,
  } = options;

  const where = {
    deletedAt: null,
  };

  if (Array.isArray(role)) where.role = { in: role };
  else if (role) where.role = role;
  if (municipalityId && includeShopMunicipality) {
    // Seller applications are filed under the municipality the SHOP is in, so
    // that town's admin sees them even when the applicant lives elsewhere.
    where.AND = [{ OR: [{ municipalityId }, { shopMunicipalityId: municipalityId }] }];
  } else if (municipalityId) {
    where.municipalityId = municipalityId;
  }
  if (isActive !== undefined) where.isActive = isActive;
  if (sellerApplicationStatus) where.sellerApplicationStatus = sellerApplicationStatus;
  if (search) {
    const matchesSearch = {
      OR: [
        { fullName: { contains: search } },
        { email: { contains: search } },
      ],
    };
    where.AND = [...(where.AND || []), matchesSearch];
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
        sellerRejectionReason: true,
        sellerReviewedAt: true,
        sellerApplicationHistory: true,
        sellerTermsVersion: true,
        sellerTermsAcceptedAt: true,
        shopName: true,
        shopDescription: true,
        shopAddress: true,
        shopBarangay: true,
        shopMunicipalityId: true,
        shopTagline: true,
        shopLogoUrl: true,
        shopCategories: true,
        sellerBusinessType: true,
        sellerPermitNumber: true,
        sellerPermitUrl: true,
        sellerBirTin: true,
        payoutMethod: true,
        payoutAccountName: true,
        payoutAccountNumber: true,
        fulfillmentPreference: true,
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
 * Everything the applicant filled in, plus the review outcome and any saved
 * draft. Used by the application status endpoint and the admin review screen.
 * @param {String} userId - User ID
 * @returns {Promise<Object|null>} Application record or null
 */
const findSellerApplication = async (userId) => {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      municipalityId: true,
      sellerApplicationStatus: true,
      sellerApplicationDate: true,
      sellerRejectionReason: true,
      sellerReviewedAt: true,
      sellerApplicationDraft: true,
      sellerApplicationHistory: true,
      sellerTermsVersion: true,
      sellerTermsAcceptedAt: true,
      shopName: true,
      shopDescription: true,
      shopAddress: true,
      shopMunicipalityId: true,
      shopBarangay: true,
      shopTagline: true,
      shopLogoUrl: true,
      shopCategories: true,
      sellerBusinessType: true,
      sellerPermitNumber: true,
      sellerPermitUrl: true,
      sellerBirTin: true,
      payoutMethod: true,
      payoutAccountName: true,
      payoutAccountNumber: true,
      fulfillmentPreference: true,
      idType: true,
      idFrontUrl: true,
      idBackUrl: true,
      selfieUrl: true,
    },
  });
};

/**
 * Store (or clear) the unsubmitted application form so a refresh does not
 * lose what the applicant typed.
 * @param {String} userId - User ID
 * @param {Object|null} draft - Form contents, or null to clear
 * @returns {Promise<Object>} Updated user
 */
const saveSellerApplicationDraft = async (userId, draft) => {
  return prisma.user.update({
    where: { id: userId },
    data: { sellerApplicationDraft: draft ?? Prisma.JsonNull },
    select: { id: true, sellerApplicationDraft: true },
  });
};

/**
 * Append one entry to the application's audit trail.
 * @param {Array} history - Existing history (may be null)
 * @param {Object} entry - { action, by, byName, reason }
 * @returns {Array} New history array
 */
const appendHistory = (history, entry) => {
  const list = Array.isArray(history) ? history : [];
  return [...list, { ...entry, at: new Date().toISOString() }].slice(-50);
};

/**
 * Apply to become a seller. Saves every application field, records the terms
 * the applicant agreed to, clears any previous rejection, and drops the draft.
 * @param {String} userId - User ID
 * @param {Object} data - Validated application data
 * @param {Array} history - Existing application history
 * @returns {Promise<Object>} Updated user
 */
const applyForSeller = async (userId, data = {}, history = []) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      sellerApplicationStatus: 'PENDING',
      sellerApplicationDate: new Date(),
      // A resubmission starts clean — the previous verdict no longer applies.
      sellerRejectionReason: null,
      sellerReviewedById: null,
      sellerReviewedAt: null,
      sellerApplicationDraft: Prisma.JsonNull,
      sellerApplicationHistory: appendHistory(history, { action: 'SUBMITTED', by: userId }),
      shopName: data.shopName,
      shopDescription: data.shopDescription ?? null,
      shopAddress: data.shopAddress,
      shopMunicipalityId: data.shopMunicipalityId,
      shopBarangay: data.shopBarangay ?? null,
      shopTagline: data.shopTagline ?? null,
      shopLogoUrl: data.shopLogoUrl ?? null,
      shopCategories: data.shopCategories?.length ? data.shopCategories : Prisma.JsonNull,
      sellerBusinessType: data.sellerBusinessType ?? null,
      sellerPermitNumber: data.sellerPermitNumber ?? null,
      sellerPermitUrl: data.sellerPermitUrl ?? null,
      sellerBirTin: data.sellerBirTin ?? null,
      payoutMethod: data.payoutMethod ?? null,
      payoutAccountName: data.payoutAccountName ?? null,
      payoutAccountNumber: data.payoutAccountNumber ?? null,
      fulfillmentPreference: data.fulfillmentPreference ?? null,
      sellerTermsVersion: data.termsVersion,
      sellerTermsAcceptedAt: new Date(),
      ...(data.idType && { idType: data.idType }),
      ...(data.idFrontUrl && { idFrontUrl: data.idFrontUrl }),
      ...(data.idBackUrl && { idBackUrl: data.idBackUrl }),
    },
  });
};

/**
 * Approve seller application — this is the only place the SELLER role is
 * granted, so an applicant has no seller access until an admin says yes.
 * @param {String} userId - User ID
 * @param {Object} review - { reviewedById, reviewerName, history }
 * @returns {Promise<Object>} Updated user
 */
const approveSeller = async (userId, review = {}) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      role: 'SELLER',
      sellerApplicationStatus: 'APPROVED',
      sellerRejectionReason: null,
      sellerReviewedById: review.reviewedById ?? null,
      sellerReviewedAt: new Date(),
      sellerApplicationHistory: appendHistory(review.history, {
        action: 'APPROVED',
        by: review.reviewedById ?? null,
        byName: review.reviewerName ?? null,
      }),
    },
  });
};

/**
 * Reject seller application. The reason is stored so both the admin and the
 * applicant can see it later, and the account drops back to BUYER so a
 * rejected applicant cannot keep Seller Center access.
 * @param {String} userId - User ID
 * @param {Object} review - { reason, reviewedById, reviewerName, history }
 * @returns {Promise<Object>} Updated user
 */
const rejectSeller = async (userId, review = {}) => {
  return prisma.user.update({
    where: { id: userId },
    data: {
      role: 'BUYER',
      sellerApplicationStatus: 'REJECTED',
      sellerRejectionReason: review.reason || null,
      sellerReviewedById: review.reviewedById ?? null,
      sellerReviewedAt: new Date(),
      sellerApplicationHistory: appendHistory(review.history, {
        action: 'REJECTED',
        by: review.reviewedById ?? null,
        byName: review.reviewerName ?? null,
        reason: review.reason || null,
      }),
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
      sellerPermitUrl: true,
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
        tokenVersion: true,
        deletedAt: true,
        createdAt: true,
      },
    });
  },
  findById,
  updateUser,
  softDeleteUser,
  emailExists,
  findByUsername,
  findAll,
  applyForSeller,
  findSellerApplication,
  saveSellerApplicationDraft,
  approveSeller,
  rejectSeller,
  findByMunicipality,
  setPasswordResetToken,
  findByResetToken,
  clearPasswordResetToken,
  findKycRecordById,
};
