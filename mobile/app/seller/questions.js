import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import apiClient from '../../src/api/client';
import SellerPage, { sellerPageStyles } from '../../src/components/seller/SellerPage';
import EmptyState from '../../src/components/EmptyState';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import OrderConfirmDialog from '../../src/components/orders/OrderConfirmDialog';
import QuestionCard from '../../src/components/seller/questions/QuestionCard';
import { toast } from '../../src/lib/toast';
import { font, t, themed } from '../../src/theme';
import { PageLoader } from '../../src/components/BrandLoader';

/**
 * /seller/questions (web/src/pages/SellerQuestions.jsx, SellerQuestions.css):
 * questions buyers asked on the shop's products. "To answer" and "All";
 * an answer shows on the product page for everyone and the asker is told.
 * Hide removes spam or rude ones. `?id=` scrolls to that question and
 * rings it (from a notification).
 */
export default function SellerQuestionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id: focusId } = useLocalSearchParams();
  const [tab, setTab] = useState('open');
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [hiding, setHiding] = useState(null); // the question asked about
  const [hideBusy, setHideBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef(null);
  const listY = useRef(0);
  const scrolledTo = useRef(null);

  const load = useCallback((status) => apiClient.get('/questions/store', { params: { status } })
    .then((res) => setData(res.data))
    .catch(() => setData({ items: [], open: 0 })), []);
  useEffect(() => { load(tab); }, [tab, load]);

  const refresh = async () => {
    setRefreshing(true);
    await load(tab);
    setRefreshing(false);
  };

  // Brings the question from the notification into view once, when its card is laid out.
  const onItemLayout = (q) => (e) => {
    if (!focusId || q.id !== focusId || scrolledTo.current === q.id) return;
    scrolledTo.current = q.id;
    const { y } = e.nativeEvent.layout;
    // Near the top of the screen, so the answer box under it has room.
    scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + y - 80), animated: true });
  };

  const answer = async (q) => {
    setBusyId(q.id);
    try {
      await apiClient.post(`/questions/${q.id}/answer`, { answer: (drafts[q.id] ?? q.answer ?? '').trim() });
      toast.success('Answer posted on the product page');
      setDrafts((d) => ({ ...d, [q.id]: undefined }));
      load(tab);
    } catch (err) {
      toast.error(err?.message || 'Could not post the answer');
    } finally {
      setBusyId(null);
    }
  };

  const confirmHide = async () => {
    const q = hiding;
    if (!q) return;
    setHideBusy(true);
    try {
      await apiClient.post(`/questions/${q.id}/hide`);
      setHiding(null);
      load(tab);
    } catch (err) {
      setHiding(null);
      toast.error(err?.message || 'Could not hide the question');
    } finally {
      setHideBusy(false);
    }
  };

  const tabs = [['open', `To answer${data?.open ? ` (${data.open})` : ''}`], ['all', 'All']];

  return (
    <SellerPage scroll={false}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[sellerPageStyles.content, { flexGrow: 1, paddingBottom: 24 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />}
        >
          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map(([key, label]) => {
              const on = tab === key;
              return (
                <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTab(key)} style={[styles.tab, on && styles.tabOn]}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {data === null ? (
            <PageLoader label="Loading questions" />
          ) : data.items.length === 0 ? (
            <EmptyState
              page
              art="messages"
              title={tab === 'open' ? 'No questions waiting' : 'No questions yet'}
              text={tab === 'open' ? 'New questions from buyers show up here.' : 'Buyers can ask about a product on its page.'}
            />
          ) : (
            <View style={styles.list} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
              {data.items.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  draft={drafts[q.id]}
                  onDraft={(text) => setDrafts((d) => ({ ...d, [q.id]: text }))}
                  onAnswer={() => answer(q)}
                  onHide={() => setHiding(q)}
                  onProduct={() => q.product?.slug && router.push(`/product/${q.product.slug}`)}
                  busy={busyId === q.id}
                  focus={q.id === focusId}
                  last={i === data.items.length - 1}
                  onLayout={onItemLayout(q)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <OrderConfirmDialog
        open={Boolean(hiding)}
        title="Hide this question?"
        message="It disappears from the product page. Use this for spam or rude questions."
        confirmLabel="Hide"
        danger
        loading={hideBusy}
        onConfirm={confirmHide}
        onCancel={() => setHiding(null)}
      />
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  // .sq-tabs
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tab: {
    minHeight: 39, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  tabOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  tabText: { fontSize: 13.5, lineHeight: 20, color: t.neutral[600], ...font(500) },
  tabTextOn: { color: t.primary[700] },

  loading: { gap: 10, padding: 20 },
  // .sq-list
  list: { gap: 12 },
}));
