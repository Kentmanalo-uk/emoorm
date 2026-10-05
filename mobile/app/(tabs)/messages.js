import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowsClockwiseIcon, ChatTextIcon, EnvelopeOpenIcon, FunnelIcon, MagnifyingGlassIcon, StorefrontIcon, XIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { toast } from '../../src/lib/toast';
import { getCachedData, setCachedData } from '../../src/lib/dataCache';
import useAuthStore from '../../src/store/authStore';
import { font, t } from '../../src/theme';
import EmptyState from '../../src/components/EmptyState';
import ShellBarButton from '../../src/components/ShellBarButton';
import ShellPageMenu from '../../src/components/ShellPageMenu';
import InboxPageHead, { InboxTopGap } from '../../src/components/inbox/InboxPageHead';
import InboxLoginGate from '../../src/components/inbox/InboxLoginGate';
import ConversationRow from '../../src/components/inbox/ConversationRow';
import MoormyEntry from '../../src/components/inbox/MoormyEntry';
import { ConversationListSkeleton } from '../../src/components/inbox/InboxSkeletons';

/*
 * The buyer's Messages tab (web/src/pages/Messages.jsx →
 * components/messenger/Messenger.jsx, its conversation list on phones):
 * the title bar with search and ⋯, Ate Moormy, then the chats. A chat opens
 * at /conversation/:id (the website's ?c=), Ate Moormy at /conversation/moormy.
 * ?store=<id> opens (or starts) the chat with that shop, as on the website.
 */

const LIST_KEY = 'messages:buyer';

export default function Messages() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <InboxLoginGate page="messages" />;
  return <MessagesList />;
}

