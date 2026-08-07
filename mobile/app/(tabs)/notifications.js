import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import {
  Bell, CheckCheck, Trash2, Package, ShoppingBag,
  CheckCircle, XCircle, Star, AlertCircle, Info,
} from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { toast } from '../../src/lib/toast';
import EmptyState from '../../src/components/EmptyState';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

// Mirrors web/src/pages/Notifications.jsx's TYPE_CONFIG — keep types/colors in sync.
const TYPE_CONFIG = {
  ORDER_RECEIVED: { Icon: ShoppingBag, color: '#3b82f6', bg: '#dbeafe' },
  ORDER_CONFIRMED: { Icon: CheckCircle, color: '#059669', bg: '#d1fae5' },
  ORDER_READY: { Icon: Package, color: '#f97316', bg: '#ffedd5' },
  ORDER_COMPLETED: { Icon: CheckCircle, color: '#059669', bg: '#d1fae5' },
  ORDER_CANCELLED: { Icon: XCircle, color: '#ef4444', bg: '#fee2e2' },
  PRODUCT_APPROVED: { Icon: Star, color: '#f59e0b', bg: '#fef3c7' },
  PRODUCT_SUSPENDED: { Icon: AlertCircle, color: '#ef4444', bg: '#fee2e2' },
  SELLER_APPROVED: { Icon: Star, color: '#059669', bg: '#d1fae5' },
  SELLER_SUSPENDED: { Icon: XCircle, color: '#ef4444', bg: '#fee2e2' },
  REPORT_SUBMITTED: { Icon: AlertCircle, color: '#f59e0b', bg: '#fef3c7' },
  REPORT_RESOLVED: { Icon: CheckCircle, color: '#059669', bg: '#d1fae5' },
  SYSTEM_ANNOUNCEMENT: { Icon: Info, color: '#6b7280', bg: '#f3f4f6' },
  DEFAULT: { Icon: Info, color: '#6b7280', bg: '#f3f4f6' },
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
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.NOTIFICATIONS.LIST, { params: { page: 1, pageSize: 20 } });
      setNotifications(res.data || []);
      setUnreadCount(res.unreadCount ?? 0);
    } catch (err) {
      toast.error('Failed to load notifications', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchNotifications({ silent: true });
  };

  const handleMarkRead = async (notif) => {
    if (notif.isRead) return;
    try {
      await apiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_READ(notif.id));
      setNotifications((prev) => prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      toast.error('Failed to mark as read', err.message);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_ALL_READ);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark all as read', err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await apiClient.delete(ENDPOINTS.NOTIFICATIONS.DELETE(id));
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification deleted');
    } catch (err) {
      toast.error('Failed to delete notification', err.message);
    }
  };

  const renderItem = ({ item }) => {
    const { Icon, color, bg } = getConfig(item.type);
    return (
      <Pressable
        style={[styles.item, !item.isRead && styles.itemUnread]}
        onPress={() => handleMarkRead(item)}
      >
        <View style={[styles.iconWrap, { backgroundColor: bg }]}>
          <Icon size={18} color={color} />
        </View>
        <View style={styles.itemBody}>
          <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.itemMessage} numberOfLines={2}>{item.message}</Text>
          <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
        </View>
        {!item.isRead && <View style={styles.unreadDot} />}
        <Pressable onPress={() => handleDelete(item.id)} hitSlop={8} style={styles.deleteBtn}>
          <Trash2 size={16} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable style={styles.markAllBtn} onPress={handleMarkAllRead} hitSlop={8}>
            <CheckCheck size={14} color={colors.secondary} />
            <Text style={styles.markAllText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={notifications.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState
            icon={<Bell size={48} color={colors.gray400} />}
            title="No notifications yet"
            message="Order updates and announcements will show up here."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  markAllText: { ...typography.caption, color: colors.secondary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  listContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  emptyContainer: { flexGrow: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  itemUnread: { backgroundColor: colors.bgGreenLight, borderColor: colors.primaryLighter },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { ...typography.body, fontWeight: '600', fontFamily: fontFamily.semiBold, color: colors.textPrimary },
  itemMessage: { ...typography.caption, color: colors.textSecondary },
  itemTime: { ...typography.caption, color: colors.textMuted },
  unreadDot: { width: 8, height: 8, borderRadius: radius.full, backgroundColor: colors.primary, marginTop: 4 },
  deleteBtn: { padding: spacing.xs },
});
