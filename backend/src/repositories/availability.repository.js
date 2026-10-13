const prisma = require('../config/database');
const { withDeadlockRetry } = require('../lib/dbRetry');
const { changeStock } = require('./stockLedger');
const { invalidateProductIds } = require('./product.repository');

/**
 * Available Today windows (ProductAvailability).
 *
 * While a window is LIVE its product's stock IS the window's remaining
 * quantity: opening a window sets the stock to its batch, ending it takes the
 * stock to 0. Every such move goes through the stock ledger, under the
 * product's row lock, with an InventoryMovement, so a checkout racing the
 * clock either gets the last unit or fails cleanly.
 *
 * Each state change first claims the window with a conditional update on its
 * current status, so the clock and a seller acting at the same moment cannot
 * both move it.
 */

const PRODUCT_SELECT = {
  id: true,
  name: true,
  slug: true,
  images: true,
  price: true,
  salePrice: true,
  saleStartsAt: true,
  saleEndsAt: true,
  priceTiers: true,
  variations: true,
  stock: true,
  status: true,
  listingKind: true,
  productType: true,
  details: true,
  fulfillment: true,
  categoryId: true,
  municipalityId: true,
  returnPolicy: true,
  deletedAt: true,
};

/** Set a product's stock to `target` inside a transaction, recorded in the ledger. */
const setStockTx = async (tx, productId, target, reason, referenceId, actorId) => {
  const rows = await tx.$queryRaw`SELECT stock FROM products WHERE id = ${productId} FOR UPDATE`;
  const current = Number(rows[0]?.stock || 0);
  const delta = target - current;
  if (delta === 0) return current;
  const balanceAfter = await changeStock(tx, productId, null, delta);
  if (balanceAfter === null) return current;
  await tx.inventoryMovement.create({
    data: { productId, quantityDelta: delta, balanceAfter, reason, referenceId, actorId: actorId || null },
  });
  return balanceAfter;
};

/** End a LIVE window (stock to 0) or cancel a SCHEDULED one, inside a transaction. */
const closeTx = async (tx, window, { actorId = null, now = new Date() } = {}) => {
  const toStatus = window.status === 'SCHEDULED' ? 'CANCELLED' : 'ENDED';
  const claimed = await tx.productAvailability.updateMany({
    where: { id: window.id, status: window.status },
    data: { status: toStatus, endedAt: now },
  });
  if (claimed.count === 0) return false;
  if (window.status === 'LIVE') {
    await setStockTx(tx, window.productId, 0, 'TODAY_END', window.id, actorId);
  }
  return true;
};

/**
 * Open a SCHEDULED window: any other live window of the product ends first,
 * then the product's stock becomes this window's quantity.
 * @returns {Promise<Boolean>} whether this call opened it
 */
const openWindow = async (id, { actorId = null } = {}) => {
  const opened = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    const window = await tx.productAvailability.findUnique({ where: { id } });
    if (!window || window.status !== 'SCHEDULED') return null;
    const others = await tx.productAvailability.findMany({
      where: { productId: window.productId, status: 'LIVE', id: { not: id } },
    });
    for (const other of others) await closeTx(tx, other, { actorId });
    const claimed = await tx.productAvailability.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'LIVE' },
    });
    if (claimed.count === 0) return null;
    await setStockTx(tx, window.productId, Math.max(0, window.quantity - window.soldCount), 'TODAY_OPEN', id, actorId);
    return window.productId;
  }));
  if (opened) await invalidateProductIds([opened]);
  return Boolean(opened);
};

/**
 * End a window now: a LIVE one stops taking orders (stock to 0), a SCHEDULED
 * one is withdrawn. Orders already placed stay; the seller fulfils them.
 * @returns {Promise<Boolean>} whether this call closed it
 */
const closeWindow = async (id, { actorId = null } = {}) => {
  const closed = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    const window = await tx.productAvailability.findUnique({ where: { id } });
    if (!window || !['LIVE', 'SCHEDULED'].includes(window.status)) return null;
    return (await closeTx(tx, window, { actorId })) ? window.productId : null;
  }));
  if (closed) await invalidateProductIds([closed]);
  return Boolean(closed);
};

/**
 * Add to (or take from) a window's batch. A scheduled window just changes its
 * quantity; a live one changes the product's stock with it, never below what
 * is already sold.
 */
const adjustQuantity = async (id, delta, { actorId = null } = {}) => {
  const result = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    const window = await tx.productAvailability.findUnique({ where: { id } });
    if (!window || !['LIVE', 'SCHEDULED'].includes(window.status)) {
      const err = new Error('This window is no longer open');
      err.code = 'WINDOW_CLOSED';
      throw err;
    }
    if (window.status === 'LIVE') {
      // Throws INSUFFICIENT_STOCK when taking more than is left.
      const balanceAfter = await changeStock(tx, window.productId, null, delta);
      if (balanceAfter !== null) {
        await tx.inventoryMovement.create({
          data: {
            productId: window.productId, quantityDelta: delta, balanceAfter, reason: 'TODAY_ADJUST', referenceId: id, actorId,
          },
        });
      }
    } else if (window.quantity + delta < 1) {
      const err = new Error('A window needs at least 1 to sell');
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }
    return tx.productAvailability.update({ where: { id }, data: { quantity: { increment: delta } } });
  }));
  await invalidateProductIds([result.productId]);
  return result;
};

const create = (data) => prisma.productAvailability.create({ data });

