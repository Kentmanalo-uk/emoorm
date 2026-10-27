const fs = require('fs');
const path = require('path');
const prisma = require('../config/database');
const privateMedia = require('../lib/privateMedia');

/**
 * Private photos nothing refers to any more: uploaded but never sent (a chat
 * photo picked and then discarded, a proof for an order that was never
 * placed), or left behind by a row that went. Each upload is a private file
 * someone took; none is kept longer than it is needed.
 */

// A file this young may be about to be sent: left alone.
const GRACE_MS = 24 * 60 * 60 * 1000;

/** Every private photo reference the database still holds (as file names). */
const referencedFiles = async () => {
  const prefix = { startsWith: privateMedia.PREFIX };
  const [messages, payment, delivery, returns, reports] = await Promise.all([
    prisma.message.findMany({ where: { imageUrl: prefix }, select: { imageUrl: true } }),
    prisma.order.findMany({ where: { paymentProofUrl: prefix }, select: { paymentProofUrl: true } }),
    prisma.order.findMany({ where: { fulfillmentProofUrl: prefix }, select: { fulfillmentProofUrl: true } }),
    prisma.returnRequest.findMany({ where: { NOT: { photos: { equals: null } } }, select: { photos: true } }),
    prisma.report.findMany({ where: { NOT: { evidence: { equals: null } } }, select: { evidence: true } }),
  ]);
  const refs = [
    ...messages.map((m) => m.imageUrl),
    ...payment.map((o) => o.paymentProofUrl),
    ...delivery.map((o) => o.fulfillmentProofUrl),
    ...returns.flatMap((r) => (Array.isArray(r.photos) ? r.photos : [])),
    ...reports.flatMap((r) => (Array.isArray(r.evidence) ? r.evidence : [])),
  ];
  return new Set(refs.map((r) => privateMedia.fileOf(r)).filter(Boolean));
};

/**
 * Delete private files older than a day that nothing refers to.
 * @returns {Promise<{ checked: Number, removed: Number }>}
 */
const sweepUnreferenced = async (now = Date.now()) => {
  const dir = privateMedia.mediaDir();
  let names;
  try {
    names = await fs.promises.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return { checked: 0, removed: 0 };
    throw err;
  }
  const keep = await referencedFiles();
  let removed = 0;
  for (const name of names) {
    if (keep.has(name)) continue;
    const full = path.join(dir, name);
    // eslint-disable-next-line no-await-in-loop
    const stat = await fs.promises.stat(full).catch(() => null);
    if (!stat || !stat.isFile() || now - stat.mtimeMs < GRACE_MS) continue;
    // eslint-disable-next-line no-await-in-loop
    await fs.promises.unlink(full).catch(() => {});
    removed += 1;
  }
  return { checked: names.length, removed };
};

const config = require('../config/env');

const PUBLIC_REF = /^\/uploads\/([A-Za-z0-9._-]{1,120})$/;

/** Is this upload also used somewhere public (a product, shop, profile...)? */
const usedPublicly = async (file) => {
  const like = `%/uploads/${file}%`;
  const rows = await prisma.$queryRaw`
    SELECT (
      EXISTS (SELECT 1 FROM products WHERE CAST(images AS CHAR) LIKE ${like} OR CAST(variations AS CHAR) LIKE ${like})
      OR EXISTS (SELECT 1 FROM stores WHERE logo LIKE ${like} OR cover_image LIKE ${like} OR banner_image LIKE ${like}
        OR payment_qr_image LIKE ${like} OR CAST(home_layout AS CHAR) LIKE ${like})
      OR EXISTS (SELECT 1 FROM users WHERE profile_photo LIKE ${like} OR shop_logo_url LIKE ${like} OR shop_cover_url LIKE ${like} OR payout_qr_url LIKE ${like})
      OR EXISTS (SELECT 1 FROM reviews WHERE CAST(images AS CHAR) LIKE ${like} OR video_url LIKE ${like})
      OR EXISTS (SELECT 1 FROM municipalities WHERE logo LIKE ${like} OR CAST(gallery AS CHAR) LIKE ${like})
      OR EXISTS (SELECT 1 FROM banners WHERE image_url LIKE ${like})
      OR EXISTS (SELECT 1 FROM categories WHERE image LIKE ${like})
      OR EXISTS (SELECT 1 FROM app_settings WHERE app_logo LIKE ${like} OR product_placeholder LIKE ${like})
      OR EXISTS (SELECT 1 FROM couriers WHERE logo_url LIKE ${like})
    ) AS used`;
  return Boolean(Number(rows[0]?.used));
};

