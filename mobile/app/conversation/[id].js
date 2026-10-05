import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowsClockwiseIcon, CaretLeftIcon, FlagIcon, PackageIcon, StorefrontIcon, UserIcon, XIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { toast } from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import { font, t } from '../../src/theme';
import ShellPageMenu from '../../src/components/ShellPageMenu';
import ChatAvatar from '../../src/components/inbox/ChatAvatar';
import ChatBubble, { ChatDay } from '../../src/components/inbox/ChatBubble';
import ChatComposer from '../../src/components/inbox/ChatComposer';
import ChatPinnedOrders from '../../src/components/inbox/ChatPinnedOrders';
import ChatPhotoViewer from '../../src/components/inbox/ChatPhotoViewer';
import ChatProductPicker from '../../src/components/inbox/ChatProductPicker';
import ChatReportSheet from '../../src/components/inbox/ChatReportSheet';
import ChatSafetyNotice from '../../src/components/inbox/ChatSafetyNotice';
import InboxSpinner from '../../src/components/inbox/InboxSpinner';
import MoormyThread from '../../src/components/inbox/MoormyThread';
import { dayLabel } from '../../src/components/inbox/inboxFormat';
import { photoProblem, uploadChatPhoto } from '../../src/components/inbox/chatUpload';

/*
 * One chat, full screen (web Messenger.jsx with a conversation open on a
 * phone: ?c=<id>). Buyers and sellers both land here; `role` in the
 * conversation says which side this is. /conversation/moormy is Ate
 * Moormy's chat (buyers), with ?ask=<question> asked as it opens.
 */

const POLL_INTERVAL_MS = 5000;
const QUICK_QUESTIONS = [
  'Hi! Is this still available?',
  'How much is delivery to my area?',
  'Can I pick up my order?',
];

export default function ConversationScreen() {
  const { id, ask } = useLocalSearchParams();
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const back = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/messages')), [router]);
  if (id === 'moormy') {
    return <MoormyThread userId={currentUser?.id} pendingAsk={ask || null} onAsked={() => router.setParams({ ask: undefined })} onBack={back} />;
  }
  return <StoreChat key={id} id={String(id)} onBack={back} />;
}

