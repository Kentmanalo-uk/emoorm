import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { notificationHref } from '../lib/notificationLink';

/**
 * New notifications pop up while the site is open. Every half minute (and
 * when the tab is looked at again) it asks how many are unread; when that
 * went up, it fetches the newest and shows the new one as a banner
 * (AppToaster) with its picture: the product for an order, the sender for a
 * message, else its own icon; and it says "Moormy!". Tapping it opens where
 * it leads and marks it read.
 *
 * Nothing pops up for what was already there when the site opened, nor for
 * the page the person is already looking at. The bell and the sidebars
 * hear about it too ('emoorm:notifications'), to update their counts.
 */

const EVERY_MS = 30000;

const timeOf = (n) => new Date(n.createdAt).getTime() || 0;

const inboxFor = (n) => {
  if (n.audience === 'SELLER') return '/seller/notifications';
  if (n.audience === 'ADMIN') return '/admin/notifications';
  return '/notifications';
};

/** A message sent before senders were recorded: the name from its title. */
const senderOf = (n) => {
  if (n.data?.sender?.name) return n.data.sender;
  if (n.type !== 'STORE_MESSAGE') return null;
  const match = /^New message from (.+)$/.exec(n.title || '');
  return match ? { name: match[1], photo: null } : null;
};

const announce = () => window.dispatchEvent(new CustomEvent('emoorm:notifications'));

export default function NotificationWatcher() {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  // The page on screen, to leave out a pop-up for it.
  const here = useRef('');
  useEffect(() => {
    here.current = `${location.pathname}${location.search}`;
  }, [location.pathname, location.search]);
  const userId = isAuthenticated ? user?.id : null;

  useEffect(() => {
    if (!userId) return undefined;
    let stopped = false;
    let lastCount = null;
    let newest = null;
    const seen = new Set();

    // `look`: fetch the newest even if the count did not grow. After a read
    // (here, the bell, a page) the count drops, so one arriving meanwhile
    // would leave it level and go unnoticed.
    const check = async (look = false) => {
      if (stopped || document.visibilityState === 'hidden') return;
      try {
        const countRes = await axios.get('/notifications/unread/count');
        const count = countRes.data?.count ?? 0;
        const first = newest === null;
        const grew = lastCount !== null && count > lastCount;
        lastCount = count;
        if (!first && !grew && !look) return;

        const listRes = await axios.get('/notifications', { params: { page: 1, pageSize: 5 } });
        if (stopped) return;
        const list = Array.isArray(listRes.data) ? listRes.data : [];
        const fresh = first
          ? []
          : list.filter((n) => !n.isRead && !seen.has(n.id) && timeOf(n) > newest);
        list.forEach((n) => seen.add(n.id));
        newest = Math.max(newest ?? 0, ...list.map(timeOf));
        if (fresh.length === 0) return;

        announce();
        fresh.sort((a, b) => timeOf(b) - timeOf(a));
        const n = fresh[0];
        const href = notificationHref(n) || inboxFor(n);
        if (href === here.current) return;
        // A plain toast carrying the notification: AppToaster draws it
        // (toast.custom would skip AppToaster and show only the title).
        toast(n.title, {
          id: `notification-${n.id}`,
          duration: 6500,
          notification: {
            type: n.type,
            title: n.title,
            message: n.message,
            sender: senderOf(n),
            picture: n.picture || null,
            href,
            more: fresh.length - 1,
            onOpen: () => {
              axios.put(`/notifications/${n.id}/read`).then(announce).catch(() => {
                // The next check corrects the counts.
              });
            },
          },
        });
      } catch {
        // Offline or signed out meanwhile: the next check tries again.
      }
    };

    check();
    const timer = window.setInterval(() => check(), EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    // Something was read or changed somewhere on the site.
    const onChanged = () => check(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('emoorm:notifications', onChanged);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('emoorm:notifications', onChanged);
    };
  }, [userId]);

  return null;
}
