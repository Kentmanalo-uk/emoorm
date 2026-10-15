import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { EyeSlashIcon, QuestionIcon } from 'phosphor-react-native';
import { resolveImg } from '../../../lib/media';
import { font, t } from '../../../theme';
import { shortDate } from '../analytics/format';

/** The first picture of a product's images (web lib/media firstImage). */
export const firstImage = (raw) => {
  if (Array.isArray(raw)) return raw[0] || null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed[0] || null : raw;
    } catch {
      return raw;
    }
  }
  return null;
};

/**
 * One buyer question (web/src/pages/SellerQuestions.jsx .sq-item,
 * SellerQuestions.css; a full-width section on Seller Center phones): the
 * product, the question, who asked and when, the answer box, then Hide and
 * Answer / Update answer.
 */
export default function QuestionCard({
  question: q, draft, onDraft, onAnswer, onHide, onProduct, busy, focus, last, onLayout,
}) {
  const value = draft ?? q.answer ?? '';
  const image = resolveImg(firstImage(q.product?.images));
  const canSend = !busy && Boolean(String(value).trim());
  return (
    <View onLayout={onLayout} style={[styles.item, last && styles.itemLast, focus && styles.focus]}>
      <Pressable accessibilityRole="link" onPress={onProduct} style={styles.product}>
        {image ? <Image source={{ uri: image }} style={styles.thumb} resizeMode="cover" /> : <View style={styles.thumb} />}
        <Text style={styles.productName} numberOfLines={2}>{q.product?.name}</Text>
      </Pressable>

      <View style={styles.question}>
        <QuestionIcon size={16} weight="fill" color={t.info[500]} style={styles.questionIcon} />
        <Text style={styles.questionText}>{q.question}</Text>
      </View>
      <Text style={styles.meta}>{`${q.askedBy} · ${shortDate(q.createdAt)}`}</Text>

      <TextInput
        value={value}
        onChangeText={onDraft}
        placeholder="Your answer"
        placeholderTextColor={t.neutral[400]}
        maxLength={1000}
        multiline
        textAlignVertical="top"
        style={styles.input}
      />

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onHide} style={({ pressed }) => [styles.btn, styles.outline, pressed && styles.outlinePressed]}>
          {({ pressed }) => (
            <>
              <EyeSlashIcon size={15} color={pressed ? t.primary[700] : t.neutral[700]} />
              <Text style={[styles.outlineText, pressed && { color: t.primary[700] }]}>Hide</Text>
            </>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onAnswer}
          style={({ pressed }) => [styles.btn, styles.primary, pressed && styles.primaryPressed, !canSend && styles.off]}
        >
          <Text style={styles.primaryText}>{q.answer ? 'Update answer' : 'Answer'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // .seller-card.sq-item: edge to edge on phones, an 8px grey band under it.
  item: {
    gap: 8, marginHorizontal: -12, padding: 16, backgroundColor: t.neutral[0],
    borderBottomWidth: 8, borderBottomColor: t.neutral[100],
  },
  itemLast: { borderBottomWidth: 0 },
  // .sq-item.is-focus: a 2px green ring.
  focus: { boxShadow: `inset 0 0 0 2px ${t.primary[500]}` },
  product: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: t.neutral[100] },
  productName: { flex: 1, fontSize: 13, lineHeight: 19.5, color: t.neutral[600], ...font(500) },
  question: { flexDirection: 'row', gap: 8 },
  questionIcon: { marginTop: 3 },
  questionText: { flex: 1, fontSize: 15, lineHeight: 22.5, color: t.neutral[900], ...font(400) },
  meta: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
  input: {
    minHeight: 104, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    fontSize: 14, lineHeight: 21, color: t.neutral[900], backgroundColor: t.neutral[0], ...font(400),
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 999 },
  outline: { borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0] },
  outlinePressed: { borderColor: t.primary[600] },
  outlineText: { fontSize: 13.5, lineHeight: 18, color: t.neutral[700], ...font(500) },
  primary: { backgroundColor: t.primary[600] },
  primaryPressed: { backgroundColor: t.primary[700] },
  primaryText: { fontSize: 13.5, lineHeight: 18, color: t.neutral[0], ...font(600) },
  off: { opacity: 0.6 },
});