/**
 * One-time move of the photos stored publicly before private photos existed:
 * payment and delivery proofs, chat photos, return photos, report evidence.
 * Each file is copied into the private folder and its reference updated; the
 * public copy is deleted unless something public uses the same file. Safe to
 * run again: only /uploads references are touched.
 * @returns {Promise<{ moved: Number, missing: Number, keptPublic: Number }>}
 */
const migratePublicPhotos = async () => {
  const uploadDir = path.resolve(config.upload.uploadDir);
  const dir = privateMedia.mediaDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const stats = { moved: 0, missing: 0, keptPublic: 0 };
  const done = new Map(); // public ref -> private ref (or null when missing)

  const move = async (ref) => {
    const match = typeof ref === 'string' ? ref.match(PUBLIC_REF) : null;
    if (!match) return ref;
    if (done.has(ref)) return done.get(ref) || ref;
    const file = match[1];
    const from = path.join(uploadDir, file);
    const to = path.join(dir, file);
    try {
      await fs.promises.copyFile(from, to);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      stats.missing += 1;
      done.set(ref, null);
      return ref;
    }
    if (await usedPublicly(file)) stats.keptPublic += 1;
    else {
      await fs.promises.unlink(from).catch(() => {});
      // Its smaller copies (lib/imageSizes), if any were made, go too.
      await require('../lib/imageSizes').removeSizes(from);
    }
    stats.moved += 1;
    const next = `${privateMedia.PREFIX}${file}`;
    done.set(ref, next);
    return next;
  };
  const moveList = async (list) => {
    if (!Array.isArray(list)) return { list, changed: false };
    const out = [];
    for (const item of list) out.push(await move(item)); // eslint-disable-line no-await-in-loop
    return { list: out, changed: out.some((v, i) => v !== list[i]) };
  };

  const pub = { startsWith: '/uploads/' };
  for (const m of await prisma.message.findMany({ where: { imageUrl: pub }, select: { id: true, imageUrl: true } })) {
    const next = await move(m.imageUrl); // eslint-disable-line no-await-in-loop
    if (next !== m.imageUrl) await prisma.message.update({ where: { id: m.id }, data: { imageUrl: next } }); // eslint-disable-line no-await-in-loop
  }
  for (const field of ['paymentProofUrl', 'fulfillmentProofUrl']) {
    // eslint-disable-next-line no-await-in-loop
    for (const o of await prisma.order.findMany({ where: { [field]: pub }, select: { id: true, [field]: true } })) {
      const next = await move(o[field]); // eslint-disable-line no-await-in-loop
      if (next !== o[field]) await prisma.order.update({ where: { id: o.id }, data: { [field]: next } }); // eslint-disable-line no-await-in-loop
    }
  }
  for (const r of await prisma.returnRequest.findMany({ where: { NOT: { photos: { equals: null } } }, select: { id: true, photos: true } })) {
    const { list, changed } = await moveList(r.photos); // eslint-disable-line no-await-in-loop
    if (changed) await prisma.returnRequest.update({ where: { id: r.id }, data: { photos: list } }); // eslint-disable-line no-await-in-loop
  }
  for (const r of await prisma.report.findMany({ where: { NOT: { evidence: { equals: null } } }, select: { id: true, evidence: true } })) {
    const { list, changed } = await moveList(r.evidence); // eslint-disable-line no-await-in-loop
    if (changed) await prisma.report.update({ where: { id: r.id }, data: { evidence: list } }); // eslint-disable-line no-await-in-loop
  }
  return stats;
};

module.exports = { referencedFiles, sweepUnreferenced, migratePublicPhotos, usedPublicly, GRACE_MS };