function MessagesList() {
  const router = useRouter();
  const { store: initialStoreId, c: initialConversationId } = useLocalSearchParams();
  const currentUser = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState(() => getCachedData(LIST_KEY) || []);
  const [loadingList, setLoadingList] = useState(() => !getCachedData(LIST_KEY));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const openedStore = useRef(null);
  const searchRef = useRef(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await apiClient.get('/messages/conversations');
      setConversations(res.data || []);
      setCachedData(LIST_KEY, res.data || []);
    } catch (err) {
      // Silent: the main error surface is per conversation.
      console.error('Failed to load conversations', err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  // Each visit to the tab (and back from a chat) asks again.
  useFocusEffect(useCallback(() => { fetchConversations(); }, [fetchConversations]));

  const openChat = useCallback((id, params) => {
    router.push({ pathname: '/conversation/[id]', params: { id, ...params } });
  }, [router]);

  // ?store=… opens (or starts) that shop's chat.
  useEffect(() => {
    if (!initialStoreId || openedStore.current === initialStoreId) return;
    openedStore.current = initialStoreId;
    apiClient.post('/messages/conversations', { storeId: initialStoreId })
      .then((res) => {
        router.setParams({ store: undefined });
        openChat(res.data.id);
        fetchConversations();
      })
      .catch((err) => {
        openedStore.current = null;
        toast.error(err?.message || 'Could not open conversation');
      });
  }, [initialStoreId, openChat, fetchConversations, router]);

  // ?c=… (a notification's link) opens that chat.
  useEffect(() => {
    if (!initialConversationId) return;
    router.setParams({ c: undefined });
    openChat(initialConversationId);
  }, [initialConversationId, openChat, router]);

  const buyerChats = useMemo(() => conversations.filter((c) => c.role === 'buyer'), [conversations]);
  const filtered = useMemo(() => {
    const scoped = unreadOnly ? buyerChats.filter((c) => c.unreadCount > 0) : buyerChats;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((c) => (c.store?.name || '').toLowerCase().includes(q));
  }, [buyerChats, searchQuery, unreadOnly]);
  const unreadChats = buyerChats.filter((c) => c.unreadCount > 0);

  const markAllRead = async () => {
    const ids = unreadChats.map((c) => c.id);
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => apiClient.post(`/messages/conversations/${id}/read`)));
    await fetchConversations();
    toast.success(ids.length === 1 ? 'Chat marked as read' : `${ids.length} chats marked as read`);
  };

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
    } else {
      setSearchOpen(true);
    }
  };

  const openMoormy = (question) => openChat('moormy', question ? { ask: question } : undefined);

  const menuItems = [
    unreadChats.length > 0 && { key: 'read', Icon: EnvelopeOpenIcon, label: 'Mark all as read', onPress: markAllRead },
    { key: 'unread', Icon: FunnelIcon, label: unreadOnly ? 'Show all chats' : 'Show unread only', onPress: () => setUnreadOnly((v) => !v) },
    { key: 'refresh', Icon: ArrowsClockwiseIcon, label: 'Refresh', onPress: fetchConversations },
  ].filter(Boolean);

  const firstName = String(currentUser?.fullName || '').trim().split(/\s+/)[0];
  const empty = !loadingList && filtered.length === 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      stickyHeaderIndices={[1]}
      keyboardShouldPersistTaps="handled"
    >
      <InboxTopGap />
      <InboxPageHead title="Messages">
        <ShellBarButton label={searchOpen ? 'Close search' : 'Search chats'} onPress={toggleSearch} accessibilityState={{ expanded: searchOpen }}>
          {searchOpen
            ? <XIcon size={19} weight="bold" color={t.primary[700]} />
            : <MagnifyingGlassIcon size={19} color={t.neutral[700]} />}
        </ShellBarButton>
        <ShellPageMenu label="Chat options" items={menuItems} />
      </InboxPageHead>

      <View style={styles.list}>
        {searchOpen || searchQuery ? (
          <View style={styles.search}>
            <MagnifyingGlassIcon size={16} color={t.neutral[500]} />
            <TextInput
              ref={searchRef}
              autoFocus
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search stores"
              placeholderTextColor={t.neutral[400]}
              accessibilityLabel="Search conversations"
              returnKeyType="search"
              style={styles.searchInput}
              underlineColorAndroid="transparent"
            />
            {searchQuery ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearchQuery('')} style={styles.searchClear}>
                <XIcon size={12} weight="bold" color={t.neutral[0]} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {unreadOnly ? (
          <View style={styles.filterPillWrap}>
            <Pressable accessibilityRole="button" onPress={() => setUnreadOnly(false)} style={styles.filterPill}>
              <Text style={styles.filterPillText}>Unread only</Text>
              <XIcon size={12} weight="bold" color={t.primary[700]} />
            </Pressable>
          </View>
        ) : null}

        {!searchQuery && !unreadOnly ? (
          <MoormyEntry userId={currentUser?.id} firstName={firstName} onOpen={openMoormy} />
        ) : null}

        {loadingList ? (
          <ConversationListSkeleton />
        ) : empty ? (
          <EmptyState
            art="messages"
            icon={ChatTextIcon}
            style={styles.empty}
            title={searchQuery
              ? `No chats match “${searchQuery}”`
              : unreadOnly ? 'No unread chats' : 'No conversations yet'}
            text={searchQuery
              ? 'Try another name, or clear the search.'
              : unreadOnly ? "You're all caught up." : 'Tap Chat on a product or shop to ask the seller anything.'}
            actions={searchQuery
              ? [{ label: 'Clear search', onPress: () => setSearchQuery(''), variant: 'outline' }]
              : unreadOnly
                ? [{ label: 'Show all chats', onPress: () => setUnreadOnly(false), variant: 'outline' }]
                : [{ label: 'Browse stores', onPress: () => router.push('/stores'), icon: StorefrontIcon }]}
          />
        ) : (
          filtered.map((c) => (
            <ConversationRow key={c.id} item={c} currentUserId={currentUser?.id} onPress={() => openChat(c.id)} />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1, paddingBottom: 16 },
  list: { paddingTop: 6 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, marginHorizontal: 12, marginBottom: 8,
    paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.neutral[100],
  },
  searchInput: {
    flex: 1, minWidth: 0, height: 40, padding: 0, fontSize: 16, color: t.neutral[900], ...font(400), outlineStyle: 'none',
  },
  searchClear: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[300] },
  filterPillWrap: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row' },
  filterPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderWidth: 1,
    borderColor: t.primary[600], borderRadius: 999, backgroundColor: t.primary[50],
  },
  filterPillText: { fontSize: 13, lineHeight: 16, color: t.primary[700], ...font(400) },
  empty: { minHeight: 420, marginTop: 0, marginHorizontal: 12, marginBottom: 16, paddingVertical: 48, paddingHorizontal: 24 },
});
