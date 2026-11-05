/*
 * What the live module (../../../livestream) needs from the shop's data:
 * whether a seller may go live, the products in a live's bag, and the name
 * shown with a comment. The live itself is never stored here.
 */
const prisma = require('../config/database');
const productRepository = require('../repositories/product.repository');
const productService = require('./product.service');
const { findBadWords } = require('../utils/badWords');

const STORE_SELECT = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  primaryColor: true,
  isActive: true,
  isSuspended: true,
  isApproved: true,
  deletedAt: true,
  municipality: { select: { name: true } },
};

/** The seller's shop when it may go live, or why not. */
const sellerStore = async (user) => {
  if (user?.role !== 'SELLER') return { store: null, reason: 'Only sellers can go live.' };
  const row = await prisma.store.findUnique({ where: { ownerId: user.id }, select: STORE_SELECT });
  if (!row || row.deletedAt) return { store: null, reason: 'Open your shop first.' };
  if (row.isSuspended || !row.isActive) return { store: null, reason: 'Your shop is not open right now, so it cannot go live.' };
  if (!row.isApproved) return { store: null, reason: 'Your shop can go live once its application is approved.' };
  return {
    store: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logo: row.logo,
      primaryColor: row.primaryColor,
      town: row.municipality?.name || null,
    },
  };
};

/** The bag's products as the public lists show them: the shop's own, on sale. */
const bagProducts = async (storeId, ids) => {
  const rows = await productRepository.findListByIds(ids);
  const mine = rows.filter((p) => p.storeId === storeId && p.status === 'APPROVED' && !p.deletedAt);
  return productService.toPublicList(mine);
};

// Names change rarely; a comment burst should not read the same row 50 times.
const profiles = new Map();
const PROFILE_TTL_MS = 10 * 60 * 1000;

/** "Maria S." and the avatar, for a comment. */
const profileOf = async (userId) => {
  const hit = profiles.get(userId);
  if (hit && hit.at > Date.now() - PROFILE_TTL_MS) return hit.profile;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true, username: true, avatarKey: true } });
  const parts = String(u?.fullName || '').trim().split(/\s+/).filter(Boolean);
  const name = parts.length
    ? `${parts[0]}${parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : ''}`
    : (u?.username || 'Shopper');
  const profile = { name: name.slice(0, 30), avatarKey: u?.avatarKey || null };
  profiles.set(userId, { at: Date.now(), profile });
  if (profiles.size > 5000) profiles.delete(profiles.keys().next().value);
  return profile;
};

const isAbusive = (text) => findBadWords(text).length > 0;

module.exports = {
  sellerStore, bagProducts, profileOf, isAbusive,
};
