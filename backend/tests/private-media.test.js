const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const h = require('./helpers');
const config = require('../src/config/env');
const privateMedia = require('../src/lib/privateMedia');
const service = require('../src/services/privateMedia.service');
const messageService = require('../src/services/message.service');

const made = [];
const reports = [];
const conversations = [];
after(async () => {
  await Promise.all(made.map((p) => fs.promises.unlink(p).catch(() => {})));
  // The shared cleanup does not know reports; chats go before their users.
  await h.prisma.report.deleteMany({ where: { id: { in: reports } } });
  await h.prisma.message.deleteMany({ where: { conversationId: { in: conversations } } });
  await h.prisma.conversation.deleteMany({ where: { id: { in: conversations } } });
  await h.cleanup();
});

const png = () => require('../src/lib/sharp')({ create: { width: 40, height: 30, channels: 3, background: '#2e7d32' } }).png().toBuffer();

const uploadPrivate = async (user) => {
  const base = await h.startApp();
  const form = new FormData();
  form.append('file', new Blob([await png()], { type: 'image/png' }), 'proof.png');
  const res = await fetch(`${base}/upload/private-image`, { method: 'POST', headers: { Authorization: `Bearer ${h.token(user)}` }, body: form });
  return { status: res.status, body: await res.json() };
};

const site = async () => (await h.startApp()).replace(/\/api$/, '');

