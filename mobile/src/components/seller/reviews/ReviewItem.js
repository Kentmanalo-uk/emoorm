import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { PaperPlaneTiltIcon, PencilSimpleIcon, StarIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';

/*
 * One review on the seller's Reviews page (web/src/pages/SellerReviews.jsx
 * .reviews-item; SellerDashboard.css at phone size): the stars, the buyer
 * (to their profile), the day, the product, the comment, then the seller's
 * reply with Edit reply, or Reply, or the reply form.
 */

export function Stars({ value, size = 13 }) {
  return (
    <View style={styles.stars}>
      {Array.from({ length: 5 }).map((_, i) => {
        const on = i < (value || 0);
        return <StarIcon key={i} size={size} weight={on ? 'fill' : 'regular'} color={on ? t.warning[500] : t.neutral[300]} />;
      })}
    </View>
  );
}

// toLocaleDateString() as the website shows it in en-US: "10/9/2026".
const shortDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
};

export default function ReviewItem({
  review: r, open, draft, saving, onDraft, onStart, onCancel, onSubmit, onOpenBuyer, onOpenProduct,
}) {
  const name = r.user?.fullName || 'Buyer';
  return (
    <View style={styles.item}>
      <View style={styles.head}>
        <Stars value={r.rating} />
        {r.user?.id ? (
          <Text style={styles.name} accessibilityRole="link" accessibilityHint="View buyer profile" onPress={() => onOpenBuyer?.(r.user.id)}>{name}</Text>
        ) : (
          <Text style={styles.name}>{name}</Text>
        )}
        <Text style={styles.date}>{r.createdAt ? shortDate(r.createdAt) : ''}</Text>
      </View>

      {r.product?.name ? (
        <Text style={styles.product}>
          on{' '}
          {r.product.slug ? (
            <Text style={styles.productLink} accessibilityRole="link" onPress={() => onOpenProduct?.(r.product.slug)}>{r.product.name}</Text>
          ) : r.product.name}
        </Text>
      ) : null}
      {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}

      {r.sellerReply && !open ? (
        <View style={styles.reply}>
          <Text style={styles.replyLabel}>Your reply</Text>
          <Text style={styles.replyText}>{r.sellerReply}</Text>
          <Pressable accessibilityRole="button" onPress={onStart} style={styles.edit}>
            <PencilSimpleIcon size={12} color={t.neutral[500]} />
            <Text style={styles.editText}>Edit reply</Text>
          </Pressable>
        </View>
      ) : null}

      {open ? (
        <View style={styles.form}>
          <TextInput
            value={draft}
            onChangeText={onDraft}
            maxLength={1000}
            multiline
            textAlignVertical="top"
            placeholder="Write a public reply to this review…"
            placeholderTextColor={t.neutral[400]}
            style={styles.textarea}
            autoFocus
          />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={[styles.btn, styles.btnOutline, saving && styles.off]}>
              <Text style={[styles.btnText, styles.btnTextOutline]}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={onSubmit} style={[styles.btn, styles.btnPrimary, saving && styles.off]}>
              {saving ? <ActivityIndicator size={14} color="#fff" /> : <PaperPlaneTiltIcon size={14} color="#fff" />}
              <Text style={[styles.btnText, styles.btnTextPrimary]}>Post Reply</Text>
            </Pressable>
          </View>
        </View>
      ) : !r.sellerReply ? (
        <Pressable accessibilityRole="button" onPress={onStart} style={styles.trigger}>
          <PaperPlaneTiltIcon size={13} color={t.primary[600]} />
          <Text style={styles.triggerText}>Reply</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  stars: { flexDirection: 'row', gap: 2 },

  // .reviews-item (phones: 12px corners)
  item: { padding: 14, borderWidth: 1, borderColor: t.neutral[100], borderRadius: 12, backgroundColor: t.neutral[0] },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, marginBottom: 4 },
  name: { flexShrink: 1, marginLeft: 6, fontSize: 13, lineHeight: 18, ...font(700), color: t.neutral[900] },
  date: { marginLeft: 'auto', fontSize: 12, lineHeight: 17, ...font(400), color: t.neutral[500] },
  product: { marginBottom: 4, fontSize: 12, lineHeight: 17, ...font(400), color: t.neutral[500] },
  productLink: { color: t.primary[600] },
  comment: { fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[700] },

  // .reviews-seller-reply
  reply: {
    marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.success[200], borderRadius: 8,
    backgroundColor: t.success[50],
  },
  replyLabel: { fontSize: 11.5, lineHeight: 16, ...font(700), letterSpacing: 0.35, textTransform: 'uppercase', color: t.primary[700] },
  replyText: { marginTop: 4, marginBottom: 6, fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[700] },
  edit: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, minHeight: 36 },
  editText: { fontSize: 11.5, lineHeight: 16, ...font(400), color: t.neutral[500] },

  // .reviews-reply-trigger
  trigger: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 36, marginTop: 8 },
  triggerText: { fontSize: 12.5, lineHeight: 17, ...font(600), color: t.primary[600] },

  // .reviews-reply-form
  form: { marginTop: 10, gap: 8 },
  textarea: {
    minHeight: 90, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8,
    backgroundColor: t.neutral[0], fontSize: 16, ...font(400), color: t.neutral[900],
  },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 40, paddingVertical: 9, paddingHorizontal: 18, borderRadius: 999,
  },
  btnOutline: { borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0] },
  btnPrimary: { backgroundColor: t.primary[600] },
  off: { opacity: 0.6 },
  btnText: { fontSize: 13.5, lineHeight: 18 },
  btnTextOutline: { ...font(500), color: t.neutral[700] },
  btnTextPrimary: { ...font(600), color: t.onBrand },
}));
