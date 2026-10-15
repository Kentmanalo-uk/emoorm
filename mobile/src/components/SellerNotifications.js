import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ChatCircleDotsIcon, CheckCircleIcon, ChecksIcon, HandshakeIcon, InfoIcon, PackageIcon, QuestionIcon, ScalesIcon,
  ShoppingBagIcon, StarIcon, TagIcon, TrashIcon, WarningCircleIcon, XCircleIcon,
} from 'phosphor-react-native';
import apiClient from '../api/client';
import { toast } from '../lib/toast';
import { getCachedData, setCachedData } from '../lib/dataCache';
import { notificationHref } from '../lib/notificationLink';
import { font, t } from '../theme';
import EmptyState from './EmptyState';
import LoadingSkeleton from './LoadingSkeleton';
import ShellPageMenu from './ShellPageMenu';
import NotificationPicture from './inbox/NotificationPicture';
import NotificationCategories, { NOTIFICATION_CATEGORIES, minusOne } from './inbox/NotificationCategories';
import { useNotificationPeek } from './peek/NotificationPeek';
import { timeAgo } from './inbox/inboxFormat';
import OrderConfirmDialog from './orders/OrderConfirmDialog';
import { SellerPrivateLine, sellerPageStyles } from './seller/SellerPage';
import { PageLoader } from './BrandLoader';

/*
 * The Seller Center's notifications on phones: web/src/pages/Notifications.jsx
 * with mode="SELLER" bare shell="seller" (its phone branch) and the base
 * Notifications.css it falls back to inside the Seller Center. The bar above
 * names the page (SellerBackBar), so the page starts with the All / Unread
 * chips (and ⋯ with Mark all as read / Clear all at their end), then one
 * row per notification: its picture (the product, the shop or the person,
 * with a small badge in the kind's colour) or the kind's gradient icon on a
 * grey tile, the title with the unread dot, the message and the time. A row
 * opens what it is about (lib/notificationLink); an announcement opens in
 * full at /notification/:id.
 *
 * onUnreadChange: called after something changes the unread count (the
 * shell refreshes the bell's count).
 */

const AUDIENCE = 'SELLER';
const CACHE_KEY = `notifications:${AUDIENCE}`;

// web TYPE_CONFIG: the kind's icon and colour.
const C = {
  info: t.info[500], green: t.primary[600], greenLight: t.primary[500], success: t.success[600], orange: t.orange[500],
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
  PRICE_OFFER: { Icon: HandshakeIcon, color: C.success },
  PRODUCT_ANSWER: { Icon: ChatCircleDotsIcon, color: C.greenLight },
  RETURN_DISPUTED: { Icon: ScalesIcon, color: C.danger },
  RETURN_DISPUTE_RESOLVED: { Icon: ScalesIcon, color: C.info },
  DEFAULT: { Icon: InfoIcon, color: C.neutral },
};
const getConfig = (type) => TYPE_CONFIG[type] || TYPE_CONFIG.DEFAULT;

/**
 * Phones: the gradient (ToolGradients) a kind's icon is filled with, from its
 * colour (web gradientOf: primary → green, info → blue, …; the offer's
 * success colour has no gradient of its own, so it is slate there too).
 */
const GRADIENT_OF = {
  [C.green]: 'green', [C.greenLight]: 'green', [C.info]: 'blue', [C.orange]: 'orange',
  [C.danger]: 'rose', [C.warning]: 'amber', [C.neutral]: 'slate', [C.success]: 'slate',
};

