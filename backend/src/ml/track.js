const prisma = require('../config/database');
const settings = require('./settings');
const counters = require('./counters');

/**
 * The hooks the shop's own code calls to feed the ML engine. Each is safe to
 * call anywhere: it does nothing while the engine is off, and it never throws
 * or makes the caller wait on more than one cached settings read.
 */

// Products a buyer ordered this recently left the cart because of checkout,
// not because they changed their mind.
const JUST_ORDERED_MS = 15 * 60 * 1000;

/**
 * Before a saved list is replaced (services/savedItems): the product ids in
 * it now, or null while the engine is off (then nothing is counted).
 * @param {'cart'|'wishlist'} list
 */
const savedBefore = async (list, userId) => {
  try {
    if (!(await settings.isOn())) return null;
    const model = list === 'cart' ? prisma.cartItem : prisma.wishlistItem;
    const rows = await model.findMany({ where: { userId }, select: { productId: true } });
    return rows.map((r) => r.productId);
  } catch {
    return null;
  }
};

/** After it was replaced: count what came in and went out. Fire and forget. */
const savedAfter = (list, userId, before, after) => {
  if (!Array.isArray(before)) return;
  (async () => {
    const { added, removed } = counters.diff(before, after);
    if (list === 'wishlist') {
      counters.record('favorite_add', added);
      counters.record('favorite_remove', removed);
      return;
    }
    counters.record('cart_add', added);
    if (!removed.length) return;
    const ordered = await prisma.orderItem.findMany({
      where: {
        productId: { in: removed },
        order: { buyerId: userId, createdAt: { gte: new Date(Date.now() - JUST_ORDERED_MS) } },
      },
      select: { productId: true },
    });
    const bought = new Set(ordered.map((o) => o.productId));
    counters.record('cart_remove', removed.filter((id) => !bought.has(id)));
  })().catch(() => {});
};

module.exports = { savedBefore, savedAfter };
