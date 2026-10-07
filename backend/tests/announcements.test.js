const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

// A town of this file's own, kept between runs like the admin team's, and
// more people in it than one insert batch holds (500). Its name and id sort
// last so h.reference() never hands it to the other files: their people
// would get this broadcast, and one removed by their cleanup while it is
// sent fails the whole send. The residents are kept between runs too, with
// ids that sort after everyone else's: adding and removing 520 people each
// run, and their notices spread through the indexes, locked enough to
// deadlock the files running alongside.
const PEOPLE = 520;
let town;
let ids = [];

before(async () => {
  const shared = await h.reference();
  await h.otherTown(shared.id);
  const where = { code: 'CI-ANNOUNCE' };
  town = await h.prisma.municipality.findFirst({ where })
    || await h.prisma.municipality.create({ data: { id: 'ffffffff-ffff-4fff-8fff-ffffffffff03', name: 'Ci Zz Announce Town', code: 'CI-ANNOUNCE' } })
      .catch(async (err) => { if (err.code !== 'P2002') throw err; return h.prisma.municipality.findFirst({ where }); });
  await h.prisma.user.createMany({
    data: Array.from({ length: PEOPLE }, (_, i) => ({
      id: `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`,
      email: `ci-announce-resident-${i}@example.test`, password: 'x', fullName: `Ci Resident ${i}`, municipalityId: town.id, isVerified: true,
    })),
    skipDuplicates: true,
  });
  ids = (await h.prisma.user.findMany({ where: { email: { startsWith: 'ci-announce-resident-' } }, select: { id: true } })).map((u) => u.id);
});

after(async () => {
  await h.prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await h.cleanup();
});

test('a broadcast that fails part-way delivers nothing, so a retry reaches everyone once', async () => {
  const admin = await h.user('SUPER_ADMIN');
  const body = { title: `Water interruption ${h.RUN}`, message: 'No water on Friday from 8 AM to noon.', target: 'all', municipalityId: town.id };
  const received = () => h.prisma.notification.groupBy({ by: ['userId'], where: { userId: { in: ids }, title: body.title }, _count: { _all: true } });

  // The second batch names someone who does not exist, so the database refuses it.
  const notifications = h.prisma.notification;
  const createMany = notifications.createMany;
  let batch = 0;
  notifications.createMany = (args) => {
    batch += 1;
    return createMany.call(notifications, batch === 2 ? { data: [...args.data, { ...args.data[0], userId: 'ci-nobody' }] } : args);
  };
  let failed;
  try {
    failed = await h.api('POST', '/announcements', { token: h.token(admin), body });
  } finally {
    notifications.createMany = createMany;
  }
  assert.equal(batch, 2);
  assert.equal(failed.status, 400);
  assert.deepEqual(await received(), []);

  const sent = await h.api('POST', '/announcements', { token: h.token(admin), body });
  assert.equal(sent.status, 200, sent.body?.message);
  assert.ok(sent.body.data.delivered >= PEOPLE);
  const perPerson = await received();
  assert.equal(perPerson.length, PEOPLE);
  assert.ok(perPerson.every((p) => p._count._all === 1));
  // Only the send that went out is in the Sent list (it reads the audit trail).
  assert.equal(await h.prisma.auditLog.count({ where: { userId: admin.id, action: 'BROADCAST_ANNOUNCEMENT' } }), 1);
});
