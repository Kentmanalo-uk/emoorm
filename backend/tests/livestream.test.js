// Live selling (livestream/, mounted at /api/live): who may go live, the
// video pieces in and out, the news a viewer waits for, and the end. The
// video bytes here are stand-ins: the server keeps and hands back pieces, it
// never looks inside them.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

after(() => h.cleanup().then(() => h.prisma.$disconnect()));

const raw = async (method, path, data, key) => {
  const res = await fetch(`${await h.startApp()}${path}`, {
    method,
    headers: { 'Content-Type': 'application/octet-stream', ...(key ? { 'X-Live-Key': key } : {}) },
    body: data,
  });
  return res;
};

const piece = (n) => Buffer.from(`piece-${n}-`.padEnd(64, 'x'));

test('only an open shop goes live, and a buyer cannot', async () => {
  const buyer = await h.user('BUYER');
  const refused = await h.api('POST', '/live', { token: h.token(buyer), body: { title: 'Hi' } });
  assert.equal(refused.status, 403);

  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  await h.prisma.store.update({ where: { id: store.id }, data: { isApproved: false } });
  const pending = await h.api('POST', '/live', { token: h.token(seller), body: { title: 'Hi' } });
  assert.equal(pending.status, 403);
  assert.match(pending.body.message, /approved/);

  const anon = await h.api('POST', '/live', { body: { title: 'Hi' } });
  assert.equal(anon.status, 401);
});

