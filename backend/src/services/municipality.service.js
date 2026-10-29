const prisma = require('../config/database');
const municipalityRepository = require('../repositories/municipality.repository');
const { cached, invalidate, TAGS } = require('../lib/cachePolicy');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Municipality Service
 * Contains business logic for municipality operations
 */

/**
 * Get all municipalities
 * @returns {Promise<Array>} List of municipalities
 */
const getAllMunicipalities = async (includeInactive = false) =>
  cached.municipalityList({ includeInactive }, () => municipalityRepository.findAll(includeInactive));

/**
 * Get municipality by ID
 * @param {String} id - Municipality ID
 * @returns {Promise<Object>} Municipality
 */
const getMunicipalityById = async (id) => {
  const municipality = await cached.municipality({ id }, () => municipalityRepository.findById(id));

  if (!municipality) {
    throw new ApiError('Municipality not found', 404);
  }

  return municipality;
};

/**
 * Get municipality by code
 * @param {String} code - Municipality code
 * @returns {Promise<Object>} Municipality
 */
const getMunicipalityByCode = async (code) => {
  const municipality = await cached.municipality({ code }, () => municipalityRepository.findByCode(code));

  if (!municipality) {
    throw new ApiError('Municipality not found', 404);
  }

  return municipality;
};

/**
 * Create municipality (Super Admin only)
 * @param {Object} data - Municipality data
 * @returns {Promise<Object>} Created municipality
 */
const createMunicipality = async (data) => {
  // Check if code already exists
  const existing = await municipalityRepository.findByCode(data.code);
  if (existing) {
    throw new ApiError('Municipality code already exists', 409);
  }

  const municipality = await municipalityRepository.createMunicipality(data);
  await invalidate(TAGS.municipalities);
  return municipality;
};

/**
 * Seed municipalities (Development only)
 * @returns {Promise<Object>} Seed result
 */
const seedMunicipalities = async () => {
  const municipalities = [
    { name: 'Baco', code: 'BACO' },
    { name: 'Bansud', code: 'BANSUD' },
    { name: 'Bongabong', code: 'BONGABONG' },
    { name: 'Bulalacao', code: 'BULALACAO' },
    { name: 'Calapan City', code: 'CALAPAN' },
    { name: 'Gloria', code: 'GLORIA' },
    { name: 'Mansalay', code: 'MANSALAY' },
    { name: 'Naujan', code: 'NAUJAN' },
    { name: 'Pinamalayan', code: 'PINAMALAYAN' },
    { name: 'Pola', code: 'POLA' },
    { name: 'Puerto Galera', code: 'PUERTO_GALERA' },
    { name: 'Roxas', code: 'ROXAS' },
    { name: 'San Teodoro', code: 'SAN_TEODORO' },
    { name: 'Socorro', code: 'SOCORRO' },
    { name: 'Victoria', code: 'VICTORIA' },
  ];

  const count = await municipalityRepository.seedMunicipalities(municipalities);
  await invalidate(TAGS.municipalities);

  return {
    created: count,
    total: municipalities.length,
    alreadyExists: municipalities.length - count,
  };
};

module.exports = {
  getAllMunicipalities,
  getMunicipalityById,
  getMunicipalityByCode,
  createMunicipality,
  updateMunicipality,
  seedMunicipalities,
};

