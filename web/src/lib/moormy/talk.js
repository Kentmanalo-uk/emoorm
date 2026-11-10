/**
 * Moormy's conversation on this device (docs/moormy): the turns shown in the
 * panel and the state the server hands back, so typing and speaking share
 * one history. Nothing of it is kept on the server. Capped, and every read
 * and write survives blocked storage (private windows): then it lasts the
 * visit only.
 */

const KEY = 'emoorm-moormy-talk';
const PREFS = 'emoorm-moormy-prefs';
export const MAX_TURNS = 30;

const EMPTY = { messages: [], state: null };

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

/** What a kept message needs of a product card (the full card is large). */
const keepCard = (p) => ({
  id: p.id,
  name: p.name,
  slug: p.slug,
  price: p.price,
  salePrice: p.salePrice,
  saleStartsAt: p.saleStartsAt,
  saleEndsAt: p.saleEndsAt,
  priceTiers: p.priceTiers,
  stock: p.stock,
  listingKind: p.listingKind,
  productType: p.productType,
  details: p.details,
  fulfillment: p.fulfillment,
  weightGrams: p.weightGrams,
  images: Array.isArray(p.images) ? p.images.slice(0, 1) : p.images,
  variations: p.variations,
  imageOverlay: p.imageOverlay,
  photoDesign: p.photoDesign,
  badge: p.badge,
  storeId: p.storeId,
  categoryId: p.categoryId,
  soldCount: p.soldCount,
  reviewCount: p.reviewCount,
  averageRating: p.averageRating,
  availability: p.availability,
  storeBestSeller: p.storeBestSeller,
  store: p.store ? {
    id: p.store.id,
    name: p.store.name,
    slug: p.store.slug,
    logo: p.store.logo,
    readyToSell: p.store.readyToSell,
    vacationUntil: p.store.vacationUntil,
    municipality: p.store.municipality,
  } : null,
});

/** A message as it is kept: cards trimmed, nothing that cannot be saved. */
export const keepMessage = (m) => ({
  ...m,
  cards: Array.isArray(m.cards) ? m.cards.map(keepCard) : undefined,
  pending: undefined,
});

/** The conversation on this device. */
export const loadTalk = () => {
  const saved = read(KEY);
  if (!saved || !Array.isArray(saved.messages)) return EMPTY;
  return { messages: saved.messages.slice(-MAX_TURNS), state: saved.state && typeof saved.state === 'object' ? saved.state : null };
};

/** Keep the conversation (the newest MAX_TURNS messages; fewer if storage is full). */
export const saveTalk = ({ messages, state }) => {
  let kept = messages.slice(-MAX_TURNS).map(keepMessage);
  while (kept.length) {
    if (write(KEY, { messages: kept, state })) return true;
    kept = kept.slice(Math.ceil(kept.length / 2));
  }
  return write(KEY, { messages: [], state });
};

export const clearTalk = () => {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
};

/** { muted, sensitivity, listen } */
export const loadPrefs = () => {
  const p = read(PREFS) || {};
  return {
    muted: p.muted === true,
    listen: p.listen === true,
    sensitivity: [0.85, 1, 1.2].includes(p.sensitivity) ? p.sensitivity : 1,
  };
};

export const savePrefs = (patch) => {
  const next = { ...loadPrefs(), ...patch };
  write(PREFS, next);
  return next;
};
