const prisma = require('../config/database');
const { ApiError } = require('../middleware/errorHandler');
const { invalidate, TAGS } = require('../lib/cachePolicy');
const storeRepository = require('../repositories/store.repository');
const auditLogService = require('./auditLog.service');
const notificationService = require('./notification.service');
const { cleanLayers, cleanName } = require('../utils/photoDesign');

/**
 * A shop's own photo designs (StorePhotoDesign), made in the website's design
 * editor and worn by its products (product.imageOverlay 'custom' +
 * photoDesignId). They show to buyers as soon as they are saved; admins can
 * see every shop's and remove one that misleads (the shop is told why).
 */

const MAX_DESIGNS = 12;

const SELECT = {
  id: true, name: true, layers: true, createdAt: true, updatedAt: true, _count: { select: { products: true } },
};

const shape = (d) => ({
  id: d.id,
  name: d.name,
  layers: d.layers,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  products: d._count?.products ?? 0,
  ...(d.store ? { store: d.store } : {}),
});

// Every product list and page may carry the design.
const refresh = () => invalidate([TAGS.products, TAGS.stores]);

const myStore = async (userId) => {
  const store = await storeRepository.findByOwnerId(userId);
  if (!store) throw new ApiError('Open your shop first', 404);
  return store;
};

const ownDesign = async (userId, id) => {
  const store = await myStore(userId);
  const design = await prisma.storePhotoDesign.findUnique({ where: { id: String(id) }, select: { id: true, storeId: true } });
  if (!design || design.storeId !== store.id) throw new ApiError('Design not found', 404);
  return { store, design };
};

const listMine = async (userId) => {
  const store = await myStore(userId);
  const rows = await prisma.storePhotoDesign.findMany({
    where: { storeId: store.id }, orderBy: { updatedAt: 'desc' }, select: SELECT,
  });
  return { designs: rows.map(shape), max: MAX_DESIGNS };
};

const create = async (userId, body = {}) => {
  const store = await myStore(userId);
  const data = { name: cleanName(body.name), layers: cleanLayers(body.layers) };
  const count = await prisma.storePhotoDesign.count({ where: { storeId: store.id } });
  if (count >= MAX_DESIGNS) throw new ApiError(`A shop can keep up to ${MAX_DESIGNS} designs. Delete one first.`, 400);
  const row = await prisma.storePhotoDesign.create({ data: { ...data, storeId: store.id }, select: SELECT });
  return shape(row);
};

const update = async (userId, id, body = {}) => {
  const { design } = await ownDesign(userId, id);
  const data = {};
  if (body.name !== undefined) data.name = cleanName(body.name);
  if (body.layers !== undefined) data.layers = cleanLayers(body.layers);
  if (!Object.keys(data).length) throw new ApiError('Nothing to save', 400);
  const row = await prisma.storePhotoDesign.update({ where: { id: design.id }, data, select: SELECT });
  await refresh();
  return shape(row);
};

/** Deleting a design turns it off on the products that wore it. */
const removeDesign = async (designId) => {
  await prisma.$transaction([
    prisma.product.updateMany({ where: { photoDesignId: designId }, data: { imageOverlay: null, photoDesignId: null } }),
    prisma.storePhotoDesign.delete({ where: { id: designId } }),
  ]);
  await refresh();
};

const remove = async (userId, id) => {
  const { design } = await ownDesign(userId, id);
  await removeDesign(design.id);
  return { id: design.id };
};

/** Admins: every shop's designs (a town admin's town only), newest first. */
const listAdmin = async (actor, { municipalityId, q, page = 1, pageSize = 24 } = {}) => {
  const town = actor.role === 'MUNICIPAL_ADMIN' ? actor.municipalityId : (municipalityId || undefined);
  const size = Math.min(60, Math.max(1, Number(pageSize) || 24));
  const at = Math.max(1, Number(page) || 1);
  const search = String(q || '').trim().slice(0, 80);
  const where = {
    store: {
      deletedAt: null,
      ...(town ? { municipalityId: town } : {}),
    },
    ...(search ? { OR: [{ name: { contains: search } }, { store: { name: { contains: search } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.storePhotoDesign.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (at - 1) * size,
      take: size,
      select: {
        ...SELECT,
        store: {
          select: {
            id: true, name: true, slug: true, logo: true, primaryColor: true, municipality: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.storePhotoDesign.count({ where }),
  ]);
  return {
    designs: rows.map(shape), total, page: at, pageSize: size,
  };
};

const removeAdmin = async (actor, id, { reason } = {}, req = null) => {
  const why = String(reason || '').trim();
  if (why.length < 3) throw new ApiError('Say why the design is being removed', 400);
  const design = await prisma.storePhotoDesign.findUnique({
    where: { id: String(id) },
    select: {
      id: true, name: true, store: { select: { id: true, name: true, ownerId: true, municipalityId: true } }, _count: { select: { products: true } },
    },
  });
  if (!design) throw new ApiError('Design not found', 404);
  if (actor.role === 'MUNICIPAL_ADMIN' && design.store.municipalityId !== actor.municipalityId) {
    throw new ApiError('You can only remove designs in your assigned municipality', 403);
  }
  await removeDesign(design.id);

  await auditLogService.record({
    actor,
    action: 'REMOVE_PHOTO_DESIGN',
    entity: 'Store',
    entityId: design.store.id,
    details: { reason: why.slice(0, 300), design: design.name, products: design._count.products },
    municipalityId: design.store.municipalityId,
    req,
  });

  try {
    await notificationService.createNotification({
      userId: design.store.ownerId,
      type: 'SYSTEM_ANNOUNCEMENT',
      title: 'A photo design was removed',
      message: `Your photo design "${design.name}" was removed by an admin and no longer shows on your products: ${why.slice(0, 200)}`,
      relatedId: design.store.id,
      audience: 'SELLER',
    });
  } catch (err) {
    console.error('[photoDesign] notification failed:', err.message);
  }
  return { id: design.id };
};

/** A design for a product: the seller's own shop's, or a 400. */
const assertUsable = async (designId, storeId) => {
  const design = await prisma.storePhotoDesign.findUnique({ where: { id: String(designId || '') }, select: { id: true, storeId: true } });
  if (!design || design.storeId !== storeId) throw new ApiError('Pick one of your shop\'s designs', 400);
  return design.id;
};

module.exports = {
  listMine, create, update, remove, listAdmin, removeAdmin, assertUsable, MAX_DESIGNS,
};
