import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretLeftIcon, ChatsCircleIcon, CheckCircleIcon, LockSimpleIcon, NotePencilIcon, PaperPlaneRightIcon, StarIcon,
} from 'phosphor-react-native';
import apiClient from '../src/api/client';
import ScreenHeader from '../src/components/ScreenHeader';
import EmptyState from '../src/components/EmptyState';
import ChatSafetyNotice from '../src/components/inbox/ChatSafetyNotice';
import SupportCaseSheet from '../src/components/profile/SupportCaseSheet';
import { CASE_STATUS_LABELS as STATUS_LABELS, CATEGORY_LABELS, errorText } from '../src/components/profile/profileLib';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { font, t } from '../src/theme';

const THREAD_POLL_MS = 5000;
const LIST_POLL_MS = 15000;

const TOPIC_LABELS = {
  IDENTITY_VERIFICATION: 'Identity verification',
  GENERAL: 'General help',
  DIRECT: 'Direct message',
};

const BADGE = {
  OPEN: { backgroundColor: t.primary[50], color: t.primary[700] },
  RESOLVED: { backgroundColor: t.success[100], color: t.success[800] },
  CLOSED: { backgroundColor: t.neutral[200], color: t.neutral[600] },
  RATED: { backgroundColor: t.warning[100], color: t.warning[800] },
};

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** Runs `fn` now and every `ms` while the app is in front (the website's pollWhileVisible). */
function usePoll(fn, ms, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => saved.current(), ms);
    };
    const stop = () => { clearInterval(timer); timer = null; };
    saved.current();
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { saved.current(); start(); } else stop();
    });
    return () => { stop(); sub.remove(); };
  }, [ms, enabled]);
}

function Badge({ status, label, style }) {
  const tone = BADGE[status] || BADGE.OPEN;
  return <Text style={[styles.badge, { backgroundColor: tone.backgroundColor, color: tone.color }, style]}>{label}</Text>;
}

function Avatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.avatar}>
      {src && !failed
        ? <Image source={{ uri: resolveImg(src) }} style={styles.avatarImg} onError={() => setFailed(true)} />
        : <Text style={styles.avatarText}>{(name || '?').charAt(0).toUpperCase()}</Text>}
    </View>
  );
}

