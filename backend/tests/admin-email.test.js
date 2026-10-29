const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const email = require('../src/utils/email');

// A town of this file's own (kept between runs), so "everyone in town" is
// exactly the people made here.
let town;
let other;
let people;
const sends = [];

before(async () => {
  const shared = await h.reference();
  other = shared.municipality;
  const where = { code: 'CI-EMAIL' };
  town = await h.prisma.municipality.findFirst({ where })
    || await h.prisma.municipality.create({ data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffff04', name: 'Ci Zz Email Town', code: 'CI-EMAIL' } })
      .catch(async (err) => { if (err.code !== 'P2002') throw err; return h.prisma.municipality.findFirst({ where }); });
  const inTown = { municipality: { connect: { id: town.id } } };
  people = {
    admin: await h.user('MUNICIPAL_ADMIN', { ...inTown, fullName: `Ci Email Admin ${h.RUN}` }),
    buyer: await h.user('BUYER', { ...inTown, fullName: `Ci Email Ana ${h.RUN}` }),
    seller: await h.user('SELLER', { ...inTown, fullName: `Ci Email Ben ${h.RUN}` }),
    unconfirmed: await h.user('BUYER', { ...inTown, fullName: `Ci Email Cora ${h.RUN}`, isVerified: false }),
    // Lives elsewhere, sells here: of this town too.
    shopHere: await h.user('SELLER', { fullName: `Ci Email Dan ${h.RUN}`, shopMunicipalityId: town.id }),
    outsider: await h.user('BUYER', { fullName: `Ci Email Eva ${h.RUN}` }),
    superAdmin: await h.user('SUPER_ADMIN'),
  };
});

after(async () => {
  await h.prisma.emailOutbox.deleteMany({ where: { broadcastId: { in: sends } } });
  await h.prisma.emailBroadcast.deleteMany({ where: { senderId: { in: [people.admin.id, people.superAdmin.id] } } });
  await h.cleanup();
});

const post = (who, path, body) => h.api('POST', `/admin-emails${path}`, { token: h.token(who), body });
const mail = { subject: `Town meeting ${h.RUN}`, message: 'There is a town meeting on Friday at 9 AM.\n\nPlease come to the plaza.' };

test("a municipal admin's email reaches everyone of the town with a confirmed email, each by name", async () => {
  const preview = await post(people.admin, '/preview', { audience: 'all' });
  assert.equal(preview.status, 200, preview.body?.message);
  assert.equal(preview.body.data.recipients, 3);
  assert.equal(preview.body.data.skipped, 1);

  const sent = await post(people.admin, '', { ...mail, audience: 'all' });
  assert.equal(sent.status, 200, sent.body?.message);
  sends.push(sent.body.data.id);
  assert.equal(sent.body.data.recipients, 3);

  const broadcast = await h.prisma.emailBroadcast.findUnique({ where: { id: sent.body.data.id } });
  assert.equal(broadcast.municipalityId, town.id);
  // Sent out at once (no provider in the tests: the dev transport takes them).
  const done = await h.eventually(async () => {
    const row = await h.prisma.emailBroadcast.findUnique({ where: { id: broadcast.id } });
    return row.sent === 3 ? row : null;
  }, { ms: 10000 });
  assert.ok(done, 'all three sent');
  assert.equal(await h.prisma.emailOutbox.count({ where: { broadcastId: broadcast.id } }), 0);
  assert.equal(await h.prisma.auditLog.count({ where: { userId: people.admin.id, action: 'SEND_EMAIL_BROADCAST' } }), 1);
});

test('each copy names its person and keeps the paragraphs, escaped', async () => {
  const delivered = [];
  email.setDeliverForTests(async (m) => { delivered.push(m); return { messageId: 'x', delivered: true, transport: 'test' }; });
  try {
    const sent = await post(people.superAdmin, '', {
      subject: `Notice ${h.RUN}`, message: 'Hello <b>town</b>.\n\nSecond paragraph.', audience: 'selected', userIds: [people.buyer.id],
    });
    assert.equal(sent.status, 200, sent.body?.message);
    sends.push(sent.body.data.id);
    const copy = await h.eventually(() => delivered.find((m) => m.subject === `Notice ${h.RUN}`));
    assert.ok(copy, 'sent');
    assert.equal(copy.to, people.buyer.email);
    assert.match(copy.text, new RegExp(`Hi ${people.buyer.fullName}`));
    assert.match(copy.text, /Second paragraph\.\n\n— The E-MOORM team/);
    assert.match(copy.html, /Hello &lt;b&gt;town&lt;\/b&gt;\./);
    assert.equal(delivered.filter((m) => m.subject === `Notice ${h.RUN}`).length, 1);
  } finally {
    email.setDeliverForTests(null);
  }
});

test('a municipal admin emails only people of their town, and only everyone or picked people', async () => {
  const outsider = await post(people.admin, '', { ...mail, audience: 'selected', userIds: [people.outsider.id] });
  assert.equal(outsider.status, 403);
  const mixed = await post(people.admin, '/preview', { audience: 'selected', userIds: [people.buyer.id, people.outsider.id] });
  assert.equal(mixed.status, 403);
  const elsewhere = await post(people.admin, '/preview', { audience: 'all', municipalityId: other.id });
  assert.equal(elsewhere.status, 403);
  const sellersOnly = await post(people.admin, '/preview', { audience: 'sellers' });
  assert.equal(sellersOnly.status, 400);

  const picked = await post(people.admin, '/preview', { audience: 'selected', userIds: [people.buyer.id, people.shopHere.id] });
  assert.equal(picked.status, 200, picked.body?.message);
  assert.equal(picked.body.data.recipients, 2);

  const found = await h.api('GET', `/admin-emails/people?search=${encodeURIComponent(`Ci Email`)}`, { token: h.token(people.admin) });
  assert.equal(found.status, 200);
  const ids = found.body.data.map((p) => p.id);
  assert.ok(ids.includes(people.buyer.id) && ids.includes(people.shopHere.id));
  assert.ok(!ids.includes(people.outsider.id), 'no one from another town');
  assert.ok(found.body.data.every((p) => p.email.includes('•••')), 'emails masked');
  assert.equal(found.body.data.find((p) => p.id === people.unconfirmed.id).emailConfirmed, false);
});

test('a super admin chooses all buyers, sellers or municipal admins, of one town or all', async () => {
  const count = async (audience) => (await post(people.superAdmin, '/preview', { audience, municipalityId: town.id })).body.data;
  assert.equal((await count('buyers')).recipients, 1);
  assert.equal((await count('buyers')).skipped, 1);
  assert.equal((await count('sellers')).recipients, 2);
  assert.equal((await count('municipal_admins')).recipients, 1);
  assert.equal((await count('all')).recipients, 4);

  const anyone = await post(people.superAdmin, '/preview', { audience: 'selected', userIds: [people.outsider.id, people.buyer.id] });
  assert.equal(anyone.body.data.recipients, 2);
  const everyone = await post(people.superAdmin, '/preview', { audience: 'all' });
  assert.ok(everyone.body.data.recipients >= 6);
});

test('only admins send, five an hour each; a town admin lists only their town\'s', async () => {
  const buyer = await post(people.buyer, '/preview', { audience: 'all' });
  assert.equal(buyer.status, 403);
  const short = await post(people.admin, '', { subject: 'Hi', message: 'x', audience: 'all' });
  assert.equal(short.status, 400);

  const mine = await h.api('GET', '/admin-emails', { token: h.token(people.admin) });
  assert.equal(mine.status, 200);
  assert.ok(mine.body.data.length >= 1);
  assert.ok(mine.body.data.every((e) => e.municipality?.id === town.id));
  assert.ok(!mine.body.data.some((e) => e.subject === `Notice ${h.RUN}`), "the super admin's send to one person is not the town's");

  await h.prisma.emailBroadcast.createMany({
    data: Array.from({ length: 5 }, () => ({
      senderId: people.admin.id, senderRole: 'MUNICIPAL_ADMIN', municipalityId: town.id, audience: 'all', subject: 'x', message: 'x', recipients: 0,
    })),
  });
  const sixth = await post(people.admin, '', { ...mail, audience: 'all' });
  assert.equal(sixth.status, 429);
});
