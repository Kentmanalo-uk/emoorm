// As the server's message.service UNSEND_WINDOW_MS (and web lib/unsend.js):
// a sender can take a chat message back for 5 hours after sending it.
// Unsent, it is gone for both sides, with nothing in its place.
export const UNSEND_WINDOW_MS = 5 * 60 * 60 * 1000;

/** Can the viewer still unsend this message? (Deal steps never.) */
export const canUnsend = (message, viewerId) => Boolean(
  message
  && viewerId
  && message.senderId === viewerId
  && !message.offerId
  && Date.now() - new Date(message.createdAt).getTime() < UNSEND_WINDOW_MS,
);

/** The list without that message. */
export const withoutMessage = (messages, messageId) => (messages || [])
  .filter((m) => m.id !== messageId);
