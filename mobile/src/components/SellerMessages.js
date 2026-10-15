import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatCircleDotsIcon, MagnifyingGlassIcon, XIcon } from 'phosphor-react-native';
import apiClient from '../api/client';
import { toast } from '../lib/toast';
import { getCachedData, setCachedData } from '../lib/dataCache';
import useAuthStore from '../store/authStore';
import { font, t } from '../theme';
import EmptyState from './EmptyState';
import ChatAvatar from './inbox/ChatAvatar';
import { ConversationListSkeleton } from './inbox/InboxSkeletons';
import { foldText, formatTime } from './inbox/inboxFormat';
import { SellerPrivateLine, useSellerTabScroll } from './seller/SellerPage';
import { useConversationPeek } from './peek/ConversationPeek';

/*
 * The seller's Chat tab body (web/src/pages/SellerMessages.jsx on phones →
 * Messenger role="seller" filterChips, SellerApp.css .scm-tip and
 * .seller-chat-card): a one-time tip, the search (always open), All / Unread
 * chips with "Mark all read", then the buyers' chats edge to edge. A chat
 * opens at /conversation/:id (the website's ?c=).
 */

const LIST_KEY = 'messages:seller';
const TIP_KEY = 'emoorm-seller-chat-tip';

export default function SellerMessages() {
  const tabScroll = useSellerTabScroll();
  const router = useRouter();
  const { c: initialConversationId } = useLocalSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState(() => getCachedData(LIST_KEY) || []);
  const [loadingList, setLoadingList] = useState(() => !getCachedData(LIST_KEY));
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  // The tip shows until it is closed once (null while the answer is read).
  const [showTip, setShowTip] = useState(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(TIP_KEY)
      .then((v) => { if (alive) setShowTip(v !== '1'); })
      .catch(() => { if (alive) setShowTip(true); });
    return () => { alive = false; };
  }, []);

  const hideTip = () => {
    setShowTip(false);
    AsyncStorage.setItem(TIP_KEY, '1').catch(() => { /* the tip just shows again */ });
  };

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiClient.get('/messages/conversations');
      setConversations(res.data || []);
      setCachedData(LIST_KEY, res.data || []);
    } catch (err) {
      // Silent, as on the website: the chat itself shows its own errors.
      console.error('Failed to load conversations', err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Each visit to the tab (and back from a chat) asks again.
  useFocusEffect(useCallback(() => { fetchConversations(); }, [fetchConversations]));

  const openChat = useCallback((id) => {
    router.push({ pathname: '/conversation/[id]', params: { id } });
  }, [router]);

  // ?c=… (a notification's link) opens that chat.
  useEffect(() => {
    if (!initialConversationId) return;
    router.setParams({ c: undefined });
    openChat(initialConversationId);
  }, [initialConversationId, openChat, router]);

  const sellerChats = useMemo(() => conversations.filter((c) => c.role === 'seller'), [conversations]);
  const unreadChats = sellerChats.filter((c) => c.unreadCount > 0);
  // Found by the buyer's name or the message shown: every word typed, whatever the case or accents.
  const filtered = useMemo(() => {
    const scoped = unreadOnly ? sellerChats.filter((c) => c.unreadCount > 0) : sellerChats;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scoped;
    const words = foldText(q).split(/\s+/);
    return scoped.filter((c) => {
      const text = foldText(`${c.buyer?.fullName || ''} ${c.lastMessage?.body || ''}`);
      return words.every((w) => text.includes(w));
    });
  }, [sellerChats, searchQuery, unreadOnly]);

  // Held: the chat's preview; Mark as read there clears its count at once.
  const peekChat = useConversationPeek();
  const markRead = (id) => {
    setConversations((list) => list.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
    apiClient.post(`/messages/conversations/${id}/read`).catch(() => fetchConversations());
  };

  const markAllRead = async () => {
    const ids = unreadChats.map((c) => c.id);
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => apiClient.post(`/messages/conversations/${id}/read`)));
    await fetchConversations();
    toast.success(ids.length === 1 ? 'Chat marked as read' : `${ids.length} chats marked as read`);
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  const header = (
    <View>
      <View style={styles.privateWrap}><SellerPrivateLine /></View>
      {showTip ? (
        <View style={styles.tip} accessibilityRole="text">
          <ChatCircleDotsIcon size={20} weight="fill" color={t.primary[600]} />
          <Text style={styles.tipText}>Messages from your buyers show here. Quick replies win more orders.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss tip" onPress={hideTip} hitSlop={4} style={styles.tipClose}>
            <XIcon size={16} weight="bold" color={t.primary[700]} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.search}>
        <MagnifyingGlassIcon size={18} color={t.neutral[500]} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search name or message"
          placeholderTextColor={t.neutral[400]}
          accessibilityLabel="Search conversations"
          returnKeyType="search"
          style={styles.searchInput}
          underlineColorAndroid="transparent"
        />
        {searchQuery ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery('')} hitSlop={8} style={styles.searchClear}>
            <XIcon size={12} weight="bold" color={t.neutral[0]} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Show chats">
        <Chip on={!unreadOnly} label="All" onPress={() => setUnreadOnly(false)} />
        <Chip
          on={unreadOnly}
          label={`Unread${unreadChats.length > 0 ? ` · ${unreadChats.length}` : ''}`}
          onPress={() => setUnreadOnly(true)}
        />
        {unreadChats.length > 0 ? (
          <Pressable accessibilityRole="button" onPress={markAllRead} style={({ pressed }) => [styles.chipEnd, pressed && styles.pressedText]}>
            <Text style={styles.chipEndText}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const empty = loadingList ? <ConversationListSkeleton /> : (
    <EmptyState
      page
      art="messages"
      title={searchQuery
        ? `No chats match “${searchQuery}”`
        : unreadOnly ? 'No unread chats' : 'No conversations yet'}
      text={searchQuery
        ? 'Try another name, or clear the search.'
        : unreadOnly ? "You're all caught up." : 'Buyers will appear here when they message you.'}
      actions={searchQuery
        ? [{ label: 'Clear search', onPress: () => setSearchQuery(''), variant: 'outline' }]
        : unreadOnly ? [{ label: 'Show all chats', onPress: () => setUnreadOnly(false), variant: 'outline' }] : []}
    />
  );

  return (
    <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
      {...tabScroll}
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={loadingList ? [] : filtered}
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />}
      renderItem={({ item }) => (
        <BuyerChatRow
          item={item}
          currentUserId={currentUser?.id}
          onPress={() => openChat(item.id)}
          peek={peekChat(item, { currentUserId: currentUser?.id, onOpen: () => openChat(item.id), onMarkRead: () => markRead(item.id) })}
        />
      )}
    />
  );
}

function Chip({ on, label, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on, checked: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

// One buyer's chat (.seller-chat-card .msgr-convo-item: 16px in from the edges).
function BuyerChatRow({ item, currentUserId, onPress, peek }) {
  const title = item.buyer?.fullName || 'Buyer';
  const preview = item.lastMessage
    ? item.lastMessage.senderId === currentUserId ? `You: ${item.lastMessage.body}` : item.lastMessage.body
    : 'Start the conversation';
  const time = formatTime(item.lastMessageAt);
  const unread = item.unreadCount || 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${unread ? `, ${unread} unread` : ''}`}
      onPress={onPress}
      {...peek}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <ChatAvatar src={item.buyer?.profilePhoto} name={title} size={44} bg={t.success[100]} color={t.primary[600]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]} numberOfLines={1}>{preview}</Text>
      </View>
      {time ? <Text style={styles.rowTime} numberOfLines={1}>{time}</Text> : null}
      {unread > 0 ? (
        <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1, paddingTop: 4, paddingBottom: 16 },
  privateWrap: { paddingHorizontal: 12 },

  // .scm-tip on phones: edge to edge, an 8px band under it.
  tip: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 10, paddingLeft: 14, paddingRight: 6,
    borderBottomWidth: 8, borderBottomColor: t.neutral[100], backgroundColor: t.primary[50],
  },
  tipText: { flex: 1, fontSize: 13.5, lineHeight: 18.9, color: t.neutral[700], ...font(400) },
  tipClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

  // .seller-chat-card .msgr-list-search
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginTop: 14, marginHorizontal: 16, marginBottom: 8,
    paddingLeft: 14, paddingRight: 8, borderRadius: 12, backgroundColor: t.neutral[100],
  },
  searchInput: {
    flex: 1, minWidth: 0, height: 46, padding: 0, fontSize: 16, color: t.neutral[900], ...font(400), outlineStyle: 'none',
  },
  searchClear: {
    width: 24, height: 24, marginRight: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[300],
  },

  // .msgr-chips / .msgr-chip
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2, paddingHorizontal: 16, paddingBottom: 10 },
  chip: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  chipOn: { backgroundColor: t.primary[600] },
  chipText: { fontSize: 13.5, lineHeight: 18, color: t.neutral[700], ...font(500) },
  chipTextOn: { color: t.neutral[0] },
  chipEnd: { marginLeft: 'auto', minHeight: 34, paddingHorizontal: 4, justifyContent: 'center' },
  chipEndText: { fontSize: 13.5, lineHeight: 18, color: t.primary[700], ...font(500) },
  pressedText: { opacity: 0.6 },

  // .msgr-convo-item
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 69, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  rowPressed: { backgroundColor: t.neutral[100] },
  rowBody: { flex: 1, minWidth: 0, paddingRight: 58, justifyContent: 'center' },
  rowTitle: { fontSize: 15, lineHeight: 18, color: t.neutral[900], ...font(500) },
  rowPreview: { marginTop: 2, fontSize: 13, lineHeight: 15.6, color: t.neutral[500], ...font(400) },
  rowPreviewUnread: { color: t.neutral[900], ...font(500) },
  rowTime: { position: 'absolute', right: 16, top: 14, maxWidth: 54, fontSize: 12, lineHeight: 14.4, color: t.neutral[500], textAlign: 'right', ...font(400) },
  badge: {
    position: 'absolute', right: 16, bottom: 12, minWidth: 18, height: 18, paddingHorizontal: 6,
    borderRadius: 9999, backgroundColor: t.primary[600], alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10.5, lineHeight: 12.6, color: t.neutral[0], ...font(500) },
});