async function updateMunicipality(id, data, actor) {
  const municipality = await municipalityRepository.findById(id);
  if (!municipality) throw new ApiError('Municipality not found', 404);
  if (actor?.role === 'MUNICIPAL_ADMIN' && actor.municipalityId !== id) {
    throw new ApiError('You can only update your assigned municipality', 403);
  }
  const allowed = ['logo', 'tagline', 'description', 'gallery'];
  const updateData = Object.fromEntries(Object.entries(data || {}).filter(([key]) => allowed.includes(key)));
  Object.assign(updateData, officeFields(data || {}));
  // The town's name, code and whether it is open: the super admin's alone.
  if (actor?.role === 'SUPER_ADMIN') Object.assign(updateData, await identityFields(municipality, data || {}));
  if (updateData.gallery !== undefined && (!Array.isArray(updateData.gallery) || updateData.gallery.length > 12)) {
    throw new ApiError('Gallery must contain up to 12 images', 400);
  }
  const updated = await municipalityRepository.updateMunicipality(id, updateData);
  // Municipality names are embedded in store and product payloads.
  await invalidate(TAGS.municipalities, TAGS.stores, TAGS.products);
  return updated;
}

// The municipal office people can visit or call: plain text, each optional.
const OFFICE_LIMITS = { officeAddress: 300, officeHours: 200, officePhone: 40, officeEmail: 160 };
function officeFields(data) {
  const out = {};
  for (const [key, max] of Object.entries(OFFICE_LIMITS)) {
    if (data[key] === undefined) continue;
    const value = String(data[key] ?? '').replace(/\s+/g, ' ').trim();
    if (value.length > max) throw new ApiError(`That is too long (at most ${max} characters)`, 400);
    if (key === 'officeEmail' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new ApiError('Enter a valid office email', 400);
    if (key === 'officePhone' && value && !/^[0-9+()\s-]{7,40}$/.test(value)) throw new ApiError('Enter a valid office phone number', 400);
    out[key] = value || null;
  }
  return out;
}

/**
 * A town's name, code and open/closed state, checked: both unique, the code
 * in capitals (letters, digits, - and _). Only the fields sent change.
 */
async function identityFields(municipality, data) {
  const out = {};
  if (data.name !== undefined) {
    const name = String(data.name || '').trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) throw new ApiError('Name must be 2 to 80 characters', 400);
    if (name !== municipality.name) {
      const clash = await prisma.municipality.findFirst({ where: { name, id: { not: municipality.id } }, select: { id: true } });
      if (clash) throw new ApiError('Another municipality already has this name', 409);
    }
    out.name = name;
  }
  if (data.code !== undefined) {
    const code = String(data.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{1,29}$/.test(code)) {
      throw new ApiError('Code must be 2 to 30 capital letters, digits, - or _', 400);
    }
    if (code !== municipality.code) {
      const clash = await municipalityRepository.findByCode(code);
      if (clash && clash.id !== municipality.id) throw new ApiError('Municipality code already exists', 409);
    }
    out.code = code;
  }
  if (data.isActive !== undefined) out.isActive = Boolean(data.isActive);
  return out;
}

/**
 * Per town, for the super admin's Municipalities page: orders in the last
 * 30 days (not cancelled) and how many admins it has (primary, others,
 * backups whose access has not ended).
 */
async function adminStats() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const [orders, admins] = await Promise.all([
    prisma.order.groupBy({
      by: ['storeId'],
      where: { createdAt: { gte: since }, status: { not: 'CANCELLED' } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['municipalityId'],
      where: {
        role: 'MUNICIPAL_ADMIN',
        deletedAt: null,
        isActive: true,
        OR: [{ adminAccessExpiresAt: null }, { adminAccessExpiresAt: { gt: now } }],
      },
      _count: { _all: true },
    }),
  ]);
  const stores = orders.length
    ? await prisma.store.findMany({ where: { id: { in: orders.map((o) => o.storeId) } }, select: { id: true, municipalityId: true } })
    : [];
  const townOf = Object.fromEntries(stores.map((st) => [st.id, st.municipalityId]));
  const stats = {};
  const at = (id) => { stats[id] = stats[id] || { orders30d: 0, admins: 0 }; return stats[id]; };
  for (const o of orders) if (townOf[o.storeId]) at(townOf[o.storeId]).orders30d += o._count._all;
  for (const a of admins) at(a.municipalityId).admins = a._count._all;
  return stats;
}

module.exports.adminStats = adminStats;
