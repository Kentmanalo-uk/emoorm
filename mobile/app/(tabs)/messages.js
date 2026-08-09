import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, Image, RefreshControl, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MessageCircle, Search, Store, X } from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { getCacheEntry, getCachedData, refreshCachedData } from '../../src/lib/dataCache';
import EmptyState from '../../src/components/EmptyState';
import { ListSkeleton } from '../../src/components/SkeletonLayouts';
import useAuthStore from '../../src/store/authStore';
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

const BUYER_MESSAGES_CACHE_KEY = 'buyer:messages';
const BUYER_MESSAGES_CACHE_TTL = 60 * 1000;

export default function Messages() {
  const router = useRouter();
  const { store: initialStoreId } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const openedStoreRef = useRef(null);
  const initialConversations = getCacheEntry(BUYER_MESSAGES_CACHE_KEY)?.data;
  const [conversations, setConversations] = useState(initialConversations || []);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(!initialConversations);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchConversations = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    if (!force) {
      const fresh = getCachedData(BUYER_MESSAGES_CACHE_KEY, BUYER_MESSAGES_CACHE_TTL);
      if (fresh) {
        setConversations(fresh);
        setIsLoading(false);
        return;
      }
    }
    if (!silent && !getCacheEntry(BUYER_MESSAGES_CACHE_KEY)) setIsLoading(true);
    try {
      const data = await refreshCachedData(BUYER_MESSAGES_CACHE_KEY, async () => {
        const res = await apiClient.get(ENDPOINTS.MESSAGES.CONVERSATIONS);
        return (res.data || []).filter((item) => item.role !== 'seller');
      });
      setConversations(data);
    } catch (err) {
      toast.error('Failed to load messages', err.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAuthenticated]);

  useFocusEffect(useCallback(() => {
    if (!isAuthenticated) return undefined;
    fetchConversations();
    const interval = setInterval(() => fetchConversations({ silent: true, force: true }), 30000);
    return () => clearInterval(interval);
  }, [fetchConversations, isAuthenticated]));

  useEffect(() => {
    if (!isAuthenticated || !initialStoreId || openedStoreRef.current === initialStoreId) return;
    openedStoreRef.current = initialStoreId;
    apiClient
      .post(ENDPOINTS.MESSAGES.CONVERSATIONS, { storeId: initialStoreId })
      .then((res) => {
        const conversation = res.data;
        if (!conversation?.id) throw new Error('Conversation could not be opened');
        router.replace(`/conversation/${conversation.id}?storeName=${encodeURIComponent(conversation.store?.name || 'Store')}`);
      })
      .catch((err) => {
        openedStoreRef.current = null;
        toast.error('Failed to open conversation', err.message);
      });
  }, [initialStoreId, isAuthenticated, router]);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchConversations({ silent: true, force: true });
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter((item) => `${item.store?.name || ''} ${item.lastMessage?.body || ''}`.toLowerCase().includes(normalizedQuery))
    : conversations;

  const renderItem = ({ item }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Conversation with ${item.store?.name || 'Store'}`}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
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

  if (isAuthenticated && isLoading) {
    return <View style={styles.screen}><View style={[styles.header, { paddingTop: insets.top + spacing.md }]}><Text style={styles.headerTitle}>Messages</Text></View><ListSkeleton rows={7} imageSize={48} /></View>;
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>
      {isAuthenticated ? <View style={styles.searchWrap}><Search size={18} color={colors.textMuted} /><TextInput accessibilityLabel="Search store conversations" style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search stores" placeholderTextColor={colors.textMuted} returnKeyType="search" />{query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}><X size={18} color={colors.textMuted} /></Pressable> : null}</View> : null}
      <FlatList
        data={isAuthenticated ? filteredConversations : []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={!isAuthenticated || filteredConversations.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={isAuthenticated ? <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined}
        ListEmptyComponent={
          <EmptyState
            icon={isAuthenticated ? <MessageCircle size={48} color={colors.gray400} /> : null}
            title={isAuthenticated ? (normalizedQuery ? 'No stores found' : 'No conversations yet') : 'Your messages will appear here'}
            message={isAuthenticated ? (normalizedQuery ? 'Try another store name or message.' : 'Message a store from a product page to start a conversation.') : undefined}
            actionLabel={!isAuthenticated ? 'Sign In' : undefined}
            onAction={!isAuthenticated ? () => router.push({ pathname: '/login', params: { redirect: '/messages' } }) : undefined}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: colors.white,
  },
  headerTitle: { ...typography.h2, color: colors.textPrimary },
  searchWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray100 },
  searchInput: { ...typography.body, flex: 1, minWidth: 0, paddingVertical: spacing.sm, color: colors.textPrimary, outlineStyle: 'none' },
  listContainer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  emptyContainer: { flexGrow: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 76,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  itemPressed: { backgroundColor: colors.gray50 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: radius.full },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.bgGreenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
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

