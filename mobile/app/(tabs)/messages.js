import { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, Image, ActivityIndicator, RefreshControl, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircle, Store } from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import EmptyState from '../../src/components/EmptyState';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

// Mirrors web/src/pages/Messages.jsx + components/messenger/Messenger.jsx's conversation list
// (buyer role only — sellers use the web dashboard). Tapping a conversation opens the thread
// screen at app/conversation/[id].js.
function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

export default function Messages() {
  const router = useRouter();
  const [conversations, setConversations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConversations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await apiClient.get(ENDPOINTS.MESSAGES.CONVERSATIONS);
      setConversations(res.data || []);
    } catch (err) {
      toast.error('Failed to load messages', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchConversations({ silent: true });
  };

  const renderItem = ({ item }) => (
    <Pressable
      style={styles.item}
      onPress={() => router.push(`/conversation/${item.id}?storeName=${encodeURIComponent(item.store?.name || 'Store')}`)}
    >
      <View style={styles.avatarWrap}>
        {item.store?.logo ? (
          <Image source={{ uri: resolveImg(item.store.logo) }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Store size={18} color={colors.secondary} />
          </View>
        )}
        {item.unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.storeName} numberOfLines={1}>{item.store?.name || 'Store'}</Text>
        <Text style={[styles.lastMessage, item.unreadCount > 0 && styles.lastMessageUnread]} numberOfLines={1}>
          {item.lastMessage?.body || 'Start the conversation'}
        </Text>
      </View>
      <View style={styles.itemMeta}>
        <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>
        {item.unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.unreadCount}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );

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
        <Text style={styles.headerTitle}>Messages</Text>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          <EmptyState
            icon={<MessageCircle size={48} color={colors.gray400} />}
            title="No conversations yet"
            message="Message a store from a product page to start a conversation."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  listContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  emptyContainer: { flexGrow: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 44, height: 44, borderRadius: radius.full },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.bgGreenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  itemBody: { flex: 1, gap: 2 },
  storeName: { ...typography.body, fontWeight: '600', fontFamily: fontFamily.semiBold, color: colors.textPrimary },
  lastMessage: { ...typography.caption, color: colors.textSecondary },
  lastMessageUnread: { color: colors.textPrimary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  itemMeta: { alignItems: 'flex-end', gap: spacing.xs },
  time: { ...typography.caption, color: colors.textMuted },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { ...typography.caption, fontSize: 10, color: colors.white, fontWeight: '700', fontFamily: fontFamily.bold },
});
