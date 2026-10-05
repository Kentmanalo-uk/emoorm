import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  BellSlashIcon, ChatCircleDotsIcon, CheckCircleIcon, ChecksIcon, InfoIcon, MagnifyingGlassIcon, PackageIcon,
  QuestionIcon, ScalesIcon, ShoppingBagIcon, StarIcon, StorefrontIcon, TagIcon, TrashIcon, WarningCircleIcon, XCircleIcon,
  XIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { toast } from '../../src/lib/toast';
import { getCachedData, setCachedData } from '../../src/lib/dataCache';
import { notificationHref } from '../../src/lib/notificationLink';
import useAuthStore from '../../src/store/authStore';
import { font, t } from '../../src/theme';
import EmptyState from '../../src/components/EmptyState';
import ShellBarButton from '../../src/components/ShellBarButton';
import ShellPageMenu from '../../src/components/ShellPageMenu';
import CartConfirmDialog from '../../src/components/cart/CartConfirmDialog';
import InboxPageHead, { InboxTopGap } from '../../src/components/inbox/InboxPageHead';
import InboxLoginGate from '../../src/components/inbox/InboxLoginGate';
import NotificationPicture from '../../src/components/inbox/NotificationPicture';
import { NotificationListSkeleton } from '../../src/components/inbox/InboxSkeletons';
import { timeAgo } from '../../src/components/inbox/inboxFormat';

/*
 * The buyer's Notifications tab (web/src/pages/Notifications.jsx with its
 * phone CSS): the title bar with the unread count, search and ⋯, the
 * All / Unread pills, then one row per notification (its picture or the
 * kind's gradient icon, the title with the unread dot, the message, the
 * time, and Mark read / Delete at the right). A row opens what it is about
 * (lib/notificationLink); an announcement opens in full at /notification/:id.
 */

const AUDIENCE = 'BUYER';
const CACHE_KEY = `notifications:${AUDIENCE}`;

// web TYPE_CONFIG: the kind's icon and colour.
const C = {
  info: t.info[500], green: t.primary[600], greenLight: t.primary[500], orange: t.orange[500],
  danger: t.danger[500], warning: t.warning[500], neutral: t.neutral[500],
};
const TYPE_CONFIG = {
  ORDER_RECEIVED: { Icon: ShoppingBagIcon, color: C.info },
  ORDER_CONFIRMED: { Icon: CheckCircleIcon, color: C.green },
  ORDER_READY: { Icon: PackageIcon, color: C.orange },
  ORDER_COMPLETED: { Icon: CheckCircleIcon, color: C.green },
  ORDER_CANCELLED: { Icon: XCircleIcon, color: C.danger },
  PRODUCT_APPROVED: { Icon: StarIcon, color: C.warning },
  PRODUCT_SUSPENDED: { Icon: WarningCircleIcon, color: C.danger },
  SELLER_APPROVED: { Icon: StarIcon, color: C.green },
  SELLER_SUSPENDED: { Icon: XCircleIcon, color: C.danger },
  REPORT_SUBMITTED: { Icon: WarningCircleIcon, color: C.warning },
  REPORT_RESOLVED: { Icon: CheckCircleIcon, color: C.green },
  SUPPORT_MESSAGE: { Icon: ChatCircleDotsIcon, color: C.green },
  SUPPORT_RESOLVED: { Icon: CheckCircleIcon, color: C.green },
  STORE_MESSAGE: { Icon: ChatCircleDotsIcon, color: C.info },
  ADMIN_MESSAGE: { Icon: ChatCircleDotsIcon, color: C.info },
  SYSTEM_ANNOUNCEMENT: { Icon: InfoIcon, color: C.neutral },
  STORE_NEW_PRODUCT: { Icon: ShoppingBagIcon, color: C.info },
  STORE_PROMOTION: { Icon: StarIcon, color: C.warning },
  STORE_ANNOUNCEMENT: { Icon: InfoIcon, color: C.neutral },
  RETURN_REQUESTED: { Icon: WarningCircleIcon, color: C.warning },
  RETURN_APPROVED: { Icon: CheckCircleIcon, color: C.green },
  RETURN_REJECTED: { Icon: XCircleIcon, color: C.danger },
  RETURN_AWAITING_SHIPMENT: { Icon: PackageIcon, color: C.orange },
  RETURN_RECEIVED: { Icon: PackageIcon, color: C.info },
  RETURN_REFUNDED: { Icon: CheckCircleIcon, color: C.green },
  RETURN_CANCELLED: { Icon: XCircleIcon, color: C.neutral },
  RETURN_CLOSED: { Icon: CheckCircleIcon, color: C.neutral },
  SELLER_APPLICATION_SUBMITTED: { Icon: InfoIcon, color: C.info },
  ADMIN_ALERT: { Icon: WarningCircleIcon, color: C.danger },
  LOW_STOCK: { Icon: WarningCircleIcon, color: C.warning },
  PRICE_DROP: { Icon: TagIcon, color: C.greenLight },
  PRODUCT_QUESTION: { Icon: QuestionIcon, color: C.info },
  PRODUCT_ANSWER: { Icon: ChatCircleDotsIcon, color: C.greenLight },
  RETURN_DISPUTED: { Icon: ScalesIcon, color: C.danger },
  RETURN_DISPUTE_RESOLVED: { Icon: ScalesIcon, color: C.info },
  DEFAULT: { Icon: InfoIcon, color: C.neutral },
};
const getConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG.DEFAULT;

