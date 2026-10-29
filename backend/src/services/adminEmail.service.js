const crypto = require('crypto');
const prisma = require('../config/database');
const auditLogService = require('./auditLog.service');
const { broadcastMessage, flushOutbox, sendMail } = require('../utils/email');
const counters = require('../lib/securityCounters');
const { cleanText } = require('../utils/sanitize');
const { maskEmail } = require('../utils/privacy');
const { ApiError } = require('../middleware/errorHandler');

/*
 * Admins' emails to many people.
 *
 *   super admin      everyone, all buyers, all sellers or all municipal admins
 *                    (the whole province, or one town), or people picked by name
 *   municipal admin  everyone of their own town, or people of it picked by name
 *
 * "Of a town" is the reach of the admin's other tools: living there, or with
 * a shop (or a shop application) there. Only active accounts with a
 * confirmed email address get it: an address nobody confirmed may not be its
 * owner's, and mail that bounces hurts every other email the site sends.
 *
 * Each person's copy (with their name) waits in the email outbox. A send
 * starts going out at once; the email-outbox job (server.js) carries on with
 * whatever is left, after a restart too. Copies go a little apart so the
 * provider's rate limit holds, and the send's row counts what went and what
 * was given up on.
 */

const AUDIENCES = {
  SUPER_ADMIN: ['all', 'buyers', 'sellers', 'municipal_admins', 'selected'],
  MUNICIPAL_ADMIN: ['all', 'selected'],
};
const ROLES = { buyers: ['BUYER'], sellers: ['SELLER'], municipal_admins: ['MUNICIPAL_ADMIN'] };
// A town admin's "everyone": its buyers and sellers (its admins have the team chat).
const TOWN_EVERYONE = ['BUYER', 'SELLER'];

const SUBJECT_MIN = 3;
const SUBJECT_MAX = 150;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 5000;
const SELECTED_MAX = 200;
const SENDS_PER_HOUR = 5;
const QUEUE_CHUNK = 200;
// Resend takes two requests a second.
const GAP_MS = 550;
const DRAIN_ROUNDS = 60;

const REACHABLE = { deletedAt: null, isActive: true };

const ofTown = (municipalityId) => ({
  OR: [{ municipalityId }, { shopMunicipalityId: municipalityId }, { store: { is: { municipalityId } } }],
});

/** The town an admin's email may reach: a municipal admin's own; a super admin's choice, or none. */
const townOf = async (actor, requested) => {
  if (actor.role === 'MUNICIPAL_ADMIN') {
    if (!actor.municipalityId) throw new ApiError('No municipality assigned', 403);
    if (requested && requested !== actor.municipalityId) {
      throw new ApiError('You can only email people of your municipality', 403);
    }
    return prisma.municipality.findUnique({ where: { id: actor.municipalityId }, select: { id: true, name: true } });
  }
  if (!requested) return null;
  const town = await prisma.municipality.findUnique({ where: { id: String(requested) }, select: { id: true, name: true } });
  if (!town) throw new ApiError('Municipality not found', 404);
  return town;
};

const pickedIds = (value) => {
  const ids = [...new Set((Array.isArray(value) ? value : []).map((v) => String(v || '').trim()).filter(Boolean))];
  if (!ids.length) throw new ApiError('Pick at least one person', 400);
  if (ids.length > SELECTED_MAX) throw new ApiError(`Pick at most ${SELECTED_MAX} people`, 400);
  return ids;
};

/**
 * Who an email reaches.
 * @returns {Promise<{ audience, town, where, picked }>} `where` matches the
 * people it goes to, minus the email-confirmed check (see recipientsOf).
 */
const audienceOf = async (actor, input = {}) => {
  const audience = String(input.audience || '').toLowerCase();
  const allowed = AUDIENCES[actor.role] || [];
  if (!allowed.includes(audience)) {
    throw new ApiError(actor.role === 'MUNICIPAL_ADMIN'
      ? 'Send to everyone in your municipality or to people you pick'
      : 'Choose who gets this email', 400);
  }
  const town = await townOf(actor, input.municipalityId || null);
  const and = [REACHABLE];
  if (town) and.push(ofTown(town.id));
  let picked = null;
  if (audience === 'selected') {
    picked = pickedIds(input.userIds);
    and.push({ id: { in: picked } });
  } else if (ROLES[audience]) {
    and.push({ role: { in: ROLES[audience] } });
  } else if (town && actor.role === 'MUNICIPAL_ADMIN') {
    and.push({ role: { in: TOWN_EVERYONE } });
  }
  return { audience, town, where: { AND: and }, picked };
};

