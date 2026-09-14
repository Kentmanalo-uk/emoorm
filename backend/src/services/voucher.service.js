const voucherRepository = require('../repositories/voucher.repository');
const { ApiError } = require('../middleware/errorHandler');

const DISCOUNT_TYPES = ['PERCENT', 'FIXED'];

const sanitize = (input = {}, { creating = false } = {}) => {
  const data = {};

  if (input.code !== undefined) {
    const code = String(input.code || '').trim().toUpperCase();
    if (!code || code.length < 3 || code.length > 32) {
      throw new ApiError('Code must be 3-32 characters', 400);
    }
    if (!/^[A-Z0-9_-]+$/.test(code)) {
      throw new ApiError('Code may only contain letters, numbers, dashes, and underscores', 400);
    }
    data.code = code;
  } else if (creating) {
    throw new ApiError('Code is required', 400);
  }

  if (input.description !== undefined) {
    const description = input.description == null ? null : String(input.description).trim();
    if (description && description.length > 300) throw new ApiError('Description too long', 400);
    data.description = description || null;
  }

  if (input.discountType !== undefined) {
    const type = String(input.discountType || '').toUpperCase();
    if (!DISCOUNT_TYPES.includes(type)) throw new ApiError('Discount type must be PERCENT or FIXED', 400);
    data.discountType = type;
  } else if (creating) {
    throw new ApiError('Discount type is required', 400);
  }

  if (input.discountValue !== undefined) {
    const value = Number(input.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw new ApiError('Discount value must be greater than 0', 400);
    }
    const type = data.discountType || input.discountType;
    if (String(type).toUpperCase() === 'PERCENT' && value > 100) {
      throw new ApiError('Percent discount cannot exceed 100', 400);
    }
    data.discountValue = value;
  } else if (creating) {
    throw new ApiError('Discount value is required', 400);
  }

  if (input.minOrderAmount !== undefined) {
    if (input.minOrderAmount === null || input.minOrderAmount === '') {
      data.minOrderAmount = null;
    } else {
      const n = Number(input.minOrderAmount);
      if (!Number.isFinite(n) || n < 0) throw new ApiError('Min order amount must be >= 0', 400);
      data.minOrderAmount = n;
    }
  }

  if (input.maxDiscount !== undefined) {
    if (input.maxDiscount === null || input.maxDiscount === '') {
      data.maxDiscount = null;
    } else {
      const n = Number(input.maxDiscount);
      if (!Number.isFinite(n) || n < 0) throw new ApiError('Max discount must be >= 0', 400);
      data.maxDiscount = n;
    }
  }

  if (input.usageLimit !== undefined) {
    if (input.usageLimit === null || input.usageLimit === '') {
      data.usageLimit = null;
    } else {
      const n = Number(input.usageLimit);
      if (!Number.isInteger(n) || n < 1) throw new ApiError('Usage limit must be a positive integer', 400);
      data.usageLimit = n;
    }
  }

  if (input.perUserLimit !== undefined) {
    if (input.perUserLimit === null || input.perUserLimit === '') {
      data.perUserLimit = null;
    } else {
      const n = Number(input.perUserLimit);
      if (!Number.isInteger(n) || n < 1) throw new ApiError('Per-user limit must be a positive integer', 400);
      data.perUserLimit = n;
    }
  }

  if (input.startsAt !== undefined) {
    data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (data.startsAt && Number.isNaN(data.startsAt.getTime())) throw new ApiError('Invalid start date', 400);
  }

  if (input.expiresAt !== undefined) {
    data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (data.expiresAt && Number.isNaN(data.expiresAt.getTime())) throw new ApiError('Invalid expiry date', 400);
  }

  if (input.isActive !== undefined) {
    data.isActive = Boolean(input.isActive);
  }

  return data;
};

const computeDiscount = (voucher, subtotal) => {
  const sub = Number(subtotal || 0);
  const value = Number(voucher.discountValue || 0);
  let discount = voucher.discountType === 'PERCENT' ? sub * (value / 100) : value;
  if (voucher.maxDiscount != null) {
    discount = Math.min(discount, Number(voucher.maxDiscount));
  }
  if (discount > sub) discount = sub;
  if (discount < 0) discount = 0;
  return Math.round(discount * 100) / 100;
};

const assertUsable = async (voucher, { userId, subtotal }) => {
  if (!voucher) throw new ApiError('Voucher not found', 404);
  if (!voucher.isActive) throw new ApiError('Voucher is not active', 400);
  const now = new Date();
  if (voucher.startsAt && voucher.startsAt > now) throw new ApiError('Voucher is not yet active', 400);
  if (voucher.expiresAt && voucher.expiresAt < now) throw new ApiError('Voucher has expired', 400);
  if (voucher.usageLimit != null && voucher.timesUsed >= voucher.usageLimit) {
    throw new ApiError('Voucher usage limit reached', 400);
  }
  if (voucher.minOrderAmount != null && Number(subtotal || 0) < Number(voucher.minOrderAmount)) {
    throw new ApiError(`Voucher requires a minimum order of ₱${Number(voucher.minOrderAmount).toFixed(2)}`, 400);
  }
  if (voucher.perUserLimit != null && userId) {
    const used = await voucherRepository.countUserRedemptions(voucher.id, userId);
    if (used >= voucher.perUserLimit) {
      throw new ApiError('You have already used this voucher', 400);
    }
  }
};

const validate = async ({ code, userId, subtotal }) => {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) throw new ApiError('Voucher code is required', 400);
  const voucher = await voucherRepository.findByCode(normalized);
  await assertUsable(voucher, { userId, subtotal });
  const discount = computeDiscount(voucher, subtotal);
  return {
    voucher: {
      id: voucher.id,
      code: voucher.code,
      description: voucher.description,
      discountType: voucher.discountType,
      discountValue: Number(voucher.discountValue),
      minOrderAmount: voucher.minOrderAmount != null ? Number(voucher.minOrderAmount) : null,
      maxDiscount: voucher.maxDiscount != null ? Number(voucher.maxDiscount) : null,
    },
    discountAmount: discount,
  };
};

const listAdmin = (query) => voucherRepository.findAll(query);

const create = async (userId, input) => {
  const data = sanitize(input, { creating: true });
  const existing = await voucherRepository.findByCode(data.code);
  if (existing) throw new ApiError('Voucher code already exists', 409);
  data.createdById = userId || null;
  return voucherRepository.create(data);
};

const update = async (id, input) => {
  const existing = await voucherRepository.findById(id);
  if (!existing) throw new ApiError('Voucher not found', 404);
  const data = sanitize(input);
  if (data.code && data.code !== existing.code) {
    const clash = await voucherRepository.findByCode(data.code);
    if (clash) throw new ApiError('Voucher code already exists', 409);
  }
  return voucherRepository.update(id, data);
};

const remove = async (id) => {
  const existing = await voucherRepository.findById(id);
  if (!existing) throw new ApiError('Voucher not found', 404);
  return voucherRepository.remove(id);
};

module.exports = {
  computeDiscount,
  assertUsable,
  validate,
  listAdmin,
  create,
  update,
  remove,
};
