// What other shoppers can do with a review: mark it helpful, and talk
// under it.
//
// The tests that matter most here are the last few. A review comment is
// public, written by a stranger, read by someone about to spend money --
// so it has to carry the same rules chat already does: the word list, the
// strike ladder those flags climb, and blocks. If a comment could be
// abusive where a message could not, the moderation work would have a
// hole in exactly the place people would find.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { STRIKE_LIMIT } = require('../src/services/abuseStrike.service');

after(() => h.cleanup());

/** A review of this product by this buyer, with a photo on it. */
async function review(buyer, product, extra = {}) {
  return h.prisma.review.create({
    data: {
      userId: buyer.id,
      productId: product.id,
      rating: 5,
      comment: 'Arrived quickly and the size was right.',
      images: ['/uploads/review-ci-1.jpg', '/uploads/review-ci-2.jpg'],
      ...extra,
    },
  });
}

/** A shop with one product and one review on it, by somebody else. */
async function shopWithReview() {
  const seller = await h.user('SELLER');
  const buyer = await h.user('BUYER');
  const store = await h.shop(seller);
  const product = await h.product(store);
  return { seller, buyer, store, product, review: await review(buyer, product) };
}

test('marking a review helpful is a toggle, not a counter anyone can run up', async () => {
  const { product, review: r } = await shopWithReview();
  const reader = await h.user('BUYER');

  const first = await h.api('POST', `/reviews/${r.id}/like`, { token: h.token(reader) });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.liked, true);
  assert.equal(first.body.data.likeCount, 1);

  // The same person again takes the mark back rather than adding a second.
  const second = await h.api('POST', `/reviews/${r.id}/like`, { token: h.token(reader) });
  assert.equal(second.body.data.liked, false);
  assert.equal(second.body.data.likeCount, 0);

  // And a second person is a second mark.
  const other = await h.user('BUYER');
  await h.api('POST', `/reviews/${r.id}/like`, { token: h.token(reader) });
  const third = await h.api('POST', `/reviews/${r.id}/like`, { token: h.token(other) });
  assert.equal(third.body.data.likeCount, 2);

  // The count rides along with the product's reviews, where the apps read it.
  const list = await h.api('GET', `/reviews/product/${product.id}`);
  const seen = (list.body.data || []).find((x) => x.id === r.id);
  assert.equal(seen.likeCount, 2);
  assert.equal(seen.commentCount, 0);
});

test('you cannot mark your own review helpful', async () => {
  const { buyer, review: r } = await shopWithReview();
  const res = await h.api('POST', `/reviews/${r.id}/like`, { token: h.token(buyer) });
  assert.equal(res.status, 400);
});

test('whether *you* liked it is asked for separately from the reviews', async () => {
  // The product's review list is publicly cacheable, so it must not carry
  // an answer that differs per viewer: a shared cache would hand one
  // person's answer to the next. This is the separate, authenticated call.
  const { product, review: r } = await shopWithReview();
  const reader = await h.user('BUYER');

  const before = await h.api('GET', `/reviews/my/likes?ids=${r.id}`, { token: h.token(reader) });
  assert.deepEqual(before.body.data.liked, []);

  await h.api('POST', `/reviews/${r.id}/like`, { token: h.token(reader) });
  const after_ = await h.api('GET', `/reviews/my/likes?ids=${r.id}`, { token: h.token(reader) });
  assert.deepEqual(after_.body.data.liked, [r.id]);

  // Somebody else's answer is their own.
  const stranger = await h.user('BUYER');
  const theirs = await h.api('GET', `/reviews/my/likes?ids=${r.id}`, { token: h.token(stranger) });
  assert.deepEqual(theirs.body.data.liked, []);

  // And the public list still says nothing about any particular viewer.
  const list = await h.api('GET', `/reviews/product/${product.id}`);
  const seen = (list.body.data || []).find((x) => x.id === r.id);
  assert.equal(seen.likedByMe, undefined, 'a per-viewer answer must not ride in a cacheable body');
});

test('a comment is posted, read back, and counted', async () => {
  const { product, review: r } = await shopWithReview();
  const asker = await h.user('BUYER');

  const posted = await h.api('POST', `/reviews/${r.id}/comments`, {
    token: h.token(asker),
    body: { body: 'Does it run small? Thinking of the same size.' },
  });
  assert.equal(posted.status, 201);
  assert.equal(posted.body.data.body, 'Does it run small? Thinking of the same size.');

  const list = await h.api('GET', `/reviews/${r.id}/comments`);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].user.id, asker.id);

  const reviews = await h.api('GET', `/reviews/product/${product.id}`);
  const seen = (reviews.body.data || []).find((x) => x.id === r.id);
  assert.equal(seen.commentCount, 1);
});

test('an empty or over-long comment is refused', async () => {
  const { review: r } = await shopWithReview();
  const asker = await h.user('BUYER');

  const empty = await h.api('POST', `/reviews/${r.id}/comments`, {
    token: h.token(asker), body: { body: '   ' },
  });
  assert.equal(empty.status, 400);

  const long = await h.api('POST', `/reviews/${r.id}/comments`, {
    token: h.token(asker), body: { body: 'a'.repeat(601) },
  });
  assert.equal(long.status, 400);
});

