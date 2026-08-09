import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  Bell, CheckCheck, Trash2, Package, ShoppingBag,
  CheckCircle, XCircle, Star, AlertCircle, Info,
} from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { toast } from '../../src/lib/toast';
import EmptyState from '../../src/components/EmptyState';
import useAuthStore from '../../src/store/authStore';
import { ListSkeleton } from '../../src/components/SkeletonLayouts';
import { getCacheEntry, setCachedData } from '../../src/lib/dataCache';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

const NOTIFICATIONS_CACHE_KEY = 'notifications:list';

// Mirrors web/src/pages/Notifications.jsx's TYPE_CONFIG — keep icon/color mapping in sync.
// Uses the type color only as a small icon accent (no full-color backgrounds/alerts).
const TYPE_CONFIG = {
  ORDER_RECEIVED: { Icon: ShoppingBag, color: '#3b82f6' },
  ORDER_CONFIRMED: { Icon: CheckCircle, color: '#059669' },
  ORDER_READY: { Icon: Package, color: '#f97316' },
  ORDER_COMPLETED: { Icon: CheckCircle, color: '#059669' },
  ORDER_CANCELLED: { Icon: XCircle, color: '#ef4444' },
  PRODUCT_APPROVED: { Icon: Star, color: '#f59e0b' },
  PRODUCT_SUSPENDED: { Icon: AlertCircle, color: '#ef4444' },
  SELLER_APPROVED: { Icon: Star, color: '#059669' },
  SELLER_SUSPENDED: { Icon: XCircle, color: '#ef4444' },
  REPORT_SUBMITTED: { Icon: AlertCircle, color: '#f59e0b' },
  REPORT_RESOLVED: { Icon: CheckCircle, color: '#059669' },
  SYSTEM_ANNOUNCEMENT: { Icon: Info, color: '#6b7280' },
  DEFAULT: { Icon: Info, color: '#6b7280' },
};

function getConfig(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.DEFAULT;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initialData = getCacheEntry(NOTIFICATIONS_CACHE_KEY)?.data;
  const [notifications, setNotifications] = useState(initialData?.notifications || []);
  const [unreadCount, setUnreadCount] = useState(initialData?.unreadCount || 0);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    if (!silent) setIsLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.NOTIFICATIONS.LIST, { params: { page: 1, pageSize: 20 } });
      const data = { notifications: res.data || [], unreadCount: res.unreadCount ?? 0 };
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
      setCachedData(NOTIFICATIONS_CACHE_KEY, data);
    } catch (err) {
      toast.error('Failed to load notifications', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(useCallback(() => {
    if (!isAuthenticated) return undefined;
    fetchNotifications({ silent: Boolean(getCacheEntry(NOTIFICATIONS_CACHE_KEY)) });
    const interval = setInterval(() => fetchNotifications({ silent: true }), 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications, isAuthenticated]));

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchNotifications({ silent: true });
  };

  const handleMarkRead = async (notif) => {
    if (notif.isRead) return;
    try {
      await apiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_READ(notif.id));
      const nextNotifications = notifications.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n));
      const nextUnreadCount = Math.max(0, unreadCount - 1);
      setNotifications(nextNotifications);
      setUnreadCount(nextUnreadCount);
      setCachedData(NOTIFICATIONS_CACHE_KEY, { notifications: nextNotifications, unreadCount: nextUnreadCount });
    } catch (err) {
      toast.error('Failed to mark as read', err.message);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
      const nextNotifications = notifications.map((n) => ({ ...n, isRead: true }));
      setNotifications(nextNotifications);
      setUnreadCount(0);
      setCachedData(NOTIFICATIONS_CACHE_KEY, { notifications: nextNotifications, unreadCount: 0 });
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark all as read', err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(ENDPOINTS.NOTIFICATIONS.DELETE(id));
      const deleted = notifications.find((item) => item.id === id);
      const nextNotifications = notifications.filter((item) => item.id !== id);
      const nextUnreadCount = deleted && !deleted.isRead ? Math.max(0, unreadCount - 1) : unreadCount;
      setNotifications(nextNotifications);
      setUnreadCount(nextUnreadCount);
      setCachedData(NOTIFICATIONS_CACHE_KEY, { notifications: nextNotifications, unreadCount: nextUnreadCount });
      toast.success('Notification deleted');
    } catch (err) {
      toast.error('Failed to delete notification', err.message);
    }
  };

  const renderItem = ({ item }) => {
    const { Icon, color } = getConfig(item.type);
    return (
      <Pressable
        style={[styles.item, !item.isRead && styles.itemUnread]}
        onPress={() => handleMarkRead(item)}
      >
        <View style={styles.iconWrap}>
          <Icon size={16} color={!item.isRead ? color : colors.textMuted} />
        </View>
        <View style={styles.itemBody}>
          <Text style={[styles.itemTitle, !item.isRead && styles.itemTitleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
        <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} style={styles.deleteBtn}>
          <Trash2 size={16} color={colors.gray300} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {isAuthenticated && unreadCount > 0 ? (
          <Pressable style={styles.markAllBtn} onPress={handleMarkAllRead} hitSlop={8}>
            <CheckCheck size={14} color={colors.secondary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {isAuthenticated && isLoading ? <ListSkeleton rows={7} imageSize={36} /> : <FlatList
        data={isAuthenticated ? notifications : []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={!isAuthenticated || notifications.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={isAuthenticated ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
        ListEmptyComponent={
          <EmptyState
            icon={isAuthenticated ? <Bell size={48} color={colors.gray400} /> : null}
            title={isAuthenticated ? 'No notifications yet' : 'Your notifications will appear here'}
            message={isAuthenticated ? 'Order updates and announcements will show up here.' : undefined}
            actionLabel={!isAuthenticated ? 'Sign In' : undefined}
            onAction={!isAuthenticated ? () => router.push({ pathname: '/login', params: { redirect: '/notifications' } }) : undefined}
          />
        }
      />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.white,
  },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  markAllText: { ...typography.caption, color: colors.secondary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  listContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  emptyContainer: { flexGrow: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    minHeight: 84,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  itemUnread: { backgroundColor: colors.white },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemBody: { flex: 1, gap: 3 },
  itemTitle: { ...typography.body, fontWeight: '600', fontFamily: fontFamily.semiBold, color: colors.textPrimary },
  itemTitleUnread: { color: colors.textPrimary },
  itemMessage: { ...typography.caption, color: colors.textSecondary, lineHeight: 17 },
  itemTime: { ...typography.caption, color: colors.textMuted, fontSize: 11 },
  unreadDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.primary, marginTop: 4 },
  deleteBtn: { padding: spacing.xs },
});

