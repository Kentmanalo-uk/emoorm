const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(h.cleanup);

/*
 * The seller's Reviews and Returns pages: the rating summary carries how many
 * reviews gave each star (the 5→1 bars), the review list carries the buyers'
 * photos and video, and the returns list carries the count in every status
 * (the tabs) and the buyer's photos.
 */

test('seller reviews: a 5→1 breakdown with the average, and review media in the list', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const other = await h.product(await h.shop(await h.user('SELLER')));
  const buyers = await Promise.all([1, 2, 3, 4].map(() => h.user('BUYER')));
  await Promise.all([
    h.prisma.review.create({ data: { userId: buyers[0].id, productId: item.id, rating: 5, comment: 'ci great', images: ['/uploads/ci-review.webp'], videoUrl: '/uploads/ci-review.mp4' } }),
    h.prisma.review.create({ data: { userId: buyers[1].id, productId: item.id, rating: 5 } }),
    h.prisma.review.create({ data: { userId: buyers[2].id, productId: item.id, rating: 2 } }),
    // Removed, and another shop's: neither counts.
    h.prisma.review.create({ data: { userId: buyers[3].id, productId: item.id, rating: 1, deletedAt: new Date() } }),
    h.prisma.review.create({ data: { userId: buyers[3].id, productId: other.id, rating: 3 } }),
  ]);

  const res = await h.api('GET', '/reviews/seller/mine', { token: h.token(seller) });
  assert.equal(res.status, 200);
  const stats = res.body.ratingStats;
  assert.equal(stats.totalReviews, 3);
  assert.equal(Number(stats.averageRating).toFixed(2), '4.00');
  assert.deepEqual(stats.byRating, { 5: 2, 4: 0, 3: 0, 2: 1, 1: 0 });

  const withMedia = res.body.data.find((r) => r.comment === 'ci great');
  assert.deepEqual(withMedia.images, ['/uploads/ci-review.webp']);
  assert.equal(withMedia.videoUrl, '/uploads/ci-review.mp4');
});

test('seller returns: counts per status for the whole shop, and the buyer photos', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const item = await h.product(store);
  const buyer = await h.user('BUYER');
  const make = async (status, photos = null) => {
    const o = await h.order(buyer, store, [{ product: item }], { status: 'COMPLETED', completedAt: h.daysAgo(1) });
    return h.prisma.returnRequest.create({
      data: {
        requestNumber: `CI-RET-${h.RUN}-${o.id.slice(0, 8)}`,
        orderId: o.id,
        buyerId: buyer.id,
        storeId: store.id,
        status,
        reason: 'DAMAGED',
        requestedAmount: 100,
        photos,
        items: { create: [{ orderItemId: o.items[0].id, quantity: 1, unitPrice: 100, subtotal: 100 }] },
      },
    });
  };
  await make('REQUESTED', ['/uploads/ci-return.webp']);
  await make('REQUESTED');
  await make('REFUNDED');

  // One status per page: the counts still cover every status.
  const res = await h.api('GET', '/returns/store?status=REFUNDED&pageSize=1', { token: h.token(seller) });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].status, 'REFUNDED');
  assert.deepEqual(res.body.counts, { REQUESTED: 2, REFUNDED: 1 });

  const requested = await h.api('GET', '/returns/store?status=REQUESTED', { token: h.token(seller) });
  assert.equal(requested.body.pagination.total, 2);
  const withPhoto = requested.body.data.find((r) => Array.isArray(r.photos));
  assert.deepEqual(withPhoto.photos, ['/uploads/ci-return.webp']);

  // Several statuses at once (the To refund tab), and nonsense ignored.
  const both = await h.api('GET', '/returns/store?status=REQUESTED,REFUNDED', { token: h.token(seller) });
  assert.equal(both.body.pagination.total, 3);
  const junk = await h.api('GET', '/returns/store?status=NOPE', { token: h.token(seller) });
  assert.equal(junk.status, 200);
  assert.equal(junk.body.pagination.total, 3);

  // Another seller sees none of them.
  const stranger = await h.user('SELLER');
  await h.shop(stranger);
  const theirs = await h.api('GET', '/returns/store', { token: h.token(stranger) });
  assert.equal(theirs.status, 200);
  assert.equal(theirs.body.data.length, 0);
  assert.deepEqual(theirs.body.counts, {});
});
