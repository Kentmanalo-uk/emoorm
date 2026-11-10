const prisma = require('../config/database');
const { Prisma } = require('@prisma/client');
const { dayKey } = require('../utils/manilaTime');

/**
 * Totals per product, Manila day and kind of event (ml_event_counts): how
 * often a product went into carts, came out of them, was saved and unsaved.
 * No buyer is recorded (the owner chose totals only); product page views are
 * already counted in product_views, and searches stay on the device.
 *
 * Counting never slows or breaks what it counts: record() only adds to a
 * buffer in memory, and the buffer is written in one statement a minute (or
 * when it fills). A restart loses at most the last minute of counts.
 * Nothing is counted while the engine is off.
 */

const EVENTS = ['cart_add', 'cart_remove', 'favorite_add', 'favorite_remove'];
const FLUSH_MS = 60 * 1000;
const MAX_KEYS = 500; // write early once this many day/kind/product keys wait
const BATCH = 200; // rows per INSERT

const buffer = new Map(); // `${day}|${event}|${productId}` -> count
let flushing = null;
let timer = null;

/**
 * Count `n` events of one kind for these products. Fire and forget.
 * @param {String} event - one of EVENTS
 * @param {String[]} productIds
 */
const record = (event, productIds, n = 1) => {
  if (!EVENTS.includes(event) || !Array.isArray(productIds) || !productIds.length) return;
  // Counting only while the engine is on; the check is cached and never throws.
  require('./settings').isOn().then((on) => {
    if (!on) return;
    const day = dayKey(new Date());
    for (const id of productIds) {
      if (typeof id !== 'string' || !id || id.length > 191) continue;
      const key = `${day}|${event}|${id}`;
      buffer.set(key, (buffer.get(key) || 0) + n);
    }
    if (buffer.size >= MAX_KEYS) flush().catch(() => {});
  }).catch(() => {});
};

/** Write what is waiting. Safe to call at any time; one write at a time. */
const flush = async () => {
  if (flushing) return flushing;
  if (!buffer.size) return { written: 0 };
  const rows = [...buffer.entries()];
  buffer.clear();
  flushing = (async () => {
    let written = 0;
    try {
      for (let i = 0; i < rows.length; i += BATCH) {
        const values = rows.slice(i, i + BATCH).map(([key, count]) => {
          const [day, event, productId] = key.split('|');
          return Prisma.sql`(${day}, ${event}, ${productId}, ${count})`;
        });
        // eslint-disable-next-line no-await-in-loop
        await prisma.$executeRaw`
          INSERT INTO ml_event_counts (day, event_type, product_id, count)
          VALUES ${Prisma.join(values)}
          ON DUPLICATE KEY UPDATE count = count + VALUES(count)`;
        written += values.length;
      }
    } catch (err) {
      // Counts are a nice-to-have: log once and move on (no retry loop).
      console.error('[ml] could not write event counts:', err.message);
    }
    return { written };
  })();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
};

/** Start the once-a-minute write (server start). */
const start = () => {
  if (timer) return;
  timer = setInterval(() => { flush().catch(() => {}); }, FLUSH_MS);
  timer.unref();
};

const pending = () => buffer.size;

/**
 * Cart and wishlist changes, from the lists the app saves whole
 * (services/savedItems): what came in and what went out. A cart emptied by
 * checkout is not counted as taken out (the products just ordered are left
 * out of `removed`).
 */
const diff = (before, after) => {
  const was = new Set(before);
  const now = new Set(after);
  return {
    added: [...now].filter((id) => !was.has(id)),
    removed: [...was].filter((id) => !now.has(id)),
  };
};

module.exports = {
  EVENTS, record, flush, start, pending, diff,
};
