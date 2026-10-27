import { create } from 'zustand';
import axios from './axios';

/*
 * The unread counts the badges show, asked for in one place.
 *
 * The header, the chat bubble and the notification pop-ups each used to poll
 * the same counts on their own (and the chat bubble downloaded every chat
 * just to count the unread ones). Now NotificationWatcher asks every half
 * minute (and when the tab is looked at again), and everything else reads
 * from here:
 *
 *   notifications  { BUYER, SELLER, ADMIN }  unread per feed
 *   chats          chats with shops with a message not read yet
 *   shop           a seller's chats with their buyers, likewise
 *   support        help-desk cases with a reply not read yet
 */

// ready: the notification counts have been asked for since signing in.
const EMPTY = { notifications: { BUYER: 0, SELLER: 0, ADMIN: 0 }, chats: 0, shop: 0, support: 0, ready: false };

export const useUnreadCounts = create(() => ({ ...EMPTY }));

/** Signed out: every badge goes. */
export const clearUnreadCounts = () => useUnreadCounts.setState({ ...EMPTY });

/** The counts from GET /notifications/unread/count (no audience). */
export const setNotificationCounts = (byAudience) => {
  if (!byAudience) return;
  useUnreadCounts.setState({
    notifications: { BUYER: byAudience.BUYER || 0, SELLER: byAudience.SELLER || 0, ADMIN: byAudience.ADMIN || 0 },
    ready: true,
  });
};

/** One notification of `audience` was read here: its badge drops at once. */
export const countOneRead = (audience = 'BUYER') => {
  const { notifications } = useUnreadCounts.getState();
  useUnreadCounts.setState({
    notifications: { ...notifications, [audience]: Math.max(0, (notifications[audience] || 0) - 1) },
  });
};

/** A chat was opened and read here: 'store' (with a shop), 'shop' (a seller's, with a buyer) or 'support'. */
export const countChatRead = (kind = 'store') => {
  const key = { support: 'support', shop: 'shop' }[kind] || 'chats';
  useUnreadCounts.setState((s) => ({ [key]: Math.max(0, s[key] - 1) }));
};

// Callers that ask together share one request, and one asked a moment ago
// is not asked again.
let chatsInFlight = null;
let chatsAskedAt = 0;
const RECENT_MS = 2000;

/** Ask the server for the chat counts now (deduplicated). */
export const refreshChatCounts = () => {
  if (chatsInFlight) return chatsInFlight;
  if (Date.now() - chatsAskedAt < RECENT_MS) return Promise.resolve();
  chatsAskedAt = Date.now();
  chatsInFlight = axios.get('/messages/unread-count', { quiet: true })
    .then((res) => useUnreadCounts.setState({
      chats: res.data?.count ?? 0, shop: res.data?.shop ?? 0, support: res.data?.support ?? 0,
    }))
    .catch(() => { /* the next ask corrects it */ })
    .finally(() => { chatsInFlight = null; });
  return chatsInFlight;
};