/** Phones: the gradient (ToolGradients) a kind's icon is filled with, from its colour. */
const GRADIENT_OF = {
  [C.green]: 'green', [C.greenLight]: 'green', [C.info]: 'blue', [C.orange]: 'orange',
  [C.danger]: 'rose', [C.warning]: 'amber', [C.neutral]: 'slate',
};

export default function Notifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <InboxLoginGate page="notifications" />;
  return <NotificationList />;
}

function NotificationList() {
  const router = useRouter();
  // The first view ("All", page 1) as it showed last time: shown at once
  // while it is asked for again.
  const [saved] = useState(() => getCachedData(CACHE_KEY));
  const [notifications, setNotifications] = useState(() => saved?.items || []);
  const [unreadCount, setUnreadCount] = useState(() => saved?.unreadCount ?? 0);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [filter, setFilter] = useState('all'); // all | unread
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(() => saved?.pagination || { totalPages: 0, total: 0 });
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const firstViewFresh = useRef(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchText.trim();
      if (next === search) return;
      setSearch(next);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchText, search]);

  const openSearch = () => setSearchOpen(true);
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchText('');
  };

  const fetchNotifications = useCallback(async () => {
    const firstView = filter === 'all' && page === 1 && !search;
    const kept = firstView ? getCachedData(CACHE_KEY) : undefined;
    firstViewFresh.current = false;
    if (kept) {
      setNotifications(kept.items || []);
      setUnreadCount(kept.unreadCount ?? 0);
      if (kept.pagination) setPagination(kept.pagination);
    } else {
      setIsLoading(true);
    }
    try {
      const params = { page, pageSize: 20, audience: AUDIENCE };
      if (filter === 'unread') params.isRead = false;
      if (search) params.search = search;
      const res = await apiClient.get('/notifications', { params });
      setNotifications(res.data || []);
      setUnreadCount(res.unreadCount ?? 0);
      if (res.pagination) setPagination(res.pagination);
      firstViewFresh.current = firstView;
    } catch (err) {
      console.error(err);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [filter, page, search]);

  // Asked again on each visit to the tab, and when the view changes.
  useFocusEffect(useCallback(() => { fetchNotifications(); }, [fetchNotifications]));

  // Marked read, deleted…: the saved first view follows what is shown.
  useEffect(() => {
    if (!firstViewFresh.current || isLoading) return;
    setCachedData(CACHE_KEY, { items: notifications, unreadCount, pagination });
  }, [isLoading, notifications, unreadCount, pagination]);

  const handleMarkRead = async (notif) => {
    if (notif.isRead) return;
    try {
      await apiClient.put(`/notifications/${notif.id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  // The API resolves each notification to a destination (an order, a return,
  // a conversation, the announcement itself). Anything without one stays put.
  const openNotification = (notif) => {
    handleMarkRead(notif);
    const href = notificationHref(notif);
    if (href) router.push(href);
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.put('/notifications/read-all', null, { params: { audience: AUDIENCE } });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification deleted');
    } catch {
      toast.error('Failed to delete notification');
    }
  };

  const handleDeleteAll = async () => {
    setConfirmClear(false);
    try {
      await apiClient.delete('/notifications', { params: { audience: AUDIENCE } });
      setNotifications([]);
      setUnreadCount(0);
      toast.success('All notifications deleted');
    } catch {
      toast.error('Failed to delete notifications');
    }
  };

  const changeFilter = (next) => {
    setFilter(next);
    setPage(1);
  };

  const changePage = (next) => {
    setPage(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const menuItems = [
    unreadCount > 0 && { key: 'read', Icon: ChecksIcon, label: 'Mark all as read', onPress: handleMarkAllRead },
    { key: 'shops', Icon: StorefrontIcon, label: 'Manage shop alerts', to: '/followed-stores' },
    notifications.length > 0 && { key: 'clear', Icon: TrashIcon, label: 'Clear all', danger: true, onPress: () => setConfirmClear(true) },
  ].filter(Boolean);

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[1]}
        keyboardShouldPersistTaps="handled"
      >
        <InboxTopGap />
        <InboxPageHead
          title="Notifications"
          padLeft={12}
          padRight={8}
          style={styles.head}
          badge={unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText} numberOfLines={1}>{unreadCount} unread</Text>
            </View>
          ) : null}
        >
          <ShellBarButton
            label={searchOpen ? 'Close search' : 'Search notifications'}
            onPress={() => (searchOpen ? closeSearch() : openSearch())}
            accessibilityState={{ expanded: searchOpen }}
          >
            {searchOpen
              ? <XIcon size={19} weight="bold" color={t.primary[700]} />
              : <MagnifyingGlassIcon size={19} color={t.neutral[700]} />}
          </ShellBarButton>
          <ShellPageMenu label="Notification options" items={menuItems} />
        </InboxPageHead>

        <View style={styles.body}>
          {searchOpen ? (
            <View style={styles.search}>
              <MagnifyingGlassIcon size={16} color={t.neutral[500]} />
              <TextInput
                autoFocus
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search notifications"
                placeholderTextColor={t.neutral[400]}
                accessibilityLabel="Search notifications"
                returnKeyType="search"
                style={styles.searchInput}
                underlineColorAndroid="transparent"
              />
              {searchText ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchText('')} style={styles.searchClear}>
                  <XIcon size={13} weight="bold" color={t.neutral[0]} />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          <View style={styles.filters}>
            {[['all', 'All'], ['unread', 'Unread']].map(([key, label]) => {
              const active = filter === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => changeFilter(key)}
                  style={[styles.filterBtn, active && styles.filterBtnActive]}
                >
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
                  {key === 'unread' && unreadCount > 0 ? (
                    <View style={[styles.filterCount, active && styles.filterCountActive]}>
                      <Text style={[styles.filterCountText, active && styles.filterCountTextActive]}>{unreadCount}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {isLoading ? (
            <NotificationListSkeleton />
          ) : notifications.length === 0 ? (
            <EmptyState
              art="notifications"
              icon={BellSlashIcon}
              flat
              style={styles.empty}
              title={search
                ? `No notifications match “${search}”`
                : filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              text={search
                ? 'Try another word, or clear the search.'
                : filter === 'unread'
                  ? "You're all caught up."
                  : 'Order updates and alerts from shops you follow will show up here.'}
              actions={search
                ? [{ label: 'Clear search', onPress: closeSearch, variant: 'outline' }]
                : filter === 'unread'
                  ? [{ label: 'View all notifications', onPress: () => changeFilter('all'), variant: 'outline' }]
                  : [{ label: 'Browse stores', onPress: () => router.push('/stores'), icon: StorefrontIcon }]}
            />
          ) : (
            <View style={styles.list}>
              {notifications.map((notif, i) => (
                <NotificationRow
                  key={notif.id}
                  notif={notif}
                  first={i === 0}
                  onOpen={() => openNotification(notif)}
                  onMarkRead={() => handleMarkRead(notif)}
                  onDelete={() => handleDelete(notif.id)}
                />
              ))}
            </View>
          )}

          {pagination.totalPages > 1 ? (
            <View style={styles.pagination}>
              <Pressable
                accessibilityRole="button"
                disabled={page <= 1}
                onPress={() => changePage(page - 1)}
                style={[styles.pageBtn, page <= 1 && styles.pageBtnOff]}
              >
                <Text style={styles.pageBtnText}>← Prev</Text>
              </Pressable>
              <Text style={styles.pageText}>Page {page} of {pagination.totalPages}</Text>
              <Pressable
                accessibilityRole="button"
                disabled={page >= pagination.totalPages}
                onPress={() => changePage(page + 1)}
                style={[styles.pageBtn, page >= pagination.totalPages && styles.pageBtnOff]}
              >
                <Text style={styles.pageBtnText}>Next →</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <CartConfirmDialog
        open={confirmClear}
        title="Delete all notifications?"
        confirmLabel="Delete all"
        danger
        onConfirm={handleDeleteAll}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

function NotificationRow({ notif, first, onOpen, onMarkRead, onDelete }) {
  const cfg = getConfig(notif.type);
  const href = notificationHref(notif);
  const unread = !notif.isRead;
  return (
    <Pressable
      accessibilityRole={href ? 'link' : undefined}
      onPress={onOpen}
      style={({ pressed }) => [styles.item, !first && styles.itemLine, pressed && styles.itemPressed]}
    >
      {/* The product (orders, returns), the person (messages) or the shop,
          with a small badge; or the kind's own icon. */}
      <NotificationPicture picture={notif.picture} Icon={cfg.Icon} color={cfg.color} gradient={GRADIENT_OF[cfg.color]} size={44} />

      <View style={styles.itemContent}>
        {notif.title ? (
          <Text style={styles.heading}>
            {notif.title}
            {unread ? <View style={styles.dotInline} /> : null}
          </Text>
        ) : unread ? <View style={styles.dot} /> : null}
        <Text style={[styles.message, unread && styles.messageUnread]}>{notif.message}</Text>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{timeAgo(notif.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {unread ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mark as read" onPress={onMarkRead} style={({ pressed }) => [styles.actionBtn, pressed && styles.readPressed]}>
            <ChecksIcon size={14} color={t.neutral[500]} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={onDelete} style={({ pressed }) => [styles.actionBtn, pressed && styles.delPressed]}>
          {({ pressed }) => <TrashIcon size={14} color={pressed ? t.danger[700] : t.neutral[500]} />}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1, paddingBottom: 24 },
  head: { height: 48 },
  unreadBadge: { flexShrink: 0, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.secondary[50] },
  unreadBadgeText: { fontSize: 12, lineHeight: 19.2, color: t.primary[700], ...font(500) },
  body: { paddingTop: 8, paddingHorizontal: 12 },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, marginBottom: 12, paddingHorizontal: 12,
    borderWidth: 1.5, borderColor: t.primary[500], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  searchInput: {
    flex: 1, minWidth: 0, height: 40, padding: 0, fontSize: 16, color: t.neutral[900], ...font(400), outlineStyle: 'none',
  },
  searchClear: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[300] },

  filters: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 16, borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  filterBtnActive: { backgroundColor: t.primary[600] },
  filterText: { fontSize: 13, lineHeight: 15.6, color: t.neutral[600], ...font(500) },
  filterTextActive: { color: t.neutral[0] },
  filterCount: { paddingVertical: 1, paddingHorizontal: 6, borderRadius: 999, backgroundColor: t.accent[500] },
  filterCountActive: { backgroundColor: t.neutral[0] },
  filterCountText: { fontSize: 11, lineHeight: 13.2, color: t.neutral[0], ...font(500) },
  filterCountTextActive: { color: t.primary[700] },

  list: { borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[0] },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 14, paddingRight: 14, paddingBottom: 14, paddingLeft: 12,
    backgroundColor: t.neutral[0],
  },
  itemLine: { borderTopWidth: 1, borderTopColor: t.neutral[150] },
  itemPressed: { backgroundColor: t.neutral[50] },
  itemContent: { flex: 1, minWidth: 0 },
  heading: { marginBottom: 2, fontSize: 14, lineHeight: 19.6, color: t.neutral[900], ...font(500) },
  dotInline: { width: 7, height: 7, marginLeft: 7, marginBottom: 2, borderRadius: 3.5, backgroundColor: t.primary[600] },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.primary[600] },
  message: { marginBottom: 4, fontSize: 14, lineHeight: 20.3, color: t.neutral[600], ...font(400) },
  messageUnread: { color: t.neutral[900], ...font(500) },
  // The website's time is an inline span on an 18.4px line, 4px under the message.
  timeRow: { height: 24, paddingTop: 5.7 },
  time: { fontSize: 11.5, lineHeight: 15, color: t.neutral[500], ...font(400) },
  actions: { flexShrink: 0, gap: 4, marginVertical: -6 },
  actionBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  readPressed: { backgroundColor: t.primary[100] },
  delPressed: { backgroundColor: t.danger[50] },

  empty: { marginHorizontal: -12 },

  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 },
  pageBtn: {
    minHeight: 40, paddingVertical: 8, paddingHorizontal: 16, justifyContent: 'center', borderWidth: 1, borderColor: t.neutral[300],
    borderRadius: 10, backgroundColor: t.neutral[0],
  },
  pageBtnOff: { opacity: 0.4 },
  pageBtnText: { fontSize: 14, lineHeight: 16.8, color: t.neutral[700], ...font(400) },
  pageText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
});