test('a comment that trips the word list is still posted, and is flagged', async () => {
  // The whole point: a wrong guess must never swallow what somebody
  // wrote. It shows, and an admin is asked to look at it.
  const { review: r } = await shopWithReview();
  const rude = await h.user('BUYER');

  const posted = await h.api('POST', `/reviews/${r.id}/comments`, {
    token: h.token(rude),
    body: { body: 'gago ang tindera na to' },
  });
  assert.equal(posted.status, 201, 'the comment still goes up');

  const list = await h.api('GET', `/reviews/${r.id}/comments`);
  assert.equal(list.body.data.length, 1, 'and it is still readable');

  const flag = await h.eventually(() => h.prisma.reviewCommentFlag.findFirst({
    where: { authorId: rude.id },
  }));
  assert.ok(flag, 'an admin has something to look at');
  assert.match(flag.matched, /gago/);
  assert.equal(flag.status, 'PENDING');
});

test('flagged comments climb the same ladder as flagged messages', async () => {
  // One counter, not two: someone abusive in a chat and then abusive
  // under a review is one person twice.
  const { review: r } = await shopWithReview();
  const rude = await h.user('BUYER');

  for (let i = 0; i < STRIKE_LIMIT; i += 1) {
    const res = await h.api('POST', `/reviews/${r.id}/comments`, {
      token: h.token(rude), body: { body: `tanga ${i}` },
    });
    assert.equal(res.status, 201);
  }

  const paused = await h.eventually(async () => {
    const u = await h.prisma.user.findUnique({
      where: { id: rude.id },
      select: { chatRestrictedUntil: true },
    });
    return u?.chatRestrictedUntil && u.chatRestrictedUntil > new Date() ? u : null;
  });
  assert.ok(paused, `${STRIKE_LIMIT} flags pauses them`);

  // Paused for comments...
  const refused = await h.api('POST', `/reviews/${r.id}/comments`, {
    token: h.token(rude), body: { body: 'a perfectly ordinary question' },
  });
  assert.equal(refused.status, 403);

  // ...and for chat, because it is the one restriction.
  const { store } = await shopWithReview();
  const chat = await h.api('POST', '/messages/conversations', {
    token: h.token(rude), body: { storeId: store.id },
  });
  assert.equal(chat.status, 403);
});

test('two people who blocked each other do not talk under a review either', async () => {
  const { buyer, review: r } = await shopWithReview();
  const other = await h.user('BUYER');

  const blocked = await h.api('POST', `/blocks/${other.id}`, { token: h.token(buyer) });
  assert.equal(blocked.status, 200);

  const theirs = await h.api('POST', `/reviews/${r.id}/comments`, {
    token: h.token(other), body: { body: 'hello' },
  });
  assert.equal(theirs.status, 403, 'the person blocked cannot comment on the blocker’s review');
});

test('a comment can be removed by its writer, by the shop, or by an admin — not by a passer-by', async () => {
  const { seller, review: r } = await shopWithReview();
  const asker = await h.user('BUYER');
  const passerBy = await h.user('BUYER');

  const make = async () => {
    const res = await h.api('POST', `/reviews/${r.id}/comments`, {
      token: h.token(asker), body: { body: 'Is it still available?' },
    });
    return res.body.data.id;
  };

  const first = await make();
  const nosy = await h.api('DELETE', `/reviews/comments/${first}`, { token: h.token(passerBy) });
  assert.equal(nosy.status, 403);

  const mine = await h.api('DELETE', `/reviews/comments/${first}`, { token: h.token(asker) });
  assert.equal(mine.status, 200);

  // The shop whose product it sits under can remove one too: it is their
  // listing a shopper is reading.
  const second = await make();
  const byShop = await h.api('DELETE', `/reviews/comments/${second}`, { token: h.token(seller) });
  assert.equal(byShop.status, 200);

  const third = await make();
  const admin = await h.user('SUPER_ADMIN');
  const byAdmin = await h.api('DELETE', `/reviews/comments/${third}`, { token: h.token(admin) });
  assert.equal(byAdmin.status, 200);

  // Removed, but kept: a decision about it can still be looked at.
  const left = await h.api('GET', `/reviews/${r.id}/comments`);
  assert.equal(left.body.data.length, 0);
  assert.equal(await h.prisma.reviewComment.count({ where: { reviewId: r.id } }), 3);
});

test('signing in is required to like or comment, but not to read', async () => {
  const { review: r } = await shopWithReview();

  const like = await h.api('POST', `/reviews/${r.id}/like`);
  assert.equal(like.status, 401);

  const comment = await h.api('POST', `/reviews/${r.id}/comments`, { body: { body: 'hi' } });
  assert.equal(comment.status, 401);

  const read = await h.api('GET', `/reviews/${r.id}/comments`);
  assert.equal(read.status, 200, 'anyone can read what is already public');
});