export default function SellerNotifications({ onUnreadChange }) {
  const router = useRouter();
  // The first view ("All", page 1) as it showed last time: shown at once
  // while it is asked for again.
  const [saved] = useState(() => getCachedData(CACHE_KEY));
  const [notifications, setNotifications] = useState(() => saved?.items || []);
  const [unreadCount, setUnreadCount] = useState(() => saved?.unreadCount ?? 0);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all'); // all | unread
  // One group (chats | orders | alerts | promos), or null for all of them.
  const [category, setCategory] = useState(null);
  const [unreadByCategory, setUnreadByCategory] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(() => saved?.pagination || { totalPages: 0, total: 0 });
  const [confirmClear, setConfirmClear] = useState(false);
  const firstViewFresh = useRef(false);
  const scrollRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    const firstView = filter === 'all' && page === 1 && !category;
    const kept = firstView ? getCachedData(CACHE_KEY) : undefined;
    firstViewFresh.current = false;
    if (kept) {
      setNotifications(kept.items || []);
      setUnreadCount(kept.unreadCount ?? 0);
      if (kept.unreadByCategory) setUnreadByCategory(kept.unreadByCategory);
      if (kept.pagination) setPagination(kept.pagination);
    } else {
      setIsLoading(true);
    }
    try {
      const params = { page, pageSize: 20, audience: AUDIENCE };
      if (filter === 'unread') params.isRead = false;
      if (category) params.category = category;
      const res = await apiClient.get('/notifications', { params });
      setNotifications(res.data || []);
      setUnreadCount(res.unreadCount ?? 0);
      if (res.unreadByCategory) setUnreadByCategory(res.unreadByCategory);
      if (res.pagination) setPagination(res.pagination);
      firstViewFresh.current = firstView;
    } catch (err) {
      console.error(err);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [filter, page, category]);

  // Asked again on each visit, and when the view changes.
  useFocusEffect(useCallback(() => { fetchNotifications(); }, [fetchNotifications]));

  // Marked read, deleted…: the saved first view follows what is shown.
  useEffect(() => {
    if (!firstViewFresh.current || isLoading) return;
    setCachedData(CACHE_KEY, { items: notifications, unreadCount, unreadByCategory, pagination });
  }, [isLoading, notifications, unreadCount, unreadByCategory, pagination]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchNotifications();
      onUnreadChange?.();
    } finally {
      setRefreshing(false);
    }
  };

  const handleMarkRead = async (notif) => {
    if (notif.isRead) return;
    try {
      await apiClient.put(`/notifications/${notif.id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      setUnreadByCategory((counts) => minusOne(counts, notif.type));
      onUnreadChange?.();
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
      setUnreadByCategory({});
      onUnreadChange?.();
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      onUnreadChange?.();
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
      setUnreadByCategory({});
      onUnreadChange?.();
      toast.success('All notifications deleted');
    } catch {
      toast.error('Failed to delete notifications');
    }
  };

  const changeCategory = (next) => {
    setCategory(next);
    setPage(1);
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
    notifications.length > 0 && { key: 'clear', Icon: TrashIcon, label: 'Clear all', danger: true, onPress: () => setConfirmClear(true) },
  ].filter(Boolean);

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        ref={scrollRef}
        style={styles.screen}
        contentContainerStyle={[sellerPageStyles.content, styles.content]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />}
      >
        <SellerPrivateLine />

        <NotificationCategories value={category} onChange={changeCategory} unread={unreadByCategory} />

        {/* The All / Unread chips, with ⋯ at their end while there is something to act on. */}
        <View style={styles.filters}>
          {[['all', 'All'], ['unread', 'Unread']].map(([key, label]) => {
            const active = filter === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => changeFilter(key)}
                style={({ pressed }) => [styles.filterBtn, pressed && !active && styles.filterBtnPressed, active && styles.filterBtnActive]}
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
          {menuItems.length ? (
            <View style={styles.more}>
              <ShellPageMenu label="Notification options" items={menuItems} />
            </View>
          ) : null}
        </View>

        {isLoading ? (
          <PageLoader label="Loading notifications" />
        ) : notifications.length === 0 ? (
          <EmptyState
            page
            art="notifications"
            title={category
              ? `No ${filter === 'unread' ? 'unread ' : ''}${NOTIFICATION_CATEGORIES.find((c) => c.key === category).label.toLowerCase()} notifications`
              : filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            text="You'll see order updates and important alerts here."
            actions={filter === 'unread' ? [{ label: 'View all notifications', onPress: () => changeFilter('all'), variant: 'outline' }] : []}
          />
        ) : (
          <View style={styles.list}>
            {notifications.map((notif) => (
              <NotificationRow
                key={notif.id}
                notif={notif}
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
      </ScrollView>

      <OrderConfirmDialog
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

function NotificationRow({ notif, onOpen, onMarkRead, onDelete }) {
  const cfg = getConfig(notif.type);
  const href = notificationHref(notif);
  const unread = !notif.isRead;
  // Held: the whole notification, bigger, with Open, Mark as read and Delete.
  const peek = useNotificationPeek()(notif, {
    art: <NotificationPicture picture={notif.picture} Icon={cfg.Icon} color={cfg.color} gradient={GRADIENT_OF[cfg.color]} size={64} />,
    time: timeAgo(notif.createdAt),
    onOpen: href ? onOpen : undefined,
    onMarkRead,
    onDelete,
  });
  return (
    <Pressable
      accessibilityRole={href ? 'link' : undefined}
      onPress={onOpen}
      {...peek}
      style={({ pressed }) => [styles.item, unread && styles.itemUnread, pressed && (unread ? styles.itemUnreadPressed : styles.itemPressed)]}
    >
      {/* The product (orders, returns), the person (messages) or the shop,
          with a small badge; or the kind's own icon. */}
      <NotificationPicture picture={notif.picture} Icon={cfg.Icon} color={cfg.color} gradient={GRADIENT_OF[cfg.color]} size={44} />

      <View style={styles.itemContent}>
        {/* Phones: no kind label above the title (the icon says it); the
            unread dot follows the title instead. */}
        {notif.title ? (
          <Text style={styles.heading}>
            {notif.title}
            {unread ? <View style={[styles.dot, styles.dotInline]} /> : null}
          </Text>
        ) : unread ? <View style={[styles.dot, styles.dotAlone]} /> : null}
        {notif.message ? <Text style={styles.message}>{notif.message}</Text> : null}
        <Text style={styles.time}>{timeAgo(notif.createdAt)}</Text>
      </View>

      {/* Mark read and Delete: the website shows them on hover; a phone has
          none, so they stay in view (quiet grey) to keep both reachable. */}
      <View style={styles.actions}>
        {unread ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Mark as read" onPress={onMarkRead} hitSlop={6} style={({ pressed }) => [styles.actionBtn, pressed && styles.readPressed]}>
            <ChecksIcon size={14} color={t.primary[600]} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Delete" onPress={onDelete} hitSlop={6} style={({ pressed }) => [styles.actionBtn, pressed && styles.delPressed]}>
          {({ pressed }) => <TrashIcon size={14} color={pressed ? t.danger[500] : t.neutral[500]} />}
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1, paddingBottom: 24 },

  // .notif-filters: a row of quiet tabs over a hairline.
  filters: {
    flexDirection: 'row', gap: 8, marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 16, borderRadius: 6,
  },
  filterBtnPressed: { backgroundColor: t.neutral[100] },
  filterBtnActive: { backgroundColor: t.primary[100] },
  filterText: { fontSize: 14, lineHeight: 17, color: t.neutral[500], ...font(400) },
  filterTextActive: { color: t.primary[600], ...font(600) },
  filterCount: { paddingVertical: 1, paddingHorizontal: 6, borderRadius: 999, backgroundColor: t.accent[500] },
  filterCountActive: { backgroundColor: t.neutral[0] },
  filterCountText: { fontSize: 11, lineHeight: 13.2, color: t.neutral[0], ...font(700) },
  filterCountTextActive: { color: t.accent[800] },
  more: { marginLeft: 'auto' },

  loading: { gap: 10 },

  // .notif-list / .notif-item
  list: { gap: 2 },
  item: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16, borderRadius: 8, backgroundColor: t.neutral[0],
  },
  itemUnread: { backgroundColor: t.success[50] },
  itemPressed: { backgroundColor: t.neutral[50] },
  itemUnreadPressed: { backgroundColor: t.primary[50] },
  itemContent: { flex: 1, minWidth: 0 },
  heading: { marginBottom: 2, fontSize: 14, lineHeight: 19.6, color: t.neutral[900], ...font(600) },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: t.primary[600] },
  dotInline: { marginLeft: 7, marginBottom: 2 },
  dotAlone: { marginBottom: 4 },
  message: { marginBottom: 6, fontSize: 14, lineHeight: 21, color: t.neutral[700], ...font(400) },
  // The time sits on the message's 22.4px line (a span inside .notif-content).
  time: { fontSize: 12, lineHeight: 22.4, color: t.neutral[500], ...font(400) },
  actions: { flexDirection: 'row', flexShrink: 0, gap: 4 },
  actionBtn: { width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  readPressed: { backgroundColor: t.primary[100] },
  delPressed: { backgroundColor: t.danger[100] },

  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 32 },
  pageBtn: {
    paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 6, backgroundColor: t.neutral[0],
  },
  pageBtnOff: { opacity: 0.4 },
  pageBtnText: { fontSize: 14, lineHeight: 17, color: t.neutral[700], ...font(400) },
  pageText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },
});
