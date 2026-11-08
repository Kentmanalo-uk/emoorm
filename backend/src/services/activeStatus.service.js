const prisma = require('../config/database');
const { activeStatus } = require('../utils/activity');

/**
 * Who is active now (utils/activity.js), for the shop pages, the shop
 * directory, product pages and chats.
 *
 * Never part of a cached answer: store and product payloads are cached for
 * minutes and shared by everyone, so the status is added after the cache,
 * in one query by user id. Busy pages ask on every view, so an answer is
 * reused for MEMO_MS (a status that is half a minute late is still right
 * about "active now", which spans five).
 */

const MEMO_MS = 30 * 1000;
const MEMO_MAX = 5000;
// userId -> { lastActiveAt: Date|null, at: Number }
const memo = new Map();

/**
 * When each of these people was last active, from the memo where it is fresh.
 * @param {String[]} userIds
 * @returns {Promise<Map<String, Date|null>>}
 */
const lastActiveOf = async (userIds) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (!ids.length) return out;
  const now = Date.now();
  const ask = [];
  for (const id of ids) {
    const hit = memo.get(id);
    if (hit && hit.at > now - MEMO_MS) out.set(id, hit.lastActiveAt);
    else ask.push(id);
  }
  if (ask.length) {
    const rows = await prisma.user.findMany({
      where: { id: { in: ask } },
      select: { id: true, lastActiveAt: true },
    });
    const found = new Map(rows.map((r) => [r.id, r.lastActiveAt || null]));
    for (const id of ask) {
      const lastActiveAt = found.get(id) || null;
      out.set(id, lastActiveAt);
      memo.delete(id);
      memo.set(id, { lastActiveAt, at: now });
    }
    while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
  }
  return out;
};

/**
 * { active, activeAt } for each of these people.
 * @param {String[]} userIds
 * @returns {Promise<Map<String, { active: Boolean, activeAt: String|null }>>}
 */
const statusOf = async (userIds) => {
  const last = await lastActiveOf(userIds);
  const now = Date.now();
  const out = new Map();
  for (const [id, date] of last) out.set(id, activeStatus(date, now));
  return out;
};

const ownerIdOf = (store) => store?.ownerId || store?.owner?.id || null;
const NOT_ACTIVE = Object.freeze({ active: false, activeAt: null });

/**
 * The same stores, each saying whether its owner is active now.
 * @param {Object[]} stores - each with ownerId (or owner.id)
 * @returns {Promise<Object[]>}
 */
const withStoreActivity = async (stores) => {
  const list = stores || [];
  if (!list.length) return list;
  const status = await statusOf(list.map(ownerIdOf));
  return list.map((s) => (s ? { ...s, ...(status.get(ownerIdOf(s)) || NOT_ACTIVE) } : s));
};

/** One store, saying whether its owner is active now. */
const withOneStoreActivity = async (store) => {
  if (!store) return store;
  const [out] = await withStoreActivity([store]);
  return out;
};

/** The status of one person. */
const statusOfUser = async (userId) => (await statusOf([userId])).get(String(userId)) || { ...NOT_ACTIVE };

/** Forget memoised answers (tests). */
const forget = () => memo.clear();

module.exports = { MEMO_MS, statusOf, statusOfUser, withStoreActivity, withOneStoreActivity, forget };
