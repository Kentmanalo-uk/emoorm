const prisma = require('../config/database');
const notificationService = require('./notification.service');
const { membersOf } = require('./adminTeam.service');
const { cleanText } = require('../utils/sanitize');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Messages between the municipal admins of one town, on the Admin team page:
 * one chat for the whole team ('team') and one between any two admins (the
 * other admin's id). Only current members read or write; someone taken off
 * the team loses the chats, and what they wrote stays for the others.
 */

const TEAM = 'team';
const PAGE = 50;
const MAX_BODY = 2000;

const SENDER = { select: { id: true, fullName: true, profilePhoto: true } };

/** The actor's town and its current admins; refuses anyone not on the team. */
const teamOf = async (actor) => {
  if (actor.role !== 'MUNICIPAL_ADMIN' || !actor.municipalityId) {
    throw new ApiError('Team chat is for the municipal admins of a town', 403);
  }
  const members = await membersOf(actor.municipalityId);
  if (!members.some((m) => m.id === actor.id)) throw new ApiError('You are not on this team', 403);
  return { townId: actor.municipalityId, members };
};

/** The messages of a thread, as a where clause. */
const threadWhere = (townId, actorId, thread) => (thread === TEAM
  ? { municipalityId: townId, recipientId: null }
  : {
    municipalityId: townId,
    OR: [
      { senderId: actorId, recipientId: thread },
      { senderId: thread, recipientId: actorId },
    ],
  });

/** Messages someone else wrote in a thread since the actor last read it. */
const unreadWhere = (townId, actorId, thread, since) => ({
  ...(thread === TEAM
    ? { municipalityId: townId, recipientId: null, senderId: { not: actorId } }
    : { municipalityId: townId, senderId: thread, recipientId: actorId }),
  ...(since ? { createdAt: { gt: since } } : {}),
});

const checkThread = (thread, actor, members) => {
  if (thread === TEAM) return;
  if (thread === actor.id || !members.some((m) => m.id === thread)) throw new ApiError('Not on this team', 404);
};

const present = (m) => ({
  id: m.id, body: m.body, createdAt: m.createdAt, sender: m.sender, recipientId: m.recipientId,
});

/** The chats: the team's, then one per other admin, with their last message and unread count. */
const listChats = async (actor) => {
  const { townId, members } = await teamOf(actor);
  const reads = await prisma.teamChatRead.findMany({ where: { userId: actor.id } });
  const readAt = Object.fromEntries(reads.map((r) => [r.thread, r.lastReadAt]));
  const others = members.filter((m) => m.id !== actor.id);
  const threads = [TEAM, ...others.map((m) => m.id)];
  const rows = await Promise.all(threads.map(async (thread) => {
    const [last, unread] = await Promise.all([
      prisma.teamMessage.findFirst({ where: threadWhere(townId, actor.id, thread), orderBy: { createdAt: 'desc' }, include: { sender: SENDER } }),
      prisma.teamMessage.count({ where: unreadWhere(townId, actor.id, thread, readAt[thread]) }),
    ]);
    const member = others.find((m) => m.id === thread);
    return {
      thread,
      title: member ? member.fullName : 'Everyone on the team',
      profilePhoto: member?.profilePhoto || null,
      size: thread === TEAM ? members.length : 2,
      last: last ? present(last) : null,
      unread,
    };
  }));
  return { chats: rows, unread: rows.reduce((n, r) => n + r.unread, 0) };
};

/** A thread's messages, oldest first: the latest page, or the page before `before`. Reading marks it read. */
const getMessages = async (actor, thread, { before } = {}) => {
  const { townId, members } = await teamOf(actor);
  checkThread(thread, actor, members);
  const older = before && !Number.isNaN(new Date(before).getTime()) ? new Date(before) : null;
  const rows = await prisma.teamMessage.findMany({
    where: { ...threadWhere(townId, actor.id, thread), ...(older ? { createdAt: { lt: older } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: PAGE + 1,
    include: { sender: SENDER },
  });
  if (!older) {
    await prisma.teamChatRead.upsert({
      where: { userId_thread: { userId: actor.id, thread } },
      create: { userId: actor.id, thread, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
  }
  return { messages: rows.slice(0, PAGE).reverse().map(present), hasMore: rows.length > PAGE };
};

/** Sends a message to the team or to one admin, and lets them know. */
const send = async (actor, thread, { body } = {}) => {
  const { townId, members } = await teamOf(actor);
  checkThread(thread, actor, members);
  const text = cleanText(String(body || ''), { maxLength: MAX_BODY + 1 }) || '';
  if (!text.trim()) throw new ApiError('Write a message', 400);
  if (text.length > MAX_BODY) throw new ApiError(`A message can be at most ${MAX_BODY} characters`, 400);

  const message = await prisma.teamMessage.create({
    data: {
      municipalityId: townId, senderId: actor.id, recipientId: thread === TEAM ? null : thread, body: text.trim(),
    },
    include: { sender: SENDER },
  });
  // What you wrote is read.
  await prisma.teamChatRead.upsert({
    where: { userId_thread: { userId: actor.id, thread } },
    create: { userId: actor.id, thread, lastReadAt: message.createdAt },
    update: { lastReadAt: message.createdAt },
  });

  const to = thread === TEAM ? members.filter((m) => m.id !== actor.id).map((m) => m.id) : [thread];
  const preview = message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body;
  Promise.all(to.map((userId) => notificationService.createNotification({
    userId,
    type: 'ADMIN_MESSAGE',
    title: thread === TEAM ? `${actor.fullName || 'An admin'} in the team chat` : `Message from ${actor.fullName || 'an admin'}`,
    message: preview,
    relatedId: message.id,
    audience: 'ADMIN',
    // The reader opens the chat it belongs to on their side.
    target: { kind: 'admin-team', id: thread === TEAM ? TEAM : actor.id },
    sender: { name: actor.fullName || 'Admin', photo: message.sender.profilePhoto },
  }))).catch((err) => console.error('[teamChat] notify failed:', err.message));

  return present(message);
};

/** Unread team chat messages, for the admin sidebar badge (createdAt rows). */
const unreadRows = async (actor) => {
  if (actor.role !== 'MUNICIPAL_ADMIN' || !actor.municipalityId) return [];
  const members = await membersOf(actor.municipalityId);
  if (!members.some((m) => m.id === actor.id)) return [];
  const reads = await prisma.teamChatRead.findMany({ where: { userId: actor.id } });
  const readAt = Object.fromEntries(reads.map((r) => [r.thread, r.lastReadAt]));
  const threads = [TEAM, ...members.filter((m) => m.id !== actor.id).map((m) => m.id)];
  const lists = await Promise.all(threads.map((thread) => prisma.teamMessage.findMany({
    where: unreadWhere(actor.municipalityId, actor.id, thread, readAt[thread]),
    select: { createdAt: true },
    take: 100,
  })));
  return lists.flat();
};

module.exports = {
  listChats, getMessages, send, unreadRows, TEAM,
};
