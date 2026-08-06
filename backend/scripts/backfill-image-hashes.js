/* eslint-disable no-console */
const prisma = require('../src/config/database');
const { hashFromSource } = require('../src/utils/imageHash');

const normalizeImages = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const run = async () => {
  const products = await prisma.product.findMany({
    where: { imageHash: null, deletedAt: null },
    select: { id: true, name: true, images: true },
  });

  console.log(`Found ${products.length} product(s) needing image hashes.`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of products) {
    const images = normalizeImages(p.images);
    const first = images[0];
    if (!first) {
      skipped += 1;
      continue;
    }

    try {
      const hash = await hashFromSource(first);
      if (!hash) {
        skipped += 1;
        console.warn(`skip ${p.id} (${p.name}) — no buffer`);
        continue;
      }
      await prisma.product.update({
        where: { id: p.id },
        data: { imageHash: hash },
      });
      ok += 1;
      console.log(`ok   ${p.id} ${hash}`);
    } catch (err) {
      failed += 1;
      console.error(`fail ${p.id} (${p.name}):`, err.message);
    }
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}`);
};

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