/** How many get it, and how many are left out for an unconfirmed email. */
const countsOf = async ({ where, picked }, actor) => {
  const [recipients, skipped] = await Promise.all([
    prisma.user.count({ where: { AND: [where, { isVerified: true }] } }),
    prisma.user.count({ where: { AND: [where, { isVerified: false }] } }),
  ]);
  // Someone picked who is not theirs to email (another town, or gone).
  if (picked && recipients + skipped < picked.length) {
    throw new ApiError(actor.role === 'MUNICIPAL_ADMIN'
      ? 'Some of the people picked are not in your municipality'
      : 'Some of the people picked no longer have an active account', actor.role === 'MUNICIPAL_ADMIN' ? 403 : 400);
  }
  return { recipients, skipped };
};

const textOf = (input = {}) => {
  const subject = cleanText(String(input.subject || ''), { maxLength: SUBJECT_MAX }) || '';
  // Plain text, line breaks kept (escaped when the email is built).
  const message = String(input.message || '')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (subject.length < SUBJECT_MIN) throw new ApiError(`Subject must be at least ${SUBJECT_MIN} characters`, 400);
  if (message.length < MESSAGE_MIN) throw new ApiError(`Message must be at least ${MESSAGE_MIN} characters`, 400);
  if (message.length > MESSAGE_MAX) throw new ApiError(`Message must be at most ${MESSAGE_MAX} characters`, 400);
  return { subject, message };
};

const signatureOf = (actor, town) => (actor.role === 'MUNICIPAL_ADMIN' && town
  ? `The ${town.name} municipal admin team, E-MOORM`
  : 'The E-MOORM team');

/** Before sending: how many it would reach. */
const preview = async (actor, input) => {
  const scope = await audienceOf(actor, input);
  const counts = await countsOf(scope, actor);
  return { ...counts, audience: scope.audience, municipality: scope.town };
};

// Sends being sent from this process (the job sends the rest of any other).
const draining = new Set();

/** Send a broadcast's copies now, a round at a time, until none is due. */
const drain = async (broadcastId) => {
  if (draining.has(broadcastId)) return;
  draining.add(broadcastId);
  try {
    for (let round = 0; round < DRAIN_ROUNDS; round += 1) {
      // eslint-disable-next-line no-await-in-loop
      const stats = await flushOutbox({ broadcastId, limit: 100, gapMs: GAP_MS });
      if (stats.failed || !(stats.sent + stats.gaveUp)) break;
    }
  } catch (err) {
    console.error('[admin-email] sending stopped, the email job carries on:', err.message);
  } finally {
    draining.delete(broadcastId);
  }
};

/**
 * Send an email to many people.
 * @param {Object} actor - the admin (req.user)
 * @param {Object} input - { subject, message, audience, municipalityId?, userIds? }
 */
