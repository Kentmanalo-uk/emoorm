const prisma = require('../config/database');
const productRepository = require('../repositories/product.repository');
const productService = require('../services/product.service');

/**
 * The products the ML engine may learn from and show: the same rule as the
 * public lists and For You (approved, not deleted, from an active, approved,
 * unsuspended shop). Light rows: enough to compare products, nothing more.
 */

const MAX_PRODUCTS = 5000; // far above the catalogue; a guard, not a limit in practice
const DESCRIPTION_CHARS = 600;

const PUBLIC_WHERE = {
  deletedAt: null,
  status: 'APPROVED',
  store: { isActive: true, isSuspended: false, isApproved: true },
};

/** Every showable product, light, newest first. */
const loadCatalog = () => prisma.product.findMany({
  where: PUBLIC_WHERE,
  select: {
    id: true,
    name: true,
    description: true,
    categoryId: true,
    storeId: true,
    municipalityId: true,
    price: true,
    salePrice: true,
    badge: true,
    productType: true,
    listingKind: true,
    stock: true,
    soldCount: true,
    createdAt: true,
    category: { select: { name: true } },
    store: { select: { name: true } },
  },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: MAX_PRODUCTS,
});

const KIND_WORDS = {
  READY_TO_EAT: 'ready to eat cooked meal food',
  COOK_TO_ORDER: 'cooked to order paluto meal food',
  LIVESTOCK: 'livestock animal',
  PACKAGE: 'package bundle set',
};
const BADGE_WORDS = { PRE_ORDER: 'pre-order', PALENGKE: 'palengke fresh market', DIY: 'diy craft handmade' };

/** A product as weighted text fields for the TF-IDF index. */
const documentOf = (p) => ({
  id: p.id,
  fields: [
    [p.name, 3],
    [p.category?.name, 2],
    [`${KIND_WORDS[p.productType] || ''} ${BADGE_WORDS[p.badge] || ''}`, 1.5],
    [String(p.description || '').slice(0, DESCRIPTION_CHARS), 1],
    [p.store?.name, 0.5],
  ],
});

/**
 * Products as the public lists show them (cards), in the order of `ids`;
 * anything no longer showable drops out.
 */
const cardsFor = async (ids) => {
  if (!ids.length) return [];
  const showable = new Set((await prisma.product.findMany({
    where: { ...PUBLIC_WHERE, id: { in: ids } }, select: { id: true },
  })).map((p) => p.id));
  const kept = ids.filter((id) => showable.has(id));
  return productService.toPublicList(await productRepository.findListByIds(kept));
};

module.exports = {
  PUBLIC_WHERE, loadCatalog, documentOf, cardsFor,
};
