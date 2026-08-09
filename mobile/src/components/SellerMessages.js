import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MessageCircle, Search, UserRound, X } from 'lucide-react-native';
import apiClient from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { resolveImg } from '../lib/media';
import { toast } from '../lib/toast';
import { getCacheEntry, getCachedData, refreshCachedData } from '../lib/dataCache';
import EmptyState from './EmptyState';
import { ListSkeleton } from './SkeletonLayouts';
import { colors, fontFamily, radius, spacing, typography } from '../theme';

function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

const SELLER_MESSAGES_CACHE_KEY = 'seller:messages';
const SELLER_MESSAGES_CACHE_TTL = 60 * 1000;

export default function SellerMessages() {
  const router = useRouter();
  const initialConversations = getCacheEntry(SELLER_MESSAGES_CACHE_KEY)?.data;
  const [conversations, setConversations] = useState(initialConversations || []);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(!initialConversations);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!force) {
      const fresh = getCachedData(SELLER_MESSAGES_CACHE_KEY, SELLER_MESSAGES_CACHE_TTL);
      if (fresh) {
        setConversations(fresh);
        setIsLoading(false);
        return;
      }
    }
    if (!silent) setIsLoading(true);
    try {
      const data = await refreshCachedData(SELLER_MESSAGES_CACHE_KEY, async () => {
        const response = await apiClient.get(ENDPOINTS.MESSAGES.CONVERSATIONS);
        return (response.data || []).filter((item) => item.role === 'seller');
      });
      setConversations(data);
    } catch (error) {
      toast.error('Failed to load store messages', error.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const interval = setInterval(() => load({ silent: true, force: true }), 30000);
    return () => clearInterval(interval);
  }, [load]));

  if (isLoading) {
    return <ListSkeleton rows={7} imageSize={44} />;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter((item) => `${item.buyer?.fullName || ''} ${item.lastMessage?.body || ''}`.toLowerCase().includes(normalizedQuery))
    : conversations;

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <Search size={18} color={colors.textMuted} />
        <TextInput accessibilityLabel="Search customer conversations" style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search customers" placeholderTextColor={colors.textMuted} returnKeyType="search" />
        {query ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}><X size={18} color={colors.textMuted} /></Pressable> : null}
      </View>
      <FlatList
      style={styles.list}
      data={filteredConversations}
      keyExtractor={(item) => item.id}
      contentContainerStyle={filteredConversations.length ? styles.content : styles.empty}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => { setIsRefreshing(true); load({ silent: true, force: true }); }} colors={[colors.primary]} />}
      ListEmptyComponent={<EmptyState icon={<MessageCircle size={44} color={colors.gray400} />} title={normalizedQuery ? 'No customers found' : 'No store messages'} message={normalizedQuery ? 'Try another name or message.' : 'Customer conversations will appear here.'} />}
      renderItem={({ item }) => {
        const buyerName = item.buyer?.fullName || 'Customer';
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={`Conversation with ${buyerName}`} style={({ pressed }) => [styles.item, pressed && styles.itemPressed]} onPress={() => router.push(`/conversation/${item.id}?storeName=${encodeURIComponent(buyerName)}`)}>
            <View style={styles.avatarWrap}>
              {item.buyer?.profilePhoto ? <Image source={{ uri: resolveImg(item.buyer.profilePhoto) }} style={styles.avatar} /> : <View style={styles.avatarPlaceholder}><UserRound size={19} color={colors.secondary} /></View>}
              {item.unreadCount > 0 ? <View style={styles.unreadDot} /> : null}
            </View>
            <View style={styles.itemBody}>
              <Text style={styles.buyerName} numberOfLines={1}>{buyerName}</Text>
              <Text style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]} numberOfLines={1}>{item.lastMessage?.body || 'Customer conversation'}</Text>
            </View>
            <View style={styles.meta}>
              <Text style={styles.time}>{timeAgo(item.lastMessageAt)}</Text>
              {item.unreadCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View> : null}
            </View>
          </Pressable>
        );
      }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  searchWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray100 },
  searchInput: { ...typography.body, flex: 1, minWidth: 0, paddingVertical: spacing.sm, color: colors.textPrimary, outlineStyle: 'none' },
  list: { backgroundColor: colors.white },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg },
  empty: { flexGrow: 1 },
  item: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xs, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  itemPressed: { backgroundColor: colors.gray50 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 48, height: 48, borderRadius: radius.full },
  avatarPlaceholder: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.bgGreenLight },
  unreadDot: { position: 'absolute', top: -2, right: -2, width: 11, height: 11, borderRadius: radius.full, backgroundColor: colors.primary },
  itemBody: { flex: 1, gap: 2 },
  buyerName: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  preview: { ...typography.caption, color: colors.textSecondary },
  previewUnread: { color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  meta: { alignItems: 'flex-end', gap: spacing.xs },
  time: { ...typography.caption, color: colors.textMuted },
  badge: { minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderRadius: radius.full, backgroundColor: colors.primary },
  badgeText: { fontSize: 10, color: colors.white, fontFamily: fontFamily.bold, fontWeight: '700' },
});