/** Read-only stars, used once a case has been rated. */
const Stars = ({ value }) => (
  <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value} out of 5`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <StarIcon key={n} size={15} weight={n <= value ? 'fill' : 'regular'} color={n <= value ? t.warning[500] : t.neutral[300]} />
    ))}
  </View>
);

/** Shown to the case owner once an admin resolves the case; one rating per case. */
function RatingPrompt({ conversation, onRated }) {
  const [picked, setPicked] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);

  if (conversation.rating) {
    return (
      <View style={[styles.rating, styles.ratingDone]}>
        <View style={styles.ratingStrong}>
          <CheckCircleIcon size={14} weight="fill" color={t.neutral[900]} />
          <Text style={styles.ratingTitle}>You rated this case</Text>
        </View>
        <Stars value={Number(conversation.rating)} />
        {conversation.ratingComment ? <Text style={styles.ratingQuote}>“{conversation.ratingComment}”</Text> : null}
      </View>
    );
  }

  const submit = async () => {
    if (!picked) return;
    setSaving(true);
    try {
      const res = await apiClient.post(`/support/cases/${conversation.id}/rating`, {
        rating: picked,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
      toast.success('Thanks for the feedback.');
      onRated(res.data);
    } catch (err) {
      toast.error(errorText(err, 'Could not save your rating'));
    } finally {
      setSaving(false);
    }
  };

  const off = !picked || saving;
  return (
    <View style={styles.rating}>
      <Text style={styles.ratingTitle}>How did we do?</Text>
      <Text style={styles.ratingHint}>This case was marked resolved. Rate the help you got.</Text>
      <View style={styles.ratingStars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} onPress={() => setPicked(n)} style={styles.ratingStar}>
            <StarIcon size={22} weight={n <= picked ? 'fill' : 'regular'} color={n <= picked ? t.warning[500] : t.neutral[500]} />
          </Pressable>
        ))}
      </View>
      <TextInput
        value={comment}
        onChangeText={setComment}
        maxLength={1000}
        multiline
        textAlignVertical="top"
        placeholder="Anything you want to add? (optional)"
        placeholderTextColor={t.neutral[500]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.ratingInput, focused && { borderColor: t.primary[600] }]}
      />
      <Pressable
        accessibilityRole="button"
        onPress={submit}
        disabled={off}
        style={({ pressed }) => [styles.btnGreen, pressed && { backgroundColor: t.primary[700] }, off && { opacity: 0.5 }]}
      >
        <Text style={styles.btnGreenText}>{saving ? 'Sending…' : 'Send rating'}</Text>
      </Pressable>
    </View>
  );
}

/**
 * /profile/support (web/src/pages/ProfileSupport.jsx +
 * components/support/SupportChat.jsx, mode "user"): the person's support
 * cases with the municipal team; a case opens full screen as a chat, with
 * the rating prompt once it is resolved. "New support case" starts one.
 */
export default function ProfileSupport() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(typeof params.c === 'string' ? params.c : null);
  const [thread, setThread] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [draft, setDraft] = useState(typeof params.draft === 'string' ? params.draft : '');
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composerFocus, setComposerFocus] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Phones open no case until one is picked.
  const activeId = selectedId || null;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // A case opened from elsewhere (?c=…) while this page is open.
  useEffect(() => { if (typeof params.c === 'string' && params.c) setSelectedId(params.c); }, [params.c]);

  const refreshList = useCallback(() => apiClient.get('/support/cases')
    .then((res) => setConversations(res.data || []))
    .catch((err) => toast.error(errorText(err, 'Failed to load conversations')))
    .finally(() => setLoadingList(false)), []);

  usePoll(refreshList, LIST_POLL_MS);

  const fetchThread = useCallback(() => {
    if (!activeId) return;
    const id = activeId;
    apiClient.get(`/support/cases/${id}`)
      .then((res) => {
        setThread((prev) => (id === activeIdRef.current ? res.data : prev));
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)));
      })
      .catch((err) => toast.error(errorText(err, 'Failed to load messages')));
  }, [activeId]);

  usePoll(fetchThread, THREAD_POLL_MS, Boolean(activeId));

  // Android's back button leaves the open case first, as the thread's back arrow does.
  useEffect(() => {
    if (!activeId) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setSelectedId(null); return true; });
    return () => sub.remove();
  }, [activeId]);

  const messageCount = thread?.messages?.length || 0;
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 30);
    return () => clearTimeout(timer);
  }, [messageCount, activeId]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    try {
      const res = await apiClient.post(`/support/cases/${activeId}/messages`, { body });
      setDraft('');
      setThread((prev) => (prev ? { ...prev, status: 'OPEN', messages: [...prev.messages, res.data] } : prev));
      refreshList();
    } catch (err) {
      toast.error(errorText(err, 'Failed to send message'));
    } finally {
      setSending(false);
    }
  };

  // A rating reply may come back without the messages, so merge rather than replace.
  const handleRated = (updated) => {
    setThread((prev) => (prev ? { ...prev, ...updated, messages: updated?.messages || prev.messages } : prev));
    setConversations((prev) => prev.map((c) => (c.id === activeId
      ? { ...c, rating: updated?.rating ?? c.rating, ratingComment: updated?.ratingComment ?? c.ratingComment }
      : c)));
  };

  const handleOpened = (conversation) => {
    setSelectedId(conversation.id);
    setThread(conversation);
    setConversations((prev) => (prev.some((c) => c.id === conversation.id)
      ? prev
      : [{ ...conversation, lastMessage: null }, ...prev]));
    refreshList();
    setTimeout(() => inputRef.current?.focus(), 350);
  };

  const fallbackTitle = (c) => (c.topic === 'DIRECT'
    ? `${c.municipality?.name || 'Municipal'} Admin`
    : `${c.municipality?.name || 'Municipal'} Support`);
  const titleFor = (c) => c.subject || fallbackTitle(c);
  const subtitleFor = (c) => [
    CATEGORY_LABELS[c.category] || TOPIC_LABELS[c.topic] || 'Support',
    c.municipality?.name,
  ].filter(Boolean).join(' · ');

  const active = thread && thread.id === activeId ? thread : null;
  const activeSummary = conversations.find((c) => c.id === activeId);
  const activeStatus = active?.status || activeSummary?.status || 'OPEN';
  const isClosed = activeStatus === 'CLOSED';
  const canRate = active && (activeStatus === 'RESOLVED' || activeStatus === 'CLOSED');

  const caseSheet = <SupportCaseSheet open={composeOpen} onClose={() => setComposeOpen(false)} onOpened={handleOpened} />;

  /* ── An open case: the chat, full screen ─────────────────────────────── */
  if (activeId) {
    return (
      <KeyboardAvoidingView style={styles.threadScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.threadHead, { paddingTop: 8 + insets.top }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to conversations" onPress={() => setSelectedId(null)} style={({ pressed }) => [styles.back, pressed && { backgroundColor: t.neutral[100] }]}>
            <CaretLeftIcon size={18} color={t.neutral[700]} />
          </Pressable>
          {active ? (
            <View style={styles.threadTitle}>
              <View style={styles.threadTitleRow}>
                <Text style={styles.threadName} numberOfLines={1}>{titleFor(active)}</Text>
                <Badge status={activeStatus} label={STATUS_LABELS[activeStatus] || activeStatus} style={styles.badgeHead} />
              </View>
              <Text style={styles.threadSub} numberOfLines={1}>
                {`${subtitleFor(active)} · ${active.adminName || 'Waiting for a municipal admin'}`}
              </Text>
            </View>
          ) : <View style={styles.threadTitle} />}
        </View>

        {!active ? (
          <View style={[styles.messages, styles.threadEmpty]}>
            <Text style={styles.threadEmptyText}>Loading messages…</Text>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={styles.messages}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
              keyboardShouldPersistTaps="handled"
            >
              {active.messages.length === 0 ? (
                <View style={styles.noMessages}>
                  <ChatsCircleIcon size={56} weight="fill" color={t.primary[200]} />
                  <Text style={styles.threadEmptyText}>Send a message to start the conversation.</Text>
                </View>
              ) : null}
              {active.messages.map((m) => {
                const mine = active.viewerSide === 'admin' ? m.senderId !== active.user?.id : m.senderId === active.user?.id;
                return (
                  <View key={m.id} style={[styles.message, mine && styles.messageMine]}>
                    {!mine ? <Text style={styles.messageName}>{m.sender?.fullName}</Text> : null}
                    <Text style={[styles.messageText, mine && { color: '#fff' }]} selectable>{m.body}</Text>
                    <Text style={[styles.messageTime, mine && { color: '#fff' }]}>{formatTime(m.createdAt)}</Text>
                  </View>
                );
              })}
              {isClosed ? (
                <View style={styles.closedNotice}>
                  <LockSimpleIcon size={14} color={t.neutral[600]} />
                  <Text style={styles.closedText}>This case was closed. Send a message to reopen it.</Text>
                </View>
              ) : null}
            </ScrollView>

            {canRate ? <RatingPrompt conversation={active} onRated={handleRated} /> : null}
          </>
        )}

        <ChatSafetyNotice />
        <View style={[styles.composer, { paddingBottom: 8 + insets.bottom }]}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder="Type a message…"
            placeholderTextColor={t.neutral[500]}
            maxLength={2000}
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={send}
            onFocus={() => setComposerFocus(true)}
            onBlur={() => setComposerFocus(false)}
            style={[styles.composerInput, composerFocus && styles.composerFocus]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send message"
            onPress={send}
            disabled={sending || !draft.trim()}
            style={[styles.send, (sending || !draft.trim()) && { opacity: 0.5 }]}
          >
            {sending ? <ActivityIndicator size={18} color="#fff" /> : <PaperPlaneRightIcon size={18} weight="fill" color="#fff" />}
          </Pressable>
        </View>
        {caseSheet}
      </KeyboardAvoidingView>
    );
  }

  /* ── The list of cases ───────────────────────────────────────────────── */
  return (
    <View style={styles.screen}>
      <ScreenHeader title="Help & Support" backTo="/profile" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.subtitle}>Your support cases with the municipal team. Looking for an answer instead?</Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/help-center')} style={styles.helpLink}>
            {({ pressed }) => <Text style={[styles.helpLinkText, pressed && { color: t.primary[800], textDecorationLine: 'underline' }]}>Browse Help & Support</Text>}
          </Pressable>
        </View>

        <View style={styles.chat}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setComposeOpen(true)}
            style={({ pressed }) => [styles.compose, pressed && { backgroundColor: t.primary[700] }]}
          >
            <NotePencilIcon size={16} weight="fill" color="#fff" />
            <Text style={styles.composeText}>New support case</Text>
          </Pressable>

          {loadingList ? (
            <Text style={styles.loading}>Loading…</Text>
          ) : conversations.length === 0 ? (
            <EmptyState inset art="support" title="No support cases yet" text="Start one and your municipal admin will pick it up." />
          ) : (
            conversations.map((c) => {
              const status = c.status || 'OPEN';
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  onPress={() => { setThread(null); setSelectedId(c.id); }}
                  style={({ pressed }) => [styles.item, pressed && { backgroundColor: t.neutral[100] }]}
                >
                  <Avatar src={c.municipality?.logo} name={titleFor(c)} />
                  <View style={styles.itemBody}>
                    <View style={styles.itemTop}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{titleFor(c)}</Text>
                      <Text style={styles.itemTime}>{formatTime(c.lastMessage?.createdAt || c.createdAt)}</Text>
                    </View>
                    <Text style={styles.itemTopic} numberOfLines={1}>{subtitleFor(c)}</Text>
                    <Text style={[styles.itemPreview, status === 'CLOSED' && { color: t.neutral[500] }]} numberOfLines={1}>
                      {c.lastMessage?.body || 'No messages yet'}
                    </Text>
                    <View style={styles.itemBadges}>
                      <Badge status={status} label={STATUS_LABELS[c.status] || 'Open'} />
                      {c.rating > 0 ? <Badge status="RATED" label={`Rated ${c.rating}/5`} /> : null}
                    </View>
                  </View>
                  {c.unreadCount > 0 ? <Text style={styles.unread}>{c.unreadCount}</Text> : null}
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
      {caseSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1, gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },
  subtitle: { fontSize: 13, lineHeight: 19.5, color: t.neutral[500], ...font(400) },
  helpLink: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  helpLinkText: { fontSize: 14, lineHeight: 21, color: t.primary[700], ...font(400) },

  chat: { flexGrow: 1, minHeight: 360, marginHorizontal: -12, backgroundColor: t.neutral[0] },
  compose: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44,
    marginTop: 12, marginHorizontal: 12, marginBottom: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: t.primary[600],
  },
  composeText: { fontSize: 13, lineHeight: 15.6, color: '#fff', ...font(500) },
  loading: { paddingVertical: 32, paddingHorizontal: 16, textAlign: 'center', fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },

  item: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingVertical: 12, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100], backgroundColor: t.neutral[0],
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50],
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { fontSize: 14, lineHeight: 16.8, color: t.primary[600], ...font(500) },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  itemTitle: { flexShrink: 1, minWidth: 0, fontSize: 14, lineHeight: 16.8, color: t.neutral[900], ...font(500) },
  itemTime: { flexShrink: 0, fontSize: 12, lineHeight: 16.8, color: t.neutral[500], ...font(400) },
  itemTopic: { fontSize: 12, lineHeight: 14.4, color: t.neutral[500], ...font(400) },
  itemPreview: { fontSize: 13, lineHeight: 15.6, color: t.neutral[600], ...font(400) },
  itemBadges: { flexDirection: 'row', gap: 4, marginTop: 3 },
  badgeHead: { alignSelf: 'center', lineHeight: 17.6 },
  badge: { alignSelf: 'flex-start', paddingVertical: 1, paddingHorizontal: 6, overflow: 'hidden', fontSize: 11, lineHeight: 13.2, ...font(500) },
  unread: {
    alignSelf: 'center', minWidth: 20, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.primary[600], color: '#fff', textAlign: 'center', fontSize: 11, lineHeight: 13.2, ...font(500),
  },

  threadScreen: { flex: 1, backgroundColor: t.neutral[0] },
  threadHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12, paddingLeft: 6, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  back: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  threadTitle: { flex: 1, minWidth: 0, minHeight: 43 },
  threadTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  threadName: { flexShrink: 1, minWidth: 0, fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  threadSub: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  threadEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  threadEmptyText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], textAlign: 'center', ...font(400) },
  noMessages: { alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: 16 },

  messages: { flexGrow: 1, gap: 10, paddingVertical: 14, paddingHorizontal: 12, backgroundColor: t.neutral[0] },
  message: {
    alignSelf: 'flex-start', maxWidth: '82%', paddingVertical: 8, paddingHorizontal: 12, backgroundColor: t.neutral[100],
    borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderBottomLeftRadius: 4,
  },
  messageMine: { alignSelf: 'flex-end', backgroundColor: t.primary[600], borderBottomRightRadius: 4, borderBottomLeftRadius: 12 },
  messageName: { marginBottom: 2, fontSize: 12, lineHeight: 19.2, color: t.primary[700], ...font(500) },
  messageText: { fontSize: 14, lineHeight: 20.3, color: t.secondary[950], ...font(400) },
  messageTime: { marginTop: 4, fontSize: 11, lineHeight: 17.6, opacity: 0.88, textAlign: 'right', color: t.secondary[950], ...font(400) },
  closedNotice: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: 6, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  closedText: { fontSize: 12, lineHeight: 19.2, color: t.neutral[600], textAlign: 'center', ...font(400) },

  rating: {
    alignItems: 'flex-start', gap: 8, marginTop: 8, marginHorizontal: 10, marginBottom: 0, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.primary[100], borderRadius: 10, backgroundColor: t.primary[50],
  },
  ratingDone: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  ratingStrong: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingTitle: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[900], ...font(500) },
  ratingHint: { fontSize: 12.5, lineHeight: 20, color: t.neutral[600], ...font(400) },
  ratingQuote: { flexBasis: '100%', fontSize: 13, lineHeight: 20.8, color: t.neutral[600], ...font(400) },
  ratingStars: { flexDirection: 'row', gap: 2 },
  ratingStar: { padding: 2 },
  ratingInput: {
    alignSelf: 'stretch', height: 104, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 13, lineHeight: 20.8, ...font(400),
  },
  btnGreen: { minHeight: 36, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: t.primary[600] },
  btnGreenText: { fontSize: 12, lineHeight: 14.4, color: '#fff', ...font(500) },

  composer: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 8,
    borderTopWidth: 1, borderTopColor: t.neutral[150], backgroundColor: t.neutral[0],
  },
  composerInput: {
    flex: 1, minHeight: 42, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 21, backgroundColor: t.neutral[100],
    color: t.neutral[900], fontSize: 16, lineHeight: 21.6, ...font(400),
  },
  composerFocus: { boxShadow: `0px 0px 0px 1px ${t.primary[600]}` },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
});
