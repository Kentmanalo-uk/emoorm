import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { QuestionIcon, StorefrontIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import useAuthStore from '../../store/authStore';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';
import ProductSection, { SectionBody, SectionHead, SectionTitle } from './ProductSection';
import { longDate } from './productLib';

/**
 * Product page: questions buyers asked and the shop's answers, and a box to
 * ask one (web/src/components/product/ProductQuestions.jsx). Your own
 * unanswered questions show to you as "waiting".
 */
export default function ProductQuestions({ product, isOwnProduct = false, sectionRef }) {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get(`/questions/product/${product.id}`)
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch(() => { if (!cancelled) setData({ items: [], total: 0 }); });
    return () => { cancelled = true; };
  }, [product.id, isAuthenticated]);

  const ask = async () => {
    if (!isAuthenticated) {
      router.push(`/login?redirect=${encodeURIComponent(`/product/${product.slug}`)}`);
      return;
    }
    setSending(true);
    try {
      const res = await apiClient.post(`/questions/product/${product.id}`, { question: draft.trim() });
      setData((d) => ({ ...d, items: [res.data, ...(d?.items || [])], total: (d?.total || 0) + 1 }));
      setDraft('');
      toast.success('Sent to the shop. You will be notified when they answer.');
    } catch (err) {
      toast.error(err.message || 'Could not send your question');
    } finally {
      setSending(false);
    }
  };

  const items = data?.items || [];
  const disabled = sending || draft.trim().length < 5;

  return (
    <ProductSection sectionRef={sectionRef}>
      <SectionHead><SectionTitle count={data?.total}>Questions</SectionTitle></SectionHead>
      <SectionBody>
        {!isOwnProduct ? (
          <View style={styles.ask}>
            <TextInput
              value={draft}
              maxLength={500}
              onChangeText={setDraft}
              placeholder="Ask the shop about this product, e.g. How ripe are they?"
              placeholderTextColor={t.neutral[500]}
              accessibilityLabel="Your question"
              returnKeyType="send"
              onSubmitEditing={() => { if (!disabled) ask(); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[styles.input, focused && styles.inputFocus]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={disabled}
              onPress={ask}
              style={[styles.button, disabled && styles.buttonOff]}
            >
              <Text style={styles.buttonText}>{sending ? 'Sending…' : 'Ask'}</Text>
            </Pressable>
          </View>
        ) : null}
        {data === null ? null : items.length === 0 ? (
          <View style={styles.empty}>
            <QuestionIcon size={18} color={t.neutral[500]} />
            <Text style={styles.emptyText}>No questions yet.</Text>
          </View>
        ) : (
          <View>
            {items.map((q, i) => (
              <View key={q.id} style={[styles.item, i === 0 && styles.itemFirst]}>
                <View style={styles.qa}>
                  <View style={styles.badge}><Text style={styles.badgeText}>Q</Text></View>
                  <View style={styles.qaText}>
                    <Text style={styles.q}>{q.question}</Text>
                    <Text style={styles.small}>{q.askedBy}{q.mine ? ' (you)' : ''} · {longDate(q.createdAt)}</Text>
                  </View>
                </View>
                {q.answer ? (
                  <View style={[styles.qa, styles.aRow]}>
                    <View style={[styles.badge, styles.badgeA]}><StorefrontIcon size={13} weight="fill" color={t.primary[700]} /></View>
                    <View style={styles.qaText}>
                      <Text style={[styles.q, styles.a]}>{q.answer}</Text>
                      <Text style={styles.small}>The shop · {longDate(q.answeredAt)}</Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.waiting}>Waiting for the shop to answer</Text>
                )}
              </View>
            ))}
          </View>
        )}
      </SectionBody>
    </ProductSection>
  );
}

const styles = StyleSheet.create({
  ask: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  input: {
    flex: 1, minWidth: 0, height: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    fontSize: 14, ...font(400), color: t.neutral[900], backgroundColor: '#fff', outlineStyle: 'none',
  },
  inputFocus: { borderColor: t.primary[600] },
  button: { height: 46, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },
  buttonOff: { opacity: 0.5 },
  buttonText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: '#fff' },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyText: { fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500] },
  item: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  itemFirst: { paddingTop: 0, borderTopWidth: 0 },
  qa: { flexDirection: 'row', gap: 10 },
  aRow: { marginTop: 8 },
  badge: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  badgeA: { backgroundColor: t.primary[50] },
  badgeText: { fontSize: 12, lineHeight: 14, ...font(500), color: t.neutral[600] },
  qaText: { flex: 1, minWidth: 0 },
  q: { fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[900] },
  a: { color: t.neutral[700] },
  small: { marginTop: 2, fontSize: 12, lineHeight: 18, ...font(400), color: t.neutral[500] },
  waiting: { marginTop: 6, marginLeft: 32, fontSize: 12.5, lineHeight: 18.75, ...font(400), fontStyle: 'italic', color: t.neutral[500] },
});