test('a live: pieces in, pieces out, the bag, news, the end', async () => {
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const mine = await h.product(store);
  const hidden = await h.product(store, { status: 'HIDDEN' });
  const other = await h.product(await h.shop(await h.user('SELLER')));
  const buyer = await h.user('BUYER');

  const started = await h.api('POST', '/live', {
    token: h.token(seller),
    body: { title: 'Fresh catch today', productIds: [mine.id, hidden.id, other.id] },
  });
  assert.equal(started.status, 201);
  const { id, key } = started.body.data;
  assert.ok(id && key);

  // The bag keeps only the shop's own products on sale.
  const info = await h.api('GET', `/live/${id}`);
  assert.deepEqual(info.body.data.bag.map((p) => p.id), [mine.id]);
  assert.equal(info.body.data.status, 'STARTING');

  // Not on the list until video arrives.
  let list = await h.api('GET', '/live');
  assert.ok(!list.body.data.some((l) => l.id === id));

  // Video needs the key, and an init before pieces.
  assert.equal((await raw('PUT', `/live/${id}/init?epoch=0&codecs=avc1.42e01f,mp4a.40.2`, piece('init'), 'wrong')).status, 403);
  assert.equal((await raw('POST', `/live/${id}/seg?seq=0&epoch=0&dur=1000`, piece(0), key)).status, 409);
  assert.equal((await raw('PUT', `/live/${id}/init?epoch=0&codecs=avc1.42e01f,mp4a.40.2`, piece('init'), key)).status, 200);
  for (let n = 0; n < 3; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await raw('POST', `/live/${id}/seg?seq=${n}&epoch=0&dur=1000`, piece(n), key)).status, 200);
  }

  list = await h.api('GET', '/live');
  assert.ok(list.body.data.some((l) => l.id === id && l.store.id === store.id), 'on the list once live');
  assert.equal((await h.api('GET', `/live?storeId=${store.id}`)).body.data.length, 1);

  // Out again, as they went in.
  const init = await fetch(`${await h.startApp()}/live/${id}/init/0.mp4`);
  assert.equal(init.headers.get('x-live-codecs'), 'avc1.42e01f,mp4a.40.2');
  assert.deepEqual(Buffer.from(await init.arrayBuffer()), piece('init'));
  const seg = await fetch(`${await h.startApp()}/live/${id}/seg/1.m4s`);
  assert.equal(seg.status, 200);
  assert.deepEqual(Buffer.from(await seg.arrayBuffer()), piece(1));

  // The next piece is waited for, not refused.
  const next = fetch(`${await h.startApp()}/live/${id}/seg/3.m4s`);
  await new Promise((r) => { setTimeout(r, 150); });
  await raw('POST', `/live/${id}/seg?seq=3&epoch=0&dur=1000`, piece(3), key);
  const waited = await next;
  assert.equal(waited.status, 200);
  assert.deepEqual(Buffer.from(await waited.arrayBuffer()), piece(3));

  // Far ahead: told where now is.
  const ahead = await fetch(`${await h.startApp()}/live/${id}/seg/99.m4s`);
  assert.equal(ahead.status, 410);
  assert.equal((await ahead.json()).latestSeq, 3);

  // The playlist for players without Media Source.
  const m3u8 = await (await fetch(`${await h.startApp()}/live/${id}/live.m3u8`)).text();
  assert.match(m3u8, /#EXT-X-MAP:URI="init\/0\.mp4"/);
  assert.match(m3u8, /seg\/3\.m4s/);

  // News: a viewer waiting is answered by the next comment.
  const since = (await h.api('GET', `/live/${id}`)).body.data.news.v;
  const waiting = h.api('GET', `/live/${id}/events?v=${since}&viewer=v1`);
  await new Promise((r) => { setTimeout(r, 150); });
  const said = await h.api('POST', `/live/${id}/comments`, { token: h.token(buyer), body: { text: 'How much is the bangus?' } });
  assert.equal(said.status, 201);
  const news = await waiting;
  assert.equal(news.status, 200);
  assert.deepEqual(news.body.data.comments.map((c) => c.text), ['How much is the bangus?']);
  assert.equal(news.body.data.comments[0].seller, false);

  // Rude words are refused; signing in is needed. (Another buyer: one
  // comment every two seconds each.)
  const rude = await h.user('BUYER');
  assert.equal((await h.api('POST', `/live/${id}/comments`, { token: h.token(rude), body: { text: 'gago ka' } })).status, 422);
  assert.equal((await h.api('POST', `/live/${id}/comments`, { token: h.token(buyer), body: { text: 'Another one!' } })).status, 429);
  assert.equal((await h.api('POST', `/live/${id}/comments`, { body: { text: 'hello' } })).status, 401);

  // Only the shop pins, and only from its bag; it can hide a comment.
  assert.equal((await h.api('POST', `/live/${id}/pin`, { token: h.token(buyer), body: { productId: mine.id } })).status, 403);
  assert.equal((await h.api('POST', `/live/${id}/pin`, { token: h.token(seller), body: { productId: other.id } })).status, 400);
  assert.equal((await h.api('POST', `/live/${id}/pin`, { token: h.token(seller), body: { productId: mine.id } })).status, 200);
  assert.equal((await h.api('POST', `/live/${id}/comments/${said.body.data.id}/hide`, { token: h.token(seller) })).status, 200);
  const after1 = (await h.api('GET', `/live/${id}/events?v=${news.body.data.v}`)).body.data;
  assert.equal(after1.pinned.productId, mine.id);
  assert.ok(after1.comments.some((c) => c.id === said.body.data.id && c.hidden));

  // Hearts come in handfuls and add up.
  await h.api('POST', `/live/${id}/hearts`, { body: { n: 5 } });
  await h.eventually(async () => (await h.api('GET', `/live/${id}`)).body.data.hearts === 5);

  // The end: a summary for the shop, ENDED for everyone, no more video.
  assert.equal((await h.api('POST', `/live/${id}/end`, { token: h.token(buyer) })).status, 403);
  const ended = await h.api('POST', `/live/${id}/end`, { token: h.token(seller) });
  assert.equal(ended.status, 200);
  assert.equal(ended.body.data.hearts, 5);
  assert.equal(ended.body.data.comments, 1);
  assert.equal((await h.api('GET', `/live/${id}`)).body.data.status, 'ENDED');
  assert.equal((await fetch(`${await h.startApp()}/live/${id}/seg/3.m4s`)).status, 404);
  assert.equal((await raw('POST', `/live/${id}/seg?seq=4&epoch=0&dur=1000`, piece(4), key)).status, 410);
  assert.ok(!(await h.api('GET', '/live')).body.data.some((l) => l.id === id));
});

