// As the server's message.service UNSEND_WINDOW_MS (and web lib/unsend.js):
// a sender can take a chat message back for an hour after sending it.
export const UNSEND_WINDOW_MS = 60 * 60 * 1000;

/** Can the viewer still unsend this message? (Deal steps never.) */
export const canUnsend = (message, viewerId) => Boolean(
  message
  && viewerId
  && message.senderId === viewerId
  && !message.unsentAt
  && !message.offerId
  && Date.now() - new Date(message.createdAt).getTime() < UNSEND_WINDOW_MS,
);

/** Put the unsent copy in place of the message in a list. */
export const replaceMessage = (messages, updated) => (messages || [])
  .map((m) => (m.id === updated.id ? { ...m, ...updated } : m));

/** The placeholder line where an unsent message was. */
export const unsentLabel = (isSelf, name) => (isSelf
  ? 'You unsent a message'
  : `${name || 'They'} unsent a message`);
