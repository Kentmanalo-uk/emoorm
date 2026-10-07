const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const speakeasy = require('speakeasy');
const h = require('./helpers');

// A town of this file's own, so its team starts empty.
let town;
let primary;
const secret = speakeasy.generateSecret({ length: 20 }).base32;
const codeNow = () => speakeasy.totp({ secret, encoding: 'base32' });
// Each add needs a code not used in the last two minutes: step through the
// valid window (now, 30 s back, 30 s ahead) one code at a time.
let step = 0;
const freshCode = () => {
  step += 1;
  return speakeasy.totp({ secret, encoding: 'base32', time: Math.floor(Date.now() / 1000) + [0, -30, 30][(step - 1) % 3] });
};

const admin = async (extra = {}) => h.user('MUNICIPAL_ADMIN', {
  municipality: { connect: { id: town.id } }, mfaEnabled: true, mfaSecret: secret, ...extra,
});
const session = async (u) => h.token(await h.prisma.user.findUnique({ where: { id: u.id } }));

before(async () => {
  const made = await h.prisma.municipality.findFirst({ where: { code: 'CI-TEAM' } })
    || await h.prisma.municipality.create({ data: { name: 'Ci Team Town', code: 'CI-TEAM' } });
  town = made;
  await h.prisma.user.updateMany({ where: { municipalityId: town.id, role: 'MUNICIPAL_ADMIN' }, data: { role: 'BUYER' } });
  primary = await admin();
  await h.prisma.municipality.update({ where: { id: town.id }, data: { adminId: primary.id } });
});

after(async () => {
  await h.prisma.municipality.update({ where: { id: town.id }, data: { adminId: null } });
  await h.prisma.user.updateMany({ where: { municipalityId: town.id }, data: { adminAddedById: null } });
  await h.cleanup();
});

test('an admin adds someone with their authenticator code; the new admin adds another', async () => {
  const buyer = await h.user('BUYER');
  const p = await session(primary);

  const wrong = await h.api('POST', '/admin-team', { token: p, body: { email: buyer.email, code: '000000' } });
  assert.equal(wrong.status, 400);
  assert.equal((await h.prisma.user.findUnique({ where: { id: buyer.id } })).role, 'BUYER');

  const looked = await h.api('GET', `/admin-team/lookup?email=${encodeURIComponent(buyer.email.toUpperCase())}`, { token: p });
  assert.equal(looked.status, 200, looked.body?.message);
  assert.equal(looked.body.data.user.id, buyer.id);
  assert.equal(looked.body.data.reason, null);

  const added = await h.api('POST', '/admin-team', { token: p, body: { email: buyer.email, kind: 'ADMIN', code: freshCode() } });
  assert.equal(added.status, 201, added.body?.message);
  assert.equal(added.body.data.kind, 'ADMIN');
  assert.equal(added.body.data.addedBy.id, primary.id);

  // The added admin is a permanent admin: they may add another, a backup.
  await h.prisma.user.update({ where: { id: buyer.id }, data: { mfaEnabled: true, mfaSecret: secret } });
  const second = await h.user('BUYER');
  const until = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
  const byNew = await h.api('POST', '/admin-team', {
    token: await session(buyer), body: { email: second.email, kind: 'BACKUP', accessExpiresAt: until, code: freshCode() },
  });
  assert.equal(byNew.status, 201, byNew.body?.message);
  assert.equal(byNew.body.data.kind, 'BACKUP');

  const list = await h.api('GET', '/admin-team', { token: p });
  assert.equal(list.status, 200);
  // Other test files may add admins to this town too: look at this test's own.
  const ours = [primary.id, buyer.id, second.id];
  const kinds = list.body.data.members.filter((m) => ours.includes(m.id)).map((m) => m.kind);
  assert.deepEqual(kinds, ['PRIMARY', 'ADMIN', 'BACKUP']);
  const me = list.body.data.members.find((m) => m.id === primary.id);
  assert.equal(me.isYou, true);
  assert.equal(me.canRemove, false);

  // A backup may not add anyone.
  const third = await h.user('BUYER');
  const byBackup = await h.api('POST', '/admin-team', {
    token: await session(second), body: { email: third.email, code: codeNow() },
  });
  assert.equal(byBackup.status, 403);
});

test('removing: the primary admin anyone else, others only whom they added, never the primary', async () => {
  const p = await session(primary);
  const a = await admin({ adminAddedBy: { connect: { id: primary.id } } });
  const b = await admin({ adminAddedBy: { connect: { id: a.id } } });
  const c = await admin({ adminAddedBy: { connect: { id: primary.id } } });
  const asA = await session(a);

  assert.equal((await h.api('DELETE', `/admin-team/${c.id}`, { token: asA })).status, 403);
  assert.equal((await h.api('DELETE', `/admin-team/${primary.id}`, { token: asA })).status, 403);
  assert.equal((await h.api('DELETE', `/admin-team/${b.id}`, { token: asA })).status, 200);
  assert.equal((await h.prisma.user.findUnique({ where: { id: b.id } })).role, 'BUYER');
  assert.equal((await h.api('DELETE', `/admin-team/${c.id}`, { token: p })).status, 200);

  // An admin of another town sees nothing of this team.
  const other = await h.otherTown(town.id);
  const elsewhere = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: other.id } } });
  assert.equal((await h.api('DELETE', `/admin-team/${a.id}`, { token: h.token(elsewhere) })).status, 404);
  await h.prisma.user.update({ where: { id: a.id }, data: { role: 'BUYER' } });
});