const send = async (actor, input, req) => {
  const { subject, message } = textOf(input);
  const scope = await audienceOf(actor, input);
  const { skipped } = await countsOf(scope, actor);

  const lastHour = await prisma.emailBroadcast.count({
    where: { senderId: actor.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (lastHour >= SENDS_PER_HOUR) {
    throw new ApiError(`You can send ${SENDS_PER_HOUR} emails an hour. Try again later.`, 429);
  }

  const people = await prisma.user.findMany({
    where: { AND: [scope.where, { isVerified: true }] },
    select: { email: true, fullName: true },
  });
  if (!people.length) {
    throw new ApiError(skipped
      ? 'Nobody here has confirmed their email address yet'
      : 'Nobody to send this to', 400);
  }

  const id = crypto.randomUUID();
  const sentBy = signatureOf(actor, scope.town);
  const now = new Date();
  const copies = people.map((p) => {
    const mail = broadcastMessage({ name: p.fullName, subject, message, sentBy });
    return {
      to: String(p.email).slice(0, 320), subject: mail.subject, html: mail.html, text: mail.text,
      attempts: 0, nextAttemptAt: now, broadcastId: id,
    };
  });
  const writes = [prisma.emailBroadcast.create({
    data: {
      id,
      senderId: actor.id,
      senderEmail: actor.email || null,
      senderRole: actor.role,
      municipalityId: scope.town?.id || null,
      audience: scope.audience,
      subject,
      message,
      recipients: people.length,
    },
  })];
  for (let i = 0; i < copies.length; i += QUEUE_CHUNK) {
    writes.push(prisma.emailOutbox.createMany({ data: copies.slice(i, i + QUEUE_CHUNK) }));
  }
  // All or nothing: a send that fails part-way reaches nobody, so sending
  // again never gives anyone two.
  await prisma.$transaction(writes);

  await auditLogService.record({
    actor,
    req,
    action: 'SEND_EMAIL_BROADCAST',
    entity: 'EmailBroadcast',
    entityId: id,
    details: { subject, audience: scope.audience, recipients: people.length, skipped, municipalityId: scope.town?.id || null },
    municipalityId: scope.town?.id || null,
  });

  setImmediate(() => { drain(id); });
  return { id, recipients: people.length, skipped, audience: scope.audience, municipality: scope.town };
};

const TESTS_PER_HOUR = 10;

/** The email as one person gets it, greeting and sign-off included (shown on the page). */
const sample = async (actor, input) => {
  const { subject, message } = textOf(input);
  const town = actor.role === 'MUNICIPAL_ADMIN' ? await townOf(actor, null) : null;
  const mail = broadcastMessage({ name: actor.fullName || 'there', subject, message, sentBy: signatureOf(actor, town) });
  return { subject: mail.subject, html: mail.html, text: mail.text };
};

/** A copy to the admin's own address, to check it before everyone gets it. */
const sendTest = async (actor, input) => {
  const { subject, message } = textOf(input);
  if (!actor.email) throw new ApiError('Your account has no email address', 400);
  const { hits } = await counters.hit(`admin-email-test:${actor.id}`, 60 * 60 * 1000);
  if (hits > TESTS_PER_HOUR) throw new ApiError(`You can send ${TESTS_PER_HOUR} test emails an hour. Try again later.`, 429);
  const town = actor.role === 'MUNICIPAL_ADMIN' ? await townOf(actor, null) : null;
  const mail = broadcastMessage({ name: actor.fullName || 'there', subject, message, sentBy: signatureOf(actor, town) });
  await sendMail({ to: actor.email, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text });
  return { to: maskEmail(actor.email) };
};

/** Emails sent: a super admin's view is all of them, a municipal admin's their town's. */
const list = async (actor, options = {}) => {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(options.pageSize) || 10));
  const where = actor.role === 'MUNICIPAL_ADMIN' ? { municipalityId: actor.municipalityId || '-' } : {};
  const [rows, total] = await Promise.all([
    prisma.emailBroadcast.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.emailBroadcast.count({ where }),
  ]);
  const townIds = [...new Set(rows.map((r) => r.municipalityId).filter(Boolean))];
  const towns = townIds.length
    ? new Map((await prisma.municipality.findMany({ where: { id: { in: townIds } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]))
    : new Map();
  return {
    emails: rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      message: r.message,
      audience: r.audience,
      municipality: r.municipalityId ? { id: r.municipalityId, name: towns.get(r.municipalityId) || null } : null,
      recipients: r.recipients,
      sent: r.sent,
      failed: r.failed,
      waiting: Math.max(0, r.recipients - r.sent - r.failed),
      sentBy: r.senderEmail ? maskEmail(r.senderEmail) : null,
      senderRole: r.senderRole,
      createdAt: r.createdAt,
    })),
    total,
    page,
    pageSize,
  };
};

/** People to pick, by name or email: a municipal admin's from their own town. Emails masked. */
const lookup = async (actor, { search } = {}) => {
  const q = String(search || '').trim().slice(0, 60);
  if (q.length < 2) return [];
  const town = actor.role === 'MUNICIPAL_ADMIN' ? await townOf(actor, null) : null;
  const and = [REACHABLE, { OR: [{ fullName: { contains: q } }, { email: { contains: q } }, { shopName: { contains: q } }] }];
  if (town) {
    and.push(ofTown(town.id));
    and.push({ role: { in: TOWN_EVERYONE } });
  }
  const people = await prisma.user.findMany({
    where: { AND: and },
    select: {
      id: true, fullName: true, email: true, role: true, isVerified: true, shopName: true,
      municipality: { select: { name: true } },
    },
    orderBy: { fullName: 'asc' },
    take: 20,
  });
  return people.map((p) => ({
    id: p.id,
    fullName: p.fullName,
    email: maskEmail(p.email),
    role: p.role,
    shopName: p.shopName || null,
    municipality: p.municipality?.name || null,
    emailConfirmed: Boolean(p.isVerified),
  }));
};

module.exports = {
  preview, sample, sendTest, send, list, lookup, drain, SELECTED_MAX, SENDS_PER_HOUR, MESSAGE_MAX, SUBJECT_MAX,
};