/**
 * Create several SCHEDULED windows of one product in one transaction: all or
 * none. `posts` is [{ data, label }]; before each create the product's open
 * and upcoming windows are checked for an overlap, and `onOverlap(label)`
 * makes the error thrown when there is one.
 */
const createMany = (productId, posts, onOverlap) => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
  // Lock the product row so two batches of it cannot both pass the overlap check.
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
  const rows = [];
  for (const { data, label } of posts) {
    if (await findOverlap(productId, data.ordersOpenAt, data.ordersCloseAt, null, tx)) throw onOverlap(label);
    rows.push(await tx.productAvailability.create({ data: { ...data, productId, status: 'SCHEDULED' } }));
  }
  return rows;
}));

/**
 * Change a SCHEDULED or LIVE window in one transaction: `next` holds its new
 * fields, productId and quantity. Under the products' row locks it re-reads
 * the window and runs `check(latest)` (which throws to refuse), then checks
 * the product's other windows for an overlap (`onOverlap()` makes the error).
 * A live window that moves to another product, or to a later opening time,
 * gives its old product's stock back to 0 (it waits again when it now opens
 * later); a window still live gets its product's stock set to what is left.
 * @returns {Promise<{ openNow: Boolean }>} whether a waiting window is due now (call openWindow)
 */
const reshape = async (id, next, { actorId = null, check = () => {}, onOverlap } = {}) => {
  const touched = new Set();
  const result = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    const first = await tx.productAvailability.findUnique({ where: { id }, select: { productId: true } });
    if (!first) throw Object.assign(new Error('Not found'), { code: 'WINDOW_CLOSED' });
    // Lock both products (in a fixed order) so stock and overlaps cannot race.
    for (const productId of [...new Set([first.productId, next.productId])].sort()) {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
    }
    const window = await tx.productAvailability.findUnique({ where: { id } });
    check(window);
    if (await findOverlap(next.productId, next.ordersOpenAt, next.ordersCloseAt, id, tx)) throw onOverlap();

    const now = Date.now();
    const opensLater = next.ordersOpenAt.getTime() > now;
    let status = window.status;
    if (status === 'LIVE' && (next.productId !== window.productId || opensLater)) {
      await setStockTx(tx, window.productId, 0, 'TODAY_END', id, actorId);
      if (opensLater) status = 'SCHEDULED';
    }
    const claimed = await tx.productAvailability.updateMany({
      where: { id, status: window.status },
      data: {
        productId: next.productId,
        quantity: next.quantity,
        mode: next.mode,
        ordersOpenAt: next.ordersOpenAt,
        ordersCloseAt: next.ordersCloseAt,
        readyFrom: next.readyFrom,
        readyUntil: next.readyUntil,
        prepMinutes: next.prepMinutes,
        fulfillment: next.fulfillment,
        note: next.note,
        status,
      },
    });
    if (claimed.count === 0) throw Object.assign(new Error('This window is no longer open'), { code: 'WINDOW_CLOSED' });
    if (status === 'LIVE') {
      await setStockTx(tx, next.productId, Math.max(0, next.quantity - window.soldCount), 'TODAY_ADJUST', id, actorId);
    }
    touched.add(window.productId).add(next.productId);
    return { openNow: status === 'SCHEDULED' && !opensLater };
  }));
  await invalidateProductIds([...touched]);
  return result;
};

const update = async (id, data) => {
  const updated = await prisma.productAvailability.update({ where: { id }, data });
  await invalidateProductIds([updated.productId]);
  return updated;
};

const findById = (id) => prisma.productAvailability.findUnique({
  where: { id },
  include: { product: { select: PRODUCT_SELECT } },
});

/**
 * Another open or upcoming window of the product whose ordering time
 * overlaps. Pass `db` to check inside a transaction.
 */
const findOverlap = (productId, ordersOpenAt, ordersCloseAt, excludeId = null, db = prisma) => db.productAvailability.findFirst({
  where: {
    productId,
    status: { in: ['SCHEDULED', 'LIVE'] },
    ...(excludeId ? { id: { not: excludeId } } : {}),
    ordersOpenAt: { lt: ordersCloseAt },
    ordersCloseAt: { gt: ordersOpenAt },
  },
});

/** A shop's windows: open and upcoming, or recently ended. */
const findForStore = (storeId, { scope = 'active', take = 100 } = {}) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return prisma.productAvailability.findMany({
    where: scope === 'ended'
      ? { storeId, status: { in: ['ENDED', 'CANCELLED'] }, updatedAt: { gte: since } }
      : { storeId, status: { in: ['LIVE', 'SCHEDULED'] } },
    include: { product: { select: PRODUCT_SELECT } },
    orderBy: scope === 'ended' ? { updatedAt: 'desc' } : { ordersOpenAt: 'asc' },
    take,
  });
};

/** Windows the clock must move: due to open, and due to end. */
const findDue = (now = new Date()) => Promise.all([
  prisma.productAvailability.findMany({
    where: { status: 'SCHEDULED', ordersOpenAt: { lte: now } },
    orderBy: { ordersOpenAt: 'asc' },
    take: 200,
  }),
  prisma.productAvailability.findMany({
    where: { status: 'LIVE', ordersCloseAt: { lte: now } },
    take: 200,
  }),
]);

module.exports = {
  PRODUCT_SELECT,
  setStockTx,
  openWindow,
  closeWindow,
  adjustQuantity,
  create,
  createMany,
  reshape,
  update,
  findById,
  findOverlap,
  findForStore,
  findDue,
};