test('who can be added, and the team limit', async () => {
  const p = await session(primary);
  const seller = await h.user('SELLER');
  const s = await h.api('GET', `/admin-team/lookup?email=${encodeURIComponent(seller.email)}`, { token: p });
  assert.match(s.body.data.reason, /runs a shop/);
  const unconfirmed = await h.user('BUYER', { isVerified: false });
  const u = await h.api('POST', '/admin-team', { token: p, body: { email: unconfirmed.email, code: codeNow() } });
  assert.equal(u.status, 400);
  assert.equal((await h.api('GET', '/admin-team/lookup?email=nobody-at-all@example.test', { token: p })).status, 404);

  const max = (await h.api('GET', '/admin-team', { token: p })).body.data.max;
  const current = (await h.api('GET', '/admin-team', { token: p })).body.data.members.length;
  for (let i = current; i < max; i += 1) await admin();
  const full = await h.api('GET', '/admin-team', { token: p });
  assert.equal(full.body.data.canAdd, false);
  const late = await h.user('BUYER');
  const refused = await h.api('POST', '/admin-team', { token: p, body: { email: late.email, code: codeNow() } });
  assert.equal(refused.status, 400);
  assert.match(refused.body.message, /team is full/);
});

test('signed-in use marks an admin online', async () => {
  const a = await admin();
  await h.api('GET', '/admin-team', { token: await session(a) });
  await new Promise((r) => setTimeout(r, 200));
  const row = await h.prisma.user.findUnique({ where: { id: a.id } });
  assert.ok(row.lastActiveAt && Date.now() - row.lastActiveAt.getTime() < 60 * 1000);
  const list = await h.api('GET', '/admin-team', { token: await session(primary) });
  assert.equal(list.body.data.members.find((m) => m.id === a.id).online, true);
});

test('team chat: the whole team, and admin to admin; only members read it', async () => {
  const a = await admin({ adminAddedBy: { connect: { id: primary.id } } });
  const p = await session(primary);
  const asA = await session(a);

  const sent = await h.api('POST', '/admin-team/chats/team', { token: p, body: { body: 'Meeting at 2 PM about the fiesta stalls' } });
  assert.equal(sent.status, 201, sent.body?.message);
  assert.equal((await h.api('POST', '/admin-team/chats/team', { token: p, body: { body: '   ' } })).status, 400);

  let list = await h.api('GET', '/admin-team/chats', { token: asA });
  assert.equal(list.status, 200, list.body?.message);
  const teamChat = list.body.data.chats.find((c) => c.thread === 'team');
  assert.equal(teamChat.unread, 1);
  assert.equal(teamChat.last.body, 'Meeting at 2 PM about the fiesta stalls');
  // The sidebar badge counts it too.
  const waiting = await h.api('GET', '/moderation/attention', { token: asA });
  assert.equal(waiting.body.data.find((i) => i.link === '/admin/team').count, 1);

  const read = await h.api('GET', '/admin-team/chats/team', { token: asA });
  assert.equal(read.body.data.messages.at(-1).sender.id, primary.id);
  list = await h.api('GET', '/admin-team/chats', { token: asA });
  assert.equal(list.body.data.chats.find((c) => c.thread === 'team').unread, 0);

  // Admin to admin: the thread is the other admin's id.
  assert.equal((await h.api('POST', `/admin-team/chats/${primary.id}`, { token: asA, body: { body: 'Can you cover the reports today?' } })).status, 201);
  const pList = await h.api('GET', '/admin-team/chats', { token: p });
  assert.equal(pList.body.data.chats.find((c) => c.thread === a.id).unread, 1);
  const dm = await h.api('GET', `/admin-team/chats/${a.id}`, { token: p });
  assert.deepEqual(dm.body.data.messages.map((m) => m.body), ['Can you cover the reports today?']);

  // Not to yourself, not to someone off the team, not read by outsiders.
  assert.equal((await h.api('POST', `/admin-team/chats/${a.id}`, { token: asA, body: { body: 'me' } })).status, 404);
  const buyer = await h.user('BUYER');
  assert.equal((await h.api('POST', `/admin-team/chats/${buyer.id}`, { token: asA, body: { body: 'hi' } })).status, 404);
  assert.equal((await h.api('GET', '/admin-team/chats/team', { token: h.token(buyer) })).status, 403);
  const other = await h.otherTown(town.id);
  const elsewhere = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: other.id } } });
  assert.equal((await h.api('GET', `/admin-team/chats/${a.id}`, { token: h.token(elsewhere) })).status, 404);

  // Taken off the team: the chats are gone for them.
  await h.api('DELETE', `/admin-team/${a.id}`, { token: p });
  assert.equal((await h.api('GET', '/admin-team/chats', { token: h.token({ ...a, role: 'MUNICIPAL_ADMIN' }) })).status, 401);
});
