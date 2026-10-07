const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

// The admin shell (web: hooks/useAdminShellData.js) reads the bell's count,
// the sidebar's Notifications badge and the rail's newest rows from one
// request: GET /notifications?audience=ADMIN&page=1&pageSize=6. Its
// `unreadCount` must be the whole admin feed's unread count, the same number
// /notifications/unread/count gives, and follow reads made from the rail and
// the notifications page.

after(() => h.cleanup());

// The admin lives in a town of this file's own: other files run at the same
// time and alert every admin of the shared town (a new report, a seller
// application), which would land between the two counts compared below.
// The shared towns are made first so h.reference() never picks this one.
const ownTown = async () => {
  const shared = await h.reference();
  await h.otherTown(shared.id);
  const where = { code: 'CI-SHELL' };
  return await h.prisma.municipality.findFirst({ where })
    || h.prisma.municipality.create({ data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffff02', name: 'Ci Zz Shell Town', code: 'CI-SHELL' } })
      .catch(async (err) => { if (err.code !== 'P2002') throw err; return h.prisma.municipality.findFirst({ where }); });
};

test('one admin notification list request gives the newest six and the admin unread count', async () => {
  const town = await ownTown();
  const admin = await h.user('MUNICIPAL_ADMIN', { municipality: { connect: { id: town.id } } });
  const asAdmin = h.token(admin);
  const minutesAgo = (n) => new Date(Date.now() - n * 60e3);
  const notice = (n, extra) => ({
    userId: admin.id, type: 'ADMIN_ALERT', title: `Ci notice ${n}`, message: 'Made by the tests.', createdAt: minutesAgo(n), ...extra,
  });
  await h.prisma.notification.createMany({
    data: [
      // Eight unread for the admin, newest first: 1 … 8 minutes old.
      ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => notice(n, { audience: 'ADMIN' })),
      // Read, removed, or for another audience: none of these are unread here.
      notice(9, { audience: 'ADMIN', isRead: true }),
      notice(10, { audience: 'ADMIN', isRead: true }),
      notice(11, { audience: 'ADMIN', deletedAt: new Date() }),
      ...[12, 13, 14].map((n) => notice(n, { audience: 'BUYER', type: 'SYSTEM_ANNOUNCEMENT' })),
    ],
  });

  const shell = async () => {
    const res = await h.api('GET', '/notifications?audience=ADMIN&page=1&pageSize=6', { token: asAdmin });
    assert.equal(res.status, 200);
    return res.body;
  };
  const count = async (audience) => (await h.api('GET', `/notifications/unread/count${audience ? `?audience=${audience}` : ''}`, { token: asAdmin })).body.data.count;

  let feed = await shell();
  assert.deepEqual(feed.data.map((n) => n.title), [1, 2, 3, 4, 5, 6].map((n) => `Ci notice ${n}`));
  assert.ok(feed.data.every((n) => n.audience === 'ADMIN' && n.isRead === false));
  assert.equal(feed.unreadCount, 8);
  assert.equal(feed.unreadCount, await count('ADMIN'));

  // A row opened from the rail is marked read; the shell's next read counts it.
  const opened = feed.data[0];
  assert.equal((await h.api('PUT', `/notifications/${opened.id}/read`, { token: asAdmin })).status, 200);
  feed = await shell();
  assert.equal(feed.unreadCount, 7);
  assert.equal(feed.data.find((n) => n.id === opened.id).isRead, true);
  assert.equal(feed.unreadCount, await count('ADMIN'));

  // "Mark all read" on the admin's notifications page reads the admin feed only.
  assert.equal((await h.api('PUT', '/notifications/read-all?audience=ADMIN', { token: asAdmin })).status, 200);
  feed = await shell();
  assert.equal(feed.unreadCount, 0);
  assert.equal(await count('ADMIN'), 0);
  assert.equal(await count(), 3);
});
