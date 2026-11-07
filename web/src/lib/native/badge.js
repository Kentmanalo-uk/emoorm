import useAuthStore from '../../store/authStore';
import { useUnreadCounts } from '../unreadCounts';

/*
 * The number on the app's icon: what is waiting unread, as a phone app shows
 * it. iPhone home-screen apps (iOS 16.4+, once notifications are allowed),
 * and Chrome / Edge on an installed app; anywhere else this does nothing.
 *
 * It reads the counts the badges in the site already use (lib/unreadCounts,
 * asked for by NotificationWatcher), so nothing more is asked of the server:
 * every notification feed plus every chat with something not read yet.
 * The service worker sets the same number when a push arrives with the site
 * closed (public/sw.js, from the server's `badge` in the push).
 *
 * Starts itself when imported (once); never throws.
 */

const canBadge = () => typeof navigator !== 'undefined'
  && typeof navigator.setAppBadge === 'function';

/** The icon's number from the counts in lib/unreadCounts. */
export const badgeTotal = (s) => {
  const n = s?.notifications || {};
  const sum = (n.BUYER || 0) + (n.SELLER || 0) + (n.ADMIN || 0)
    + (s?.chats || 0) + (s?.shop || 0) + (s?.support || 0);
  return Number.isFinite(sum) && sum > 0 ? Math.floor(sum) : 0;
};

let shown = null;

const show = (count) => {
  if (count === shown || !canBadge()) return;
  shown = count;
  try {
    const done = count > 0
      ? navigator.setAppBadge(count)
      : (typeof navigator.clearAppBadge === 'function' ? navigator.clearAppBadge() : navigator.setAppBadge(0));
    // Refused (no permission yet, not installed): try again on the next change.
    Promise.resolve(done).catch(() => { shown = null; });
  } catch {
    shown = null;
  }
};

const update = () => {
  if (!useAuthStore.getState().isAuthenticated) {
    show(0);
    return;
  }
  const counts = useUnreadCounts.getState();
  // Until the counts arrive after opening, the number a push left stays.
  if (!counts.ready) return;
  show(badgeTotal(counts));
};

let started = false;

export function startAppBadge() {
  if (started || !canBadge()) return;
  started = true;
  try {
    useUnreadCounts.subscribe(update);
    useAuthStore.subscribe((state, previous) => {
      if (state.isAuthenticated !== previous.isAuthenticated) update();
    });
    // A push may have changed the number while the app was away: the next
    // counts (asked for when it is looked at again) are written over it.
    document.addEventListener('visibilitychange', () => { shown = null; });
    update();
  } catch {
    /* no badge, nothing else changes */
  }
}

startAppBadge();
