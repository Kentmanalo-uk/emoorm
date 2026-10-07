import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';

/*
 * What the admin shell shows on every admin page: the newest notifications
 * and how many are unread (bell, sidebar, rail), the Messages and Feedback
 * badges, the work waiting beside each section, and the municipality's name
 * and logo.
 *
 * Every admin page draws its own AdminLayout, so each sidebar click used to
 * mount the shell again and ask for all of it again (about six requests a
 * click), with the badges blank until the answers came back. Kept in the
 * shared query cache instead, the next page shows the last answers at once
 * and asks again only for what is over half a minute old; the waiting counts
 * still refresh every minute while the page is in view. Whatever changes a
 * count asks for it again with useRefreshAdminShell. The cache is dropped
 * whenever the signed-in account changes (App.jsx).
 *
 * A failed read keeps the last answer (or none): a badge that is a little
 * late is far better than an error where the navigation should be, and the
 * next read comes soon enough, so failures are not retried here.
 */

const FRESH_MS = 30 * 1000;
const COUNTS = { staleTime: FRESH_MS, retry: false };

const shellKey = (kind, userId) => ['admin-shell', kind, userId];

/**
 * The work waiting on this admin (/moderation/attention), one item per queue,
 * each carrying the route it lives at. The shell's sidebar and the dashboard
 * read the same query, so the page asks once for both.
 * @returns {Object} React Query result; `data` is the list of items
 */
export function useAdminAttention() {
  const userId = useAuthStore((s) => s.user?.id);
  return useQuery({
    queryKey: shellKey('attention', userId),
    queryFn: async () => {
      const res = await axios.get('/moderation/attention');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: Boolean(userId),
    ...COUNTS,
    // Every minute while the page is in view (paused while it is hidden), and
    // once on coming back to it if the counts are old by then.
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/** The waiting counts keyed by the route they live at, for the sidebar's badges. */
export const waitingByLink = (items) => {
  const byLink = {};
  for (const item of Array.isArray(items) ? items : []) {
    if (!item?.link) continue;
    byLink[item.link] = {
      count: item.count || 0,
      severity: item.severity || 'low',
      label: item.label || '',
    };
  }
  return byLink;
};

/**
 * A municipal admin's own account, read again so the shell's municipality
 * name and logo (and the rest of the signed-in account) follow changes made
 * elsewhere. A fresh answer goes to the auth store, which the shell reads;
 * a cached one never does, as it could be older than what the store holds.
 * The store only changes when the answer differs: every page re-renders then.
 */
const readProfile = async () => {
  const profile = (await axios.get('/auth/profile')).data || null;
  const { user, updateUser } = useAuthStore.getState();
  // Signed out or someone else by now: not theirs to keep.
  if (profile && profile.id === user?.id && JSON.stringify(profile) !== JSON.stringify(user)) {
    updateUser(profile);
  }
  return profile;
};

/**
 * The shell's other reads. Only the super admin has Feedback; only a
 * municipal admin's profile carries a municipality to show.
 * @param {Boolean} isSuperAdmin
 * @returns {{ notifications: Array|null, unreadCount: Number, messageUnread: Number, feedbackNew: Number }}
 *   `notifications` is null until the first answer (the rail shows "Loading…").
 */
export function useAdminShellData(isSuperAdmin) {
  const userId = useAuthStore((s) => s.user?.id);
  const signedIn = Boolean(userId);

  // The newest notifications come with the unread count, so one request
  // serves the bell, the sidebar and the rail.
  const notifications = useQuery({
    queryKey: shellKey('notifications', userId),
    queryFn: async () => {
      const res = await axios.get('/notifications', { params: { audience: 'ADMIN', page: 1, pageSize: 6 } });
      return { rows: Array.isArray(res.data) ? res.data : [], unread: Number(res.unreadCount) || 0 };
    },
    enabled: signedIn,
    ...COUNTS,
  });
  const messages = useQuery({
    queryKey: shellKey('messages', userId),
    queryFn: async () => Number((await axios.get('/admin-messages/unread-count')).data?.count) || 0,
    enabled: signedIn,
    ...COUNTS,
  });
  const feedback = useQuery({
    queryKey: shellKey('feedback', userId),
    queryFn: async () => Number((await axios.get('/feedback/unread-count')).data?.count) || 0,
    enabled: signedIn && isSuperAdmin,
    ...COUNTS,
  });
  // Kept no longer than the counts even though it rarely changes: an admin
  // taken off the team (or a backup whose access ended) is a buyer again,
  // and the app learns it from here. Leaving Settings, where the
  // municipality's page and the admin's own profile change, asks at once
  // (AdminLayout).
  useQuery({
    queryKey: shellKey('profile', userId),
    queryFn: readProfile,
    enabled: signedIn && !isSuperAdmin,
    ...COUNTS,
  });

  return {
    notifications: notifications.data?.rows ?? (notifications.isError ? [] : null),
    unreadCount: notifications.data?.unread ?? 0,
    messageUnread: messages.data ?? 0,
    feedbackNew: feedback.data ?? 0,
  };
}

/**
 * Asks for one of the shell's reads again now, after something on the page
 * changed it: 'attention', 'notifications', 'messages', 'feedback' or
 * 'profile'. Whatever shows it (sidebar, dashboard, rail) updates together.
 * @returns {Function} (kind) => Promise
 */
export function useRefreshAdminShell() {
  const queryClient = useQueryClient();
  return useCallback(
    (kind) => queryClient.invalidateQueries({ queryKey: ['admin-shell', kind] }),
    [queryClient],
  );
}