test('a private photo is served only through a signed, unexpired link', async () => {
  const buyer = await h.user('BUYER');
  const up = await uploadPrivate(buyer);
  assert.equal(up.status, 200, up.body?.message);
  const ref = privateMedia.normalize(up.body.data.url);
  assert.ok(privateMedia.isPrivateRef(ref), ref);
  made.push(privateMedia.pathOf(ref));
  // Not in the public folder.
  assert.equal(fs.existsSync(path.join(path.resolve(config.upload.uploadDir), privateMedia.fileOf(ref))), false);

  const ok = await fetch(`${await site()}${up.body.data.previewUrl}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /^image\//);
  assert.match(ok.headers.get('cache-control'), /^private/);
  // Unsigned, forged, or expired: nothing.
  assert.equal((await fetch(`${await site()}${ref}`)).status, 404);
  assert.equal((await fetch(`${await site()}${up.body.data.previewUrl.replace(/s=[^&]+/, 's=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')}`)).status, 404);
  const expired = Math.floor(Date.now() / 1000) - 60;
  assert.equal(privateMedia.verify(privateMedia.fileOf(ref), expired, 'x'), false);
});

test('a chat photo reaches the other side as a signed link, and unsending hides it from both', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const convo = await h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: store.id, lastMessageAt: new Date() } });
  conversations.push(convo.id);
  const up = await uploadPrivate(buyer);
  made.push(privateMedia.pathOf(up.body.data.url));

  const sent = await h.api('POST', `/messages/conversations/${convo.id}/messages`, { token: h.token(buyer), body: { imageUrl: up.body.data.url } });
  assert.equal(sent.status, 201, sent.body?.message);
  const stored = await h.prisma.message.findUnique({ where: { id: sent.body.data.id } });
  assert.equal(stored.imageUrl, privateMedia.normalize(up.body.data.url), 'stored without the signature');

  const view = await h.api('GET', `/messages/conversations/${convo.id}`, { token: h.token(seller) });
  const shown = view.body.data.messages.find((m) => m.id === sent.body.data.id).imageUrl;
  assert.match(shown, /\?e=\d+&s=/);
  assert.equal((await fetch(`${await site()}${shown}`)).status, 200);

  const unsent = await h.api('DELETE', `/messages/conversations/${convo.id}/messages/${sent.body.data.id}`, { token: h.token(buyer) });
  assert.equal(unsent.status, 200, unsent.body?.message);
  const after1 = await h.api('GET', `/messages/conversations/${convo.id}`, { token: h.token(seller) });
  assert.equal(after1.body.data.messages.some((m) => m.id === sent.body.data.id), false, 'hidden from the other side');
  // Kept (hidden) for moderators, file included.
  const kept = await h.prisma.message.findUnique({ where: { id: sent.body.data.id } });
  assert.ok(kept?.unsentAt);
  assert.ok(fs.existsSync(privateMedia.pathOf(kept.imageUrl)));

  // Thirty days on, it is erased with its photo.
  await h.prisma.message.update({ where: { id: kept.id }, data: { unsentAt: new Date(Date.now() - 31 * 86400e3) } });
  await messageService.purgeUnsent();
  assert.equal(await h.prisma.message.count({ where: { id: kept.id } }), 0);
  assert.equal(fs.existsSync(privateMedia.pathOf(kept.imageUrl)), false);
});

test('photos stored publicly before move to the private folder; one a product also uses stays public', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const convo = await h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: store.id, lastMessageAt: new Date() } });
  conversations.push(convo.id);
  const uploadDir = path.resolve(config.upload.uploadDir);
  await fs.promises.mkdir(uploadDir, { recursive: true });
  const lone = `ci-${Date.now()}-lone.png`;
  const shared = `ci-${Date.now()}-shared.png`;
  for (const f of [lone, shared]) {
    await fs.promises.writeFile(path.join(uploadDir, f), await png());
    made.push(path.join(uploadDir, f), path.join(privateMedia.mediaDir(), f));
  }
  await h.product(store, { images: [`/uploads/${shared}`] });
  const m1 = await h.prisma.message.create({ data: { conversationId: convo.id, senderId: buyer.id, body: '', imageUrl: `/uploads/${lone}` } });
  const m2 = await h.prisma.message.create({ data: { conversationId: convo.id, senderId: buyer.id, body: '', imageUrl: `/uploads/${shared}` } });

  const stats = await service.migratePublicPhotos();
  assert.ok(stats.moved >= 2, JSON.stringify(stats));
  assert.equal((await h.prisma.message.findUnique({ where: { id: m1.id } })).imageUrl, `/private-media/${lone}`);
  assert.equal((await h.prisma.message.findUnique({ where: { id: m2.id } })).imageUrl, `/private-media/${shared}`);
  assert.equal(fs.existsSync(path.join(uploadDir, lone)), false, 'the chat-only photo left the public folder');
  assert.equal(fs.existsSync(path.join(uploadDir, shared)), true, 'the product still shows its photo');
  assert.ok(fs.existsSync(path.join(privateMedia.mediaDir(), lone)));
  // Running it again changes nothing.
  const again = await service.migratePublicPhotos();
  assert.equal((await h.prisma.message.findUnique({ where: { id: m1.id } })).imageUrl, `/private-media/${lone}`);
  assert.ok(again.moved === 0 || again.moved < stats.moved);
});

test('the sweep removes old private files nothing refers to, and keeps the rest', async () => {
  const dir = privateMedia.mediaDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const orphan = path.join(dir, `ci-${Date.now()}-orphan.png`);
  const young = path.join(dir, `ci-${Date.now()}-young.png`);
  await fs.promises.writeFile(orphan, 'x');
  await fs.promises.writeFile(young, 'x');
  made.push(orphan, young);
  const old = new Date(Date.now() - 2 * 86400e3);
  await fs.promises.utimes(orphan, old, old);
  await service.sweepUnreferenced();
  assert.equal(fs.existsSync(orphan), false);
  assert.equal(fs.existsSync(young), true);
});

test('an admin handling a report sees the chat it is about, unsent messages marked; another town\'s admin does not', async () => {
  const buyer = await h.user('BUYER');
  const seller = await h.user('SELLER');
  const store = await h.shop(seller);
  const convo = await h.prisma.conversation.create({ data: { buyerId: buyer.id, storeId: store.id, lastMessageAt: new Date() } });
  conversations.push(convo.id);
  await h.prisma.message.create({ data: { conversationId: convo.id, senderId: seller.id, body: 'rude words', unsentAt: new Date() } });
  await h.prisma.message.create({ data: { conversationId: convo.id, senderId: buyer.id, body: 'why so rude?' } });
  const report = await h.prisma.report.create({
    data: { reporterId: buyer.id, type: 'SELLER', reportedSellerId: seller.id, reason: 'HARASSMENT', municipalityId: store.municipalityId },
  });
  reports.push(report.id);
  const admin = await h.user('MUNICIPAL_ADMIN');
  const res = await h.api('GET', `/reports/${report.id}/conversation`, { token: h.token(admin) });
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.body.data.conversationId, convo.id);
  const rude = res.body.data.messages.find((m) => m.body === 'rude words');
  assert.ok(rude?.unsentAt, 'the unsent message is shown, marked');
  assert.equal(rude.from, 'shop');
  assert.ok(await h.prisma.auditLog.findFirst({ where: { action: 'VIEW_REPORT_CHAT', entityId: report.id } }), 'the look is logged');

  const other = await h.otherTown(store.municipalityId);
  const outsider = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: other.id } } });
  assert.equal((await h.api('GET', `/reports/${report.id}/conversation`, { token: h.token(outsider) })).status, 403);
  assert.equal((await h.api('GET', `/reports/${report.id}/conversation`, { token: h.token(buyer) })).status, 403);
});
