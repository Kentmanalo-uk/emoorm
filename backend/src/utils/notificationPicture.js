const prisma = require('../config/database');

/**
 * Notification pictures
 *
 * What a notification shows on its left, like the shopping apps do: the
 * product for an order, a return or a listing; the person for a message; the
 * shop for news about a shop. Worked out from (type, relatedId, data) when
 * notifications are read, so every row already in the database gets one
 * without a backfill. A whole page costs at most five indexed lookups, and
 * this never throws: a notification without a picture keeps its icon.
 *
 * `picture` is { url, name, kind } where kind is 'product', 'person' or
 * 'store' (products are drawn square, people round), or null.
 */

const ORDER_TYPES = new Set(['ORDER_RECEIVED', 'ORDER_CONFIRMED', 'ORDER_READY', 'ORDER_COMPLETED', 'ORDER_CANCELLED']);
const RETURN_TYPES = new Set([
  'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_AWAITING_SHIPMENT',
  'RETURN_RECEIVED', 'RETURN_REFUNDED', 'RETURN_CANCELLED', 'RETURN_CLOSED',
]);
const PRODUCT_TYPES = new Set(['PRODUCT_APPROVED', 'PRODUCT_SUSPENDED', 'STORE_NEW_PRODUCT', 'STORE_PROMOTION']);
// A store id is the relatedId of these (shop news for shoppers; the shop's own
// approval notice for its seller).
const STORE_TYPES = new Set(['STORE_ANNOUNCEMENT', 'SELLER_APPROVED', 'SELLER_SUSPENDED']);

const firstImage = (raw) => {
  let list = raw;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = [];
    }
  }
  const first = Array.isArray(list) ? list.find((x) => typeof x === 'string' && x) : null;
  return first || null;
};

const pictureOf = (n, maps) => {
  const sender = n.data && n.data.sender;
  if (n.type === 'STORE_MESSAGE' && sender && sender.name) {
    return { url: sender.photo || null, name: sender.name, kind: 'person' };
  }
  if (!n.relatedId) return null;
  // Older message notifications carry no sender: the other side of the
  // conversation sent it (the buyer to a seller, the shop to a buyer).
  if (n.type === 'STORE_MESSAGE') return maps.conversations.get(`${n.relatedId}:${n.audience}`) || null;
  if (ORDER_TYPES.has(n.type)) return maps.orders.get(n.relatedId) || null;
  if (RETURN_TYPES.has(n.type)) return maps.returns.get(n.relatedId) || null;
  if (PRODUCT_TYPES.has(n.type)) return maps.products.get(n.relatedId) || null;
  if (STORE_TYPES.has(n.type)) return maps.stores.get(n.relatedId) || null;
  return null;
};

/**
 * Attach a `picture` to each notification in a list.
 * @param {Array<Object>} notifications
 * @returns {Promise<Array<Object>>} the same rows, each with a `picture`
 */
const attachPictures = async (notifications) => {
  const list = Array.isArray(notifications) ? notifications : [];
  if (list.length === 0) return list;

  try {
    const ids = { orders: new Set(), returns: new Set(), products: new Set(), stores: new Set(), conversations: new Set() };
    for (const n of list) {
      if (!n || !n.relatedId) continue;
      if (n.type === 'STORE_MESSAGE') {
        if (!(n.data && n.data.sender && n.data.sender.name)) ids.conversations.add(n.relatedId);
      } else if (ORDER_TYPES.has(n.type)) ids.orders.add(n.relatedId);
      else if (RETURN_TYPES.has(n.type)) ids.returns.add(n.relatedId);
      else if (PRODUCT_TYPES.has(n.type)) ids.products.add(n.relatedId);
      else if (STORE_TYPES.has(n.type)) ids.stores.add(n.relatedId);
    }

    const [orderItems, returnItems, products, stores, conversations] = await Promise.all([
      ids.orders.size
        ? prisma.orderItem.findMany({
          where: { orderId: { in: [...ids.orders] } },
          select: { orderId: true, productName: true, product: { select: { images: true } } },
        })
        : [],
      ids.returns.size
        ? prisma.returnRequestItem.findMany({
          where: { returnRequestId: { in: [...ids.returns] } },
          select: { returnRequestId: true, orderItem: { select: { productName: true, product: { select: { images: true } } } } },
        })
        : [],
      ids.products.size
        ? prisma.product.findMany({ where: { id: { in: [...ids.products] } }, select: { id: true, name: true, images: true } })
        : [],
      ids.stores.size
        ? prisma.store.findMany({ where: { id: { in: [...ids.stores] } }, select: { id: true, name: true, logo: true } })
        : [],
      ids.conversations.size
        ? prisma.conversation.findMany({
          where: { id: { in: [...ids.conversations] } },
          select: { id: true, buyer: { select: { fullName: true, profilePhoto: true } }, store: { select: { name: true, logo: true } } },
        })
        : [],
    ]);

    // The first item that has a photo stands for the order (or return).
    const orders = new Map();
    for (const item of orderItems) {
      const url = firstImage(item.product && item.product.images);
      if (url && !orders.has(item.orderId)) orders.set(item.orderId, { url, name: item.productName, kind: 'product' });
    }
    const returns = new Map();
    for (const item of returnItems) {
      const url = firstImage(item.orderItem && item.orderItem.product && item.orderItem.product.images);
      if (url && !returns.has(item.returnRequestId)) {
        returns.set(item.returnRequestId, { url, name: item.orderItem.productName, kind: 'product' });
      }
    }
    const productMap = new Map();
    for (const p of products) {
      const url = firstImage(p.images);
      if (url) productMap.set(p.id, { url, name: p.name, kind: 'product' });
    }
    const storeMap = new Map();
    for (const s of stores) {
      if (s.logo) storeMap.set(s.id, { url: s.logo, name: s.name, kind: 'store' });
    }

    const conversationMap = new Map();
    for (const c of conversations) {
      if (c.buyer) conversationMap.set(`${c.id}:SELLER`, { url: c.buyer.profilePhoto || null, name: c.buyer.fullName, kind: 'person' });
      if (c.store) conversationMap.set(`${c.id}:BUYER`, { url: c.store.logo || null, name: c.store.name, kind: 'person' });
    }

    const maps = { orders, returns, products: productMap, stores: storeMap, conversations: conversationMap };
    return list.map((n) => ({ ...n, picture: pictureOf(n, maps) }));
  } catch (err) {
    console.error('[notificationPicture] failed to find pictures:', err.message);
    return list.map((n) => ({ ...n, picture: null }));
  }
};

module.exports = { attachPictures };
