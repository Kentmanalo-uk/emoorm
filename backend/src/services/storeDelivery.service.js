const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { invalidate, TAGS } = require('../lib/cachePolicy');
const shopReadiness = require('./shopReadiness.service');
const { MODES, modeOf } = require('./deliveryQuote.service');

/**
 * Store Delivery Service
 *
 * A seller's own delivery in one piece: WHERE the shop delivers (its service
 * areas: whole towns, or barangays) and HOW MUCH (its fee mode and the fees
 * that mode needs). Saved together in one transaction, so a shop is never
 * left with new areas and an old way of pricing them (deliveryQuote.service
 * reads both).
 *
 *   GET /stores/my/delivery  → the saved state
 *   PUT /stores/my/delivery  { mode, flatFee?, areas: [{ municipalityId,
 *     barangay|null, fee? }], perKm?: { baseFee, includedKm, perKm, maxKm } }
 *     → the saved state, or 400 with `errors: [{ field, message, … }]`
 *     naming each place still missing a fee.
 *
 * Fees are ₱0 to ₱5,000 with at most two decimals. FLAT needs flatFee
 * (kept as Store.deliveryFee); PER_TOWN one fee per town (written on every
 * area of the town); PER_BARANGAY a fee on every area (a whole town is one
 * area); PER_KM a starting fee. Fees for the other modes are kept as sent,
 * so switching back and forth loses nothing.
 */

const MAX_FEE = 5000;
const MAX_AREAS = 1000;

/**
 * "Barangay Poblacion" (a typed "Brgy." dropped): messages show as toasts,
 * which read the full stop in "Brgy." as the end of a sentence.
 */
const brgyLabel = (name) => `Barangay ${String(name).replace(/^(brgy\.?|bgy\.?|barangay)\s*/i, '')}`;

/**
 * A peso fee: null when blank, else 0 to ₱5,000 with at most two decimals;
 * undefined when it is not one.
 */
const readFee = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const fee = Number(value);
  if (!Number.isFinite(fee) || fee < 0 || fee > MAX_FEE) return undefined;
  if (Math.abs(Math.round(fee * 100) - fee * 100) > 1e-6) return undefined;
  return Math.round(fee * 100) / 100;
};
const FEE_RULE = `a fee from ₱0 to ₱${MAX_FEE.toLocaleString('en-PH')} (up to 2 decimals)`;

/** By distance: the starting fee and the km settings (store.service's limits). */
const PER_KM_FIELDS = {
  baseFee: { column: 'deliveryBaseFee', max: 5000, label: 'The starting fee', unit: 'peso' },
  includedKm: { column: 'deliveryIncludedKm', max: 100, label: 'The km included', unit: 'km' },
  perKm: { column: 'deliveryPerKm', max: 5000, label: 'The fee for each extra km', unit: 'peso' },
  maxKm: { column: 'deliveryMaxKm', max: 100, label: 'The farthest distance', unit: 'km' },
};

const num = (v) => (v == null ? null : Number(v));

/** The shop's delivery as the seller screens show it. */
const stateOf = async (storeId) => {
  const [store, areas] = await Promise.all([
    prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true, municipalityId: true, latitude: true, longitude: true, deliveryFeeMode: true, deliveryFee: true,
        deliveryBaseFee: true, deliveryIncludedKm: true, deliveryPerKm: true, deliveryMaxKm: true,
      },
    }),
    prisma.storeServiceArea.findMany({
      where: { storeId },
      select: {
        municipalityId: true, barangay: true, fee: true, municipality: { select: { id: true, name: true } },
      },
      orderBy: [{ municipality: { name: 'asc' } }, { barangay: 'asc' }],
    }),
  ]);
  return {
    mode: modeOf(store),
    flatFee: num(store.deliveryFee),
    perKm: {
      baseFee: num(store.deliveryBaseFee),
      includedKm: num(store.deliveryIncludedKm),
      perKm: num(store.deliveryPerKm),
      maxKm: num(store.deliveryMaxKm),
    },
    areas: areas.map((a) => ({
      municipalityId: a.municipalityId, municipality: a.municipality, barangay: a.barangay, fee: num(a.fee),
    })),
    // By distance starts at the shop's pin.
    pinned: store.latitude != null && store.longitude != null,
    homeMunicipalityId: store.municipalityId,
  };
};

