import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { NotePencilIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import EmptyState from '../../src/components/EmptyState';
import SellerPage from '../../src/components/seller/SellerPage';
import { useSellerShell } from '../../src/components/seller/SellerShell';
import SupportCaseSheet from '../../src/components/profile/SupportCaseSheet';
import { CASE_STATUS_LABELS as STATUS_LABELS, CATEGORY_LABELS, errorText } from '../../src/components/profile/profileLib';
import { CaseRow } from '../../src/components/seller/support/SupportParts';
import SupportThread from '../../src/components/seller/support/SupportThread';
import {
  LIST_POLL_MS, THREAD_POLL_MS, TOPIC_LABELS, formatTime, titleFor, usePoll,
} from '../../src/components/seller/support/supportLib';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';

/*
 * /seller/support, "Admin messages" (web/src/pages/SellerSupport.jsx →
 * components/support/SupportChat.jsx, mode "user", at phone width): the
 * shop's support cases with its municipal admin. The page's own title and
 * subtitle give way to the bar on phones; "New support case" starts one in a
 * sheet; a case opens full screen as a chat, with the rating prompt once an
 * admin resolves it. `?c=` opens a case (notifications, the chat dock);
 * `?draft=` starts the composer with a message (the website's state.draft).
 */

const subtitleFor = (c) => [
  CATEGORY_LABELS[c.category] || TOPIC_LABELS[c.topic] || 'Support',
  c.municipality?.name,
].filter(Boolean).join(' · ');

export default function SellerSupportScreen() {
  const params = useLocalSearchParams();
  const { refreshCounts } = useSellerShell();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(typeof params.c === 'string' && params.c ? params.c : null);
  const [thread, setThread] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [draft, setDraft] = useState(typeof params.draft === 'string' ? params.draft : '');
  const [sending, setSending] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  // Read now: the Seller Center's "waiting" counts catch up.
  useEffect(() => { if (activeId) refreshCounts?.(); }, [activeId, refreshCounts]);

  // Android's back button leaves the open case first, as the thread's back arrow does.
  useEffect(() => {
    if (!activeId) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setSelectedId(null); return true; });
    return () => sub.remove();
  }, [activeId]);

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

  const pullRefresh = () => {
    setRefreshing(true);
    refreshList().finally(() => setRefreshing(false));
  };

  const open = (id) => { setThread(null); setSelectedId(id); };

  const active = thread && thread.id === activeId ? thread : null;
  const activeSummary = conversations.find((c) => c.id === activeId);
  const activeStatus = active?.status || activeSummary?.status || 'OPEN';

  const caseSheet = <SupportCaseSheet open={composeOpen} onClose={() => setComposeOpen(false)} onOpened={handleOpened} />;

  /* ── An open case: the chat, full screen ─────────────────────────────── */
  if (activeId) {
    return (
      <>
        <SupportThread
          thread={active}
          title={active ? titleFor(active) : ''}
          subtitle={active ? `${subtitleFor(active)} · ${active.adminName || 'Waiting for a municipal admin'}` : ''}
          status={activeStatus}
          statusLabel={STATUS_LABELS[activeStatus] || activeStatus}
          draft={draft}
          onDraft={setDraft}
          sending={sending}
          onSend={send}
          onRated={handleRated}
          onBack={() => setSelectedId(null)}
          inputRef={inputRef}
        />
        {caseSheet}
      </>
    );
  }

  /* ── The list of cases ───────────────────────────────────────────────── */
  return (
    <SellerPage refreshing={refreshing} onRefresh={pullRefresh} contentStyle={styles.content}>
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
          <EmptyState page art="support" title="No support cases yet" text="Start one and your municipal admin will pick it up." />
        ) : (
          conversations.map((c) => (
            <CaseRow
              key={c.id}
              title={titleFor(c)}
              topic={subtitleFor(c)}
              status={c.status || 'OPEN'}
              statusLabel={STATUS_LABELS[c.status] || 'Open'}
              rating={c.rating}
              preview={c.lastMessage?.body || 'No messages yet'}
              time={formatTime(c.lastMessage?.createdAt || c.createdAt)}
              logo={c.municipality?.logo}
              unread={c.unreadCount}
              onPress={() => open(c.id)}
            />
          ))
        )}
      </View>
      {caseSheet}
    </SellerPage>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  // .sc-chat on phones: edge to edge (the page's 12px gutters pulled back), white.
  chat: { flexGrow: 1, minHeight: 360, marginHorizontal: -12, backgroundColor: t.neutral[0] },
  compose: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44,
    marginTop: 12, marginHorizontal: 12, marginBottom: 10, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: t.primary[600],
  },
  composeText: { fontSize: 13, lineHeight: 20.8, color: '#fff', ...font(600) },
  loading: {
    paddingVertical: 32, paddingHorizontal: 16, textAlign: 'center', fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400),
  },
});
