import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  AlertCircle, CheckCircle, Info, Package, ShoppingBag, Star, Trash2, XCircle,
} from 'lucide-react-native';
import apiClient from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { toast } from '../lib/toast';
import {
  getCacheEntry, getCachedData, invalidateCachedData, refreshCachedData, setCachedData,
} from '../lib/dataCache';
import EmptyState from './EmptyState';
import { ListSkeleton } from './SkeletonLayouts';
import { colors, fontFamily, radius, spacing, typography } from '../theme';

const CACHE_KEY = 'seller:notifications';
const CACHE_TTL = 60 * 1000;
const SELLER_TYPES = new Set([
  'ORDER_RECEIVED', 'ORDER_CANCELLED', 'PRODUCT_APPROVED', 'PRODUCT_SUSPENDED',
  'SELLER_APPROVED', 'SELLER_SUSPENDED', 'REPORT_SUBMITTED', 'REPORT_RESOLVED',
  'SYSTEM_ANNOUNCEMENT',
]);
const TYPE_CONFIG = {
  ORDER_RECEIVED: { Icon: ShoppingBag, color: colors.info },
  ORDER_CANCELLED: { Icon: XCircle, color: colors.error },
  PRODUCT_APPROVED: { Icon: CheckCircle, color: colors.success },
  PRODUCT_SUSPENDED: { Icon: AlertCircle, color: colors.error },
  SELLER_APPROVED: { Icon: Star, color: colors.success },
  SELLER_SUSPENDED: { Icon: XCircle, color: colors.error },
  REPORT_SUBMITTED: { Icon: AlertCircle, color: colors.warning },
  REPORT_RESOLVED: { Icon: CheckCircle, color: colors.success },
  SYSTEM_ANNOUNCEMENT: { Icon: Info, color: colors.textMuted },
};

function timeAgo(iso) {
  if (!iso) return '';
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function destinationFor(type) {
  if (type === 'ORDER_RECEIVED' || type === 'ORDER_CANCELLED') return 'orders';
  if (type === 'PRODUCT_APPROVED' || type === 'PRODUCT_SUSPENDED') return 'products';
  if (type === 'SELLER_APPROVED' || type === 'SELLER_SUSPENDED') return 'store';
  return null;
}

export default function SellerNotifications({ onNavigate, onUnreadChange }) {
  const initialData = getCacheEntry(CACHE_KEY)?.data;
  const [notifications, setNotifications] = useState(initialData || []);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);

  const applyNotifications = useCallback((next) => {
    setNotifications(next);
    onUnreadChange?.(next.filter((item) => !item.isRead).length);
  }, [onUnreadChange]);

  const load = useCallback(async ({ force = false, silent = false } = {}) => {
    if (!force) {
      const fresh = getCachedData(CACHE_KEY, CACHE_TTL);
      if (fresh) {
        applyNotifications(fresh);
        setLoading(false);
        return;
      }
    }
    if (!silent) setLoading(!getCacheEntry(CACHE_KEY));
    try {
      const data = await refreshCachedData(CACHE_KEY, async () => {
        const response = await apiClient.get(ENDPOINTS.NOTIFICATIONS.LIST, { params: { page: 1, pageSize: 50 } });
        return (response.data || []).filter((item) => SELLER_TYPES.has(item.type));
      });
      applyNotifications(data);
    } catch (error) {
      toast.error('Failed to load seller notifications', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applyNotifications]);

  useFocusEffect(useCallback(() => {
    load();
    const interval = setInterval(() => load({ force: true, silent: true }), 30000);
    return () => clearInterval(interval);
  }, [load]));

  const openNotification = async (notification) => {
    let next = notifications;
    if (!notification.isRead) {
      try {
        await apiClient.put(ENDPOINTS.NOTIFICATIONS.MARK_READ(notification.id));
        next = notifications.map((item) => item.id === notification.id ? { ...item, isRead: true } : item);
        setCachedData(CACHE_KEY, next);
        invalidateCachedData('notifications:');
        applyNotifications(next);
      } catch (error) {
        toast.error('Failed to mark notification as read', error.message);
        return;
      }
    }
    const destination = destinationFor(notification.type);
    if (destination) onNavigate?.(destination);
  };

  const removeNotification = async (notification) => {
    try {
      await apiClient.delete(ENDPOINTS.NOTIFICATIONS.DELETE(notification.id));
      const next = notifications.filter((item) => item.id !== notification.id);
      setCachedData(CACHE_KEY, next);
      invalidateCachedData('notifications:');
      applyNotifications(next);
    } catch (error) {
      toast.error('Failed to delete notification', error.message);
    }
  };

  if (loading) return <ListSkeleton rows={7} imageSize={36} />;

  return (
    <FlatList
      data={notifications}
      keyExtractor={(item) => item.id}
      contentContainerStyle={notifications.length ? styles.content : styles.empty}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ force: true, silent: true }); }} colors={[colors.primary]} />}
      ListEmptyComponent={<EmptyState title="No seller notifications" message="Order, product, and store updates will appear here." />}
      renderItem={({ item }) => {
        const { Icon, color } = TYPE_CONFIG[item.type] || TYPE_CONFIG.SYSTEM_ANNOUNCEMENT;
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.message}`} style={[styles.item, !item.isRead && styles.itemUnread]} onPress={() => openNotification(item)}>
            <View style={styles.iconWrap}><Icon size={17} color={!item.isRead ? color : colors.textMuted} /></View>
            <View style={styles.body}>
              <Text style={[styles.title, !item.isRead && styles.titleUnread]}>{item.title}</Text>
              <Text style={styles.message} numberOfLines={2}>{item.message}</Text>
              <Text style={styles.time}>{timeAgo(item.createdAt)}</Text>
            </View>
            {!item.isRead ? <View style={styles.unreadDot} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`} hitSlop={8} style={styles.deleteButton} onPress={(event) => { event.stopPropagation?.(); removeNotification(item); }}><Trash2 size={16} color={colors.gray300} /></Pressable>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  empty: { flexGrow: 1 },
  item: { minHeight: 84, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  itemUnread: { backgroundColor: colors.bgGreenLight },
  iconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 2, borderRadius: radius.full, backgroundColor: colors.white },
  body: { flex: 1, gap: 3 },
  title: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.medium },
  titleUnread: { fontFamily: fontFamily.semiBold },
  message: { ...typography.caption, color: colors.textSecondary },
  time: { fontSize: 11, color: colors.textMuted, fontFamily: fontFamily.regular },
  unreadDot: { width: 8, height: 8, marginTop: spacing.xs, borderRadius: radius.full, backgroundColor: colors.primary },
  deleteButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.sm },
});