const myStoreId = async (userId) => {
  const store = await prisma.store.findUnique({ where: { ownerId: userId }, select: { id: true, slug: true, deletedAt: true } });
  if (!store || store.deletedAt) throw new ApiError('You do not have a store yet', 404);
  return store;
};

/** GET /stores/my/delivery */
const getMyDelivery = async (userId) => stateOf((await myStoreId(userId)).id);

/**
 * The request checked and put in the shape it is saved in.
 * @returns {Promise<{ mode, flatFee, perKm, rows }>} rows: [{ municipalityId, barangay, fee }]
 */
const readRequest = async (body) => {
  const input = body || {};
  const errors = [];
  const fail = (field, message, extra = {}) => errors.push({ field, message, ...extra });

  const mode = String(input.mode || '').trim().toUpperCase();
  if (!MODES.includes(mode)) {
    throw new ApiError('Choose how you charge for delivery', 400, [{ field: 'mode', message: 'Choose how you charge for delivery' }]);
  }
  if (input.areas !== undefined && !Array.isArray(input.areas)) throw new ApiError('Areas must be a list', 400);
  const list = Array.isArray(input.areas) ? input.areas : [];
  if (list.length > MAX_AREAS) throw new ApiError(`At most ${MAX_AREAS} delivery places`, 400);

  // The towns must be ones the platform serves.
  const townIds = [...new Set(list.map((a) => String(a?.municipalityId || '')).filter(Boolean))];
  const towns = townIds.length
    ? await prisma.municipality.findMany({ where: { id: { in: townIds }, isActive: true }, select: { id: true, name: true } })
    : [];
  const townName = new Map(towns.map((t) => [t.id, t.name]));

  // One row per place (a barangay named twice, in any case, is one place).
  const seen = new Set();
  const rows = [];
  list.forEach((a, i) => {
    const municipalityId = String(a?.municipalityId || '');
    if (!municipalityId || !townName.has(municipalityId)) {
      fail(`areas[${i}].municipalityId`, 'Choose a town from the list', { index: i });
      return;
    }
    const barangay = a.barangay == null ? '' : String(a.barangay).replace(/\s+/g, ' ').trim();
    if (barangay.length > 120) {
      fail(`areas[${i}].barangay`, 'A barangay name is at most 120 letters', { index: i });
      return;
    }
    const key = `${municipalityId}|${barangay.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    const fee = readFee(a.fee);
    const label = barangay ? brgyLabel(barangay) : `${townName.get(municipalityId)} (whole town)`;
    if (fee === undefined) fail(`areas[${i}].fee`, `${label}: enter ${FEE_RULE}`, { index: i, municipalityId, barangay: barangay || null });
    rows.push({
      index: i, municipalityId, barangay: barangay || null, fee: fee === undefined ? null : fee, label,
    });
  });

  // FLAT: the one fee.
  let flatFee;
  if (input.flatFee !== undefined) {
    flatFee = readFee(input.flatFee);
    if (flatFee === undefined) fail('flatFee', `Enter ${FEE_RULE}`);
  }
  if (mode === 'FLAT' && (flatFee === null || flatFee === undefined) && !errors.some((e) => e.field === 'flatFee')) {
    fail('flatFee', 'Enter your delivery fee');
  }

  // A fee for each town, or for each place.
  if (mode === 'PER_TOWN') {
    for (const id of [...new Set(rows.map((r) => r.municipalityId))]) {
      const inTown = rows.filter((r) => r.municipalityId === id);
      const fees = [...new Set(inTown.map((r) => r.fee).filter((f) => f != null))];
      if (inTown.some((r) => errors.some((e) => e.index === r.index))) continue;
      if (fees.length > 1) {
        fail(`town:${id}`, `${townName.get(id)} has more than one fee. Use one fee for the town.`, { municipalityId: id, barangay: null });
      } else if (!fees.length) {
        fail(`town:${id}`, `Enter a fee for ${townName.get(id)}`, { municipalityId: id, barangay: null });
      } else {
        for (const r of inTown) r.fee = fees[0];
      }
    }
  }
  if (mode === 'PER_BARANGAY') {
    for (const r of rows) {
      if (r.fee == null && !errors.some((e) => e.index === r.index)) {
        fail(`areas[${r.index}].fee`, `Enter a fee for ${r.label}`, { index: r.index, municipalityId: r.municipalityId, barangay: r.barangay });
      }
    }
  }

  // By distance: the starting fee, the km settings (blank: the platform's).
  let perKm = null;
  if (input.perKm && typeof input.perKm === 'object') {
    perKm = {};
    for (const [key, rule] of Object.entries(PER_KM_FIELDS)) {
      const value = input.perKm[key];
      if (value === undefined) continue;
      if (value === null || value === '') {
        perKm[rule.column] = null;
        continue;
      }
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > rule.max || (key === 'maxKm' && n < 0.5)) {
        fail(`perKm.${key}`, rule.unit === 'km'
          ? `${rule.label} must be ${key === 'maxKm' ? '0.5' : '0'} to ${rule.max} km${key === 'maxKm' ? ', or left blank' : ''}`
          : `${rule.label} must be ₱0 to ₱${rule.max.toLocaleString('en-PH')}`);
        continue;
      }
      perKm[rule.column] = rule.unit === 'km' ? Math.round(n * 10) / 10 : Math.round(n * 100) / 100;
    }
  }
  if (mode === 'PER_KM' && !errors.some((e) => e.field === 'perKm.baseFee')) {
    const base = perKm && 'deliveryBaseFee' in perKm ? perKm.deliveryBaseFee : undefined;
    if (base === null || base === undefined) fail('perKm.baseFee', 'Enter your starting fee (₱0 to ₱5,000)');
  }

  if (errors.length) {
    // In the order the places were sent (the order the seller sees them).
    errors.sort((a, b) => (a.index ?? Infinity) - (b.index ?? Infinity));
    const more = errors.length - 1;
    throw new ApiError(more ? `${errors[0].message} (and ${more} more)` : errors[0].message, 400, errors);
  }
  return {
    mode, flatFee, perKm, rows: rows.map(({ municipalityId, barangay, fee }) => ({ municipalityId, barangay, fee })),
  };
};

/** PUT /stores/my/delivery: the areas, their fees and the mode, all at once. */
const saveMyDelivery = async (userId, body) => {
  const store = await myStoreId(userId);
  const { mode, flatFee, perKm, rows } = await readRequest(body);
  await prisma.$transaction(async (tx) => {
    await tx.storeServiceArea.deleteMany({ where: { storeId: store.id } });
    if (rows.length) {
      await tx.storeServiceArea.createMany({ data: rows.map((r) => ({ storeId: store.id, ...r })) });
    }
    await tx.store.update({
      where: { id: store.id },
      data: {
        deliveryFeeMode: mode,
        ...(flatFee !== undefined ? { deliveryFee: flatFee } : {}),
        ...(perKm || {}),
      },
    });
  });
  // Areas and fees decide whether the shop is ready to sell; listings and
  // checkout read the shop (cached).
  shopReadiness.forget(store.id);
  await invalidate([TAGS.stores, TAGS.products, TAGS.store(store.id), store.slug && TAGS.store(store.slug)].filter(Boolean));
  return stateOf(store.id);
};

module.exports = { getMyDelivery, saveMyDelivery, readFee };