test('going live again ends the shop\'s last live', async () => {
  const seller = await h.user('SELLER');
  await h.shop(seller);
  const first = (await h.api('POST', '/live', { token: h.token(seller), body: {} })).body.data;
  const second = await h.api('POST', '/live', { token: h.token(seller), body: { title: 'Round two' } });
  assert.equal(second.status, 201);
  assert.equal((await h.api('GET', `/live/${first.id}`)).body.data.status, 'ENDED');
  assert.equal(second.body.data.live.title, 'Round two');
});

test('the microphone worklet is served from the site itself', async () => {
  const res = await fetch(`${await h.startApp()}/live/mic-worklet.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
  assert.match(await res.text(), /registerProcessor\('emoorm-mic-tap'/);
});

test('a second streams out piece by piece as the seller uploads it', async () => {
  const seller = await h.user('SELLER');
  await h.shop(seller);
  const { id, key } = (await h.api('POST', '/live', { token: h.token(seller), body: {} })).body.data;
  await raw('PUT', `/live/${id}/init?epoch=0&codecs=avc1.42e01f,opus`, piece('init'), key);

  // A viewer asks for the second before it starts.
  const started = Date.now();
  const res = fetch(`${await h.startApp()}/live/${id}/seg/0.m4s`);
  const arrivals = [];
  const reading = res.then(async (r) => {
    assert.equal(r.status, 200);
    const reader = r.body.getReader();
    let bytes = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      arrivals.push(Date.now() - started);
    }
    return bytes;
  });
  for (let p = 0; p < 4; p += 1) {
    // eslint-disable-next-line no-await-in-loop
    assert.equal((await raw('POST', `/live/${id}/seg?seq=0&part=${p}&last=${p === 3 ? 1 : 0}&epoch=0&dur=200`, piece(p), key)).status, 200);
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => { setTimeout(r, 120); });
  }
  assert.equal(await reading, 4 * 64);
  // Each piece came as it was sent, not all together at the end.
  assert.ok(arrivals.length >= 3, `arrived in ${arrivals.length} chunks`);
  assert.ok(arrivals[0] < arrivals[arrivals.length - 1] - 200, `spread over time: ${arrivals.join(', ')}`);

  // Once complete it is one cacheable whole.
  const whole = await fetch(`${await h.startApp()}/live/${id}/seg/0.m4s`);
  assert.match(whole.headers.get('cache-control'), /immutable/);
  assert.equal((await whole.arrayBuffer()).byteLength, 4 * 64);
});

test('pieces sent together are split; a second that never came is skipped', async () => {
  const seller = await h.user('SELLER');
  await h.shop(seller);
  const { id, key } = (await h.api('POST', '/live', { token: h.token(seller), body: {} })).body.data;
  await raw('PUT', `/live/${id}/init?epoch=0&codecs=avc1.42e01f,opus`, piece('init'), key);

  // Three pieces in one upload (the seller had fallen behind).
  const three = Buffer.concat([piece(0), piece(1), piece(2)]);
  assert.equal((await raw('POST', `/live/${id}/seg?seq=0&part=0&last=1&epoch=0&dur=600&sizes=64,64,64&durs=200,200,200`, three, key)).status, 200);
  const seg0 = await fetch(`${await h.startApp()}/live/${id}/seg/0.m4s`);
  assert.deepEqual(Buffer.from(await seg0.arrayBuffer()), three);
  // Sizes that do not add up are refused.
  assert.equal((await raw('POST', `/live/${id}/seg?seq=1&part=0&epoch=0&dur=400&sizes=64,10&durs=200,200`, Buffer.concat([piece(0), piece(1)]), key)).status, 400);

  // Second 1 never arrives (its start was dropped); second 2 does.
  assert.equal((await raw('POST', `/live/${id}/seg?seq=1&part=2&epoch=0&dur=200`, piece(9), key)).status, 200);
  await raw('POST', `/live/${id}/seg?seq=2&part=0&last=1&epoch=0&dur=200`, piece(2), key);
  const skipped = await fetch(`${await h.startApp()}/live/${id}/seg/1.m4s`);
  assert.equal(skipped.status, 410);
  assert.equal((await skipped.json()).nextSeq, 2);
});