function StoreChat({ id, onBack }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentUser = useAuthStore((s) => s.user);

  const [activeConvo, setActiveConvo] = useState(null);
  const [loadingConvo, setLoadingConvo] = useState(true);
  const [draft, setDraft] = useState('');
  const [attachedOrderId, setAttachedOrderId] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [earlier, setEarlier] = useState({ messages: [], hasMore: null, loading: false });

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const stickToEnd = useRef(true);
  const scrollY = useRef(0);
  const contentH = useRef(0);
  const keepFromBottom = useRef(null);
  const convoRef = useRef(null);
  useEffect(() => { convoRef.current = activeConvo; }, [activeConvo]);

  const scrollToBottom = useCallback(() => {
    stickToEnd.current = true;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, []);

  const markRead = useCallback(() => {
    apiClient.post(`/messages/conversations/${id}/read`).catch(() => { });
  }, [id]);

  const fetchConversation = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoadingConvo(true);
    try {
      const res = await apiClient.get(`/messages/conversations/${id}`);
      setActiveConvo(res.data);
      if (!silent) setError('');
      return res.data;
    } catch (err) {
      setError(err?.message || 'Could not load this conversation');
      return null;
    } finally {
      if (!silent) setLoadingConvo(false);
    }
  }, [id]);

  // Opened: load it, show the newest message, mark it read.
  useEffect(() => {
    fetchConversation().then((convo) => {
      if (convo) scrollToBottom();
      markRead();
    });
  }, [fetchConversation, scrollToBottom, markRead]);

  // New messages every few seconds while the chat is on screen.
  useFocusEffect(useCallback(() => {
    let appActive = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', (s) => { appActive = s === 'active'; });
    const timer = setInterval(async () => {
      if (!appActive) return;
      const prevCount = convoRef.current?.messages?.length || 0;
      const next = await fetchConversation({ silent: true });
      if (next && (next.messages?.length || 0) > prevCount) {
        scrollToBottom();
        markRead();
      }
    }, POLL_INTERVAL_MS);
    return () => { clearInterval(timer); sub.remove(); };
  }, [fetchConversation, scrollToBottom, markRead]));

  const resetComposer = () => {
    setDraft('');
    setAttachedOrderId(null);
    setPendingProduct(null);
    setPendingImage(null);
  };

  const pickPhoto = async () => {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setError('Allow photo access to send a photo.'); return; }
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const problem = photoProblem(asset);
    if (problem) { setError(problem); return; }
    setError('');
    setPendingImage(asset);
  };

  const sendMessage = async (bodyText) => {
    const body = (bodyText ?? draft).trim();
    if ((!body && !pendingImage && !pendingProduct && !attachedOrderId) || sending) return;
    setSending(true);
    setError('');
    try {
      let imageUrl;
      if (pendingImage) imageUrl = await uploadChatPhoto(pendingImage);
      await apiClient.post(`/messages/conversations/${id}/messages`, {
        body,
        imageUrl: imageUrl || undefined,
        orderId: attachedOrderId || undefined,
        productId: pendingProduct?.id || undefined,
      });
      resetComposer();
      await fetchConversation({ silent: true });
      scrollToBottom();
    } catch (err) {
      setError(err?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const attachedOrder = useMemo(() => {
    if (!attachedOrderId || !activeConvo?.pinnedOrders) return null;
    return activeConvo.pinnedOrders.find((o) => o.id === attachedOrderId) || null;
  }, [attachedOrderId, activeConvo]);

  const isSellerSide = activeConvo?.role === 'seller';

  const activeHeader = useMemo(() => {
    if (!activeConvo) return null;
    if (activeConvo.role === 'seller') {
      return {
        title: activeConvo.buyer?.fullName || 'Buyer',
        subtitle: 'Customer',
        avatar: activeConvo.buyer?.profilePhoto,
        Icon: UserIcon,
        link: activeConvo.buyer?.id ? `/u/${activeConvo.buyer.id}` : null,
      };
    }
    return {
      title: activeConvo.store?.name || 'Store',
      subtitle: 'Store · Tap to view shop',
      avatar: activeConvo.store?.logo,
      Icon: StorefrontIcon,
      link: activeConvo.store?.slug ? `/store/${activeConvo.store.slug}` : null,
    };
  }, [activeConvo]);

  // When the other side last read the chat: my messages up to then are seen.
  const otherReadAt = activeConvo ? (isSellerSide ? activeConvo.buyerLastReadAt : activeConvo.sellerLastReadAt) : null;
  const hasEarlier = earlier.hasMore !== null ? earlier.hasMore : Boolean(activeConvo?.hasEarlier);

  const loadEarlier = async () => {
    if (!activeConvo || earlier.loading) return;
    const oldest = earlier.messages[0] || activeConvo.messages?.[0];
    if (!oldest) return;
    setEarlier((cur) => ({ ...cur, loading: true }));
    try {
      const res = await apiClient.get(`/messages/conversations/${id}`, { params: { before: oldest.createdAt } });
      // Keep the message you were reading where it was.
      stickToEnd.current = false;
      keepFromBottom.current = contentH.current - scrollY.current;
      setEarlier((cur) => {
        const have = new Set(cur.messages.map((m) => m.id));
        const page = (res.data?.messages || []).filter((m) => !have.has(m.id));
        return { messages: [...page, ...cur.messages], hasMore: Boolean(res.data?.hasEarlier), loading: false };
      });
    } catch {
      setEarlier((cur) => ({ ...cur, loading: false }));
      toast.error('Could not load earlier messages');
    }
  };

  const timeline = useMemo(() => {
    const out = [];
    let lastDay = null;
    const newest = activeConvo?.messages || [];
    const seen = new Set(newest.map((m) => m.id));
    const older = earlier.messages.filter((m) => !seen.has(m.id));
    [...older, ...newest].forEach((m) => {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        out.push({ kind: 'day', key: `day-${day}`, label: dayLabel(m.createdAt) });
        lastDay = day;
      }
      out.push({ kind: 'msg', key: m.id, message: m });
    });
    return out;
  }, [activeConvo, earlier.messages]);

  const canSend = !sending && Boolean(draft.trim() || pendingImage || pendingProduct || attachedOrderId);

  const menuItems = activeConvo ? [
    activeHeader?.link && {
      key: 'view',
      Icon: isSellerSide ? UserIcon : StorefrontIcon,
      label: isSellerSide ? 'View buyer profile' : 'View shop',
      to: activeHeader.link,
    },
    { key: 'refresh', Icon: ArrowsClockwiseIcon, label: 'Refresh', onPress: () => fetchConversation() },
    {
      key: 'report', Icon: FlagIcon, label: isSellerSide ? 'Report buyer' : 'Report shop', danger: true, onPress: () => setReportOpen(true),
    },
  ].filter(Boolean) : [];

  const onContentSizeChange = (_w, h) => {
    contentH.current = h;
    if (keepFromBottom.current != null) {
      const y = Math.max(0, h - keepFromBottom.current);
      keepFromBottom.current = null;
      scrollRef.current?.scrollTo({ y, animated: false });
    } else if (stickToEnd.current) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  };

  const onScroll = (e) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    scrollY.current = contentOffset.y;
    // Reading older messages: new content no longer pulls the view down.
    stickToEnd.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 40;
  };

  if (!activeConvo) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.bareBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <CaretLeftIcon size={22} color={t.neutral[900]} />
          </Pressable>
        </View>
        <View style={styles.threadEmpty}>
          {loadingConvo ? (
            <>
              <InboxSpinner size={22} weight="fill" color={t.neutral[500]} />
              <Text style={styles.threadEmptyText}>Loading conversation…</Text>
            </>
          ) : (
            <>
              <PackageIcon size={32} weight="fill" color={t.neutral[500]} />
              <Text style={styles.threadEmptyText}>{error || 'Conversation not available.'}</Text>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      <View style={[styles.head, { paddingTop: 8 + insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <CaretLeftIcon size={22} color={t.neutral[900]} />
        </Pressable>
        <ChatAvatar
          src={activeHeader.avatar}
          name={activeHeader.title}
          size={38}
          fallbackIcon={null}
          style={styles.headAvatar}
          {...(!activeHeader.avatar ? { fallback: <activeHeader.Icon size={16} color={t.neutral[600]} /> } : {})}
        />
        <Pressable
          accessibilityRole={activeHeader.link ? 'link' : undefined}
          disabled={!activeHeader.link}
          onPress={() => activeHeader.link && router.push(activeHeader.link)}
          style={styles.title}
        >
          <Text style={styles.name} numberOfLines={1}>{activeHeader.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>{activeHeader.subtitle}</Text>
        </Pressable>
        <ShellPageMenu label="Conversation options" items={menuItems} />
      </View>

      <ChatPinnedOrders orders={activeConvo.pinnedOrders} sellerSide={isSellerSide} />

      <ScrollView
        ref={scrollRef}
        style={styles.messagesBox}
        contentContainerStyle={[styles.messages, timeline.length === 0 && styles.messagesEmptyBox]}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        scrollEventThrottle={32}
        keyboardShouldPersistTaps="handled"
      >
        {hasEarlier ? (
          <Pressable accessibilityRole="button" onPress={loadEarlier} disabled={earlier.loading} style={[styles.earlier, earlier.loading && styles.earlierBusy]}>
            <Text style={styles.earlierText}>{earlier.loading ? 'Loading…' : 'Load earlier messages'}</Text>
          </Pressable>
        ) : null}
        {timeline.length === 0 ? (
          <View style={styles.intro}>
            <ChatAvatar
              src={activeHeader.avatar}
              name={activeHeader.title}
              size={64}
              bg={t.primary[50]}
              color={t.primary[600]}
              {...(!activeHeader.avatar ? { fallback: <activeHeader.Icon size={16} color={t.primary[600]} /> } : {})}
            />
            <Text style={styles.introName}>{activeHeader.title}</Text>
            <Text style={styles.introText}>
              {isSellerSide
                ? 'Say hello and let your customer know how you can help.'
                : 'Ask about a product, delivery or pickup. You can also send a photo or attach a product.'}
            </Text>
            {!isSellerSide ? (
              <View style={styles.quick}>
                {QUICK_QUESTIONS.map((q) => (
                  <Pressable
                    key={q}
                    accessibilityRole="button"
                    onPress={() => sendMessage(q)}
                    disabled={sending}
                    style={({ pressed }) => [styles.quickChip, sending && styles.quickOff, pressed && styles.quickPressed]}
                  >
                    <Text style={styles.quickText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          timeline.map((entry) => (entry.kind === 'day' ? (
            <ChatDay key={entry.key} label={entry.label} />
          ) : (
            <ChatBubble
              key={entry.key}
              message={entry.message}
              isSelf={entry.message.senderId === currentUser?.id}
              seen={Boolean(otherReadAt) && new Date(otherReadAt) >= new Date(entry.message.createdAt)}
              onOpenImage={setViewerImage}
            />
          )))
        )}
      </ScrollView>

      {error ? (
        <View style={styles.error} accessibilityRole="alert">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={() => setError('')} style={styles.errorX}>
            <XIcon size={14} weight="bold" color={t.danger[800]} />
          </Pressable>
        </View>
      ) : null}

      <ChatSafetyNotice />

      <ChatComposer
        ref={inputRef}
        draft={draft}
        onChangeDraft={setDraft}
        onSend={() => sendMessage()}
        canSend={canSend}
        sending={sending}
        pendingImage={pendingImage}
        onClearImage={() => setPendingImage(null)}
        pendingProduct={pendingProduct}
        onClearProduct={() => setPendingProduct(null)}
        attachedOrder={attachedOrder}
        onClearOrder={() => setAttachedOrderId(null)}
        onAttachProduct={() => setPickerOpen(true)}
        attachProductDisabled={!activeConvo.store?.id}
        onPickPhoto={pickPhoto}
      />

      {activeConvo.store?.id ? (
        <ChatProductPicker
          open={pickerOpen}
          storeId={activeConvo.store.id}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => { setPendingProduct(p); setPickerOpen(false); setTimeout(() => inputRef.current?.focus(), 300); }}
        />
      ) : null}

      <ChatPhotoViewer image={viewerImage} onClose={() => setViewerImage(null)} />

      <ChatReportSheet
        open={reportOpen}
        type={isSellerSide ? 'BUYER' : 'SELLER'}
        storeId={isSellerSide ? undefined : activeConvo.store?.id}
        reportedBuyerId={isSellerSide ? activeConvo.buyer?.id : undefined}
        targetName={activeHeader.title}
        onClose={() => setReportOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  bareBar: { minHeight: 56, paddingHorizontal: 8, justifyContent: 'center' },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, paddingHorizontal: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: t.neutral[150], backgroundColor: t.neutral[0],
  },
  back: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pressed: { backgroundColor: t.neutral[100] },
  headAvatar: { marginHorizontal: 0 },
  title: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  name: { fontSize: 16, lineHeight: 25.6, color: t.neutral[900], ...font(500) },
  sub: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  messagesBox: { flex: 1, backgroundColor: t.neutral[0] },
  messages: { paddingVertical: 14, paddingHorizontal: 12, gap: 8 },
  messagesEmptyBox: { flexGrow: 1 },
  earlier: {
    alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  earlierBusy: { opacity: 0.6 },
  earlierText: { fontSize: 12.5, lineHeight: 20, color: t.neutral[600], ...font(400) },
  intro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 24, paddingHorizontal: 16 },
  introName: { marginTop: 6, fontSize: 16, lineHeight: 18.4, color: t.neutral[900], textAlign: 'center', ...font(500) },
  introText: { maxWidth: 280, fontSize: 13.5, lineHeight: 20.25, color: t.neutral[500], textAlign: 'center', ...font(400) },
  quick: { alignItems: 'center', gap: 8, marginTop: 12 },
  quickChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: t.primary[200], borderRadius: 999, backgroundColor: t.primary[50],
  },
  quickPressed: { backgroundColor: t.primary[100] },
  quickOff: { opacity: 0.5 },
  quickText: { fontSize: 13.5, lineHeight: 16.2, color: t.primary[700], ...font(400) },
  threadEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 56 },
  threadEmptyText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], textAlign: 'center', ...font(400) },
  error: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 8, paddingHorizontal: 14,
    borderTopWidth: 1, borderTopColor: t.danger[200], backgroundColor: t.danger[100],
  },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 20, color: t.danger[800], ...font(400) },
  errorX: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
