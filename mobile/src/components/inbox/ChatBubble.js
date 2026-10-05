import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CheckIcon, ChecksIcon, PushPinIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';
import ChatProductThumb from './ChatProductThumb';
import { formatClock, formatMoney, ORDER_STATUS_STYLES } from './inboxFormat';

/*
 * One message in a chat on phones (web Messenger.jsx MessageBubble with the
 * phone rules of Messenger.css): grey on the left from the other side,
 * green on the right from you, with an order, a product card, a photo and
 * the text, then the time (and Sent / Seen ticks on yours).
 */

const PHOTO_MAX = 220;
const PHOTO_MAX_HEIGHT = 300;

/** A sent photo: 220 wide at most, its own shape, never taller than 300. */
function BubblePhoto({ uri, onOpen }) {
  const [ratio, setRatio] = useState(null);
  useEffect(() => {
    let live = true;
    Image.getSize(uri, (w, h) => { if (live && w && h) setRatio(w / h); }, () => { if (live) setRatio(1); });
    return () => { live = false; };
  }, [uri]);
  const height = Math.min(PHOTO_MAX_HEIGHT, ratio ? PHOTO_MAX / ratio : PHOTO_MAX * 0.75);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open photo" onPress={onOpen} style={styles.photo}>
      <Image source={{ uri }} style={{ width: PHOTO_MAX, height }} resizeMode="cover" accessibilityLabel="Sent photo" />
    </Pressable>
  );
}

export default function ChatBubble({ message, isSelf, seen, onOpenImage }) {
  const router = useRouter();
  const product = message.product;
  const hasMedia = Boolean(message.imageUrl);
  const mediaOnly = hasMedia && !message.body && !product && !message.order;
  const photo = hasMedia ? resolveImg(message.imageUrl) || message.imageUrl : null;

  return (
    <View style={[styles.row, isSelf && styles.rowSelf]}>
      <View style={[styles.bubble, isSelf && styles.bubbleSelf, mediaOnly && styles.mediaOnly]}>
        {message.order ? (
          <View style={[styles.order, isSelf && styles.orderSelf]}>
            <PushPinIcon size={11} color={isSelf ? t.neutral[0] : t.warning[800]} />
            <View>
              <Text style={[styles.orderNum, isSelf && styles.onSelf]}>Order #{message.order.orderNumber}</Text>
              <Text style={[styles.orderMeta, isSelf && styles.onSelf]}>
                {ORDER_STATUS_STYLES[message.order.status]?.label || message.order.status}
                {' · '}
                {formatMoney(message.order.total)}
              </Text>
            </View>
          </View>
        ) : null}
        {product ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push(`/product/${product.slug}`)}
            style={styles.product}
          >
            <View style={styles.productImg}><ChatProductThumb src={product.image} style={styles.fill} /></View>
            <View style={styles.productText}>
              <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
              <Text style={styles.productPrice}>{formatMoney(product.price)}</Text>
            </View>
          </Pressable>
        ) : null}
        {photo ? <BubblePhoto uri={photo} onOpen={() => onOpenImage(message.imageUrl)} /> : null}
        {message.body ? <Text style={[styles.text, isSelf && styles.onSelf]} selectable>{message.body}</Text> : null}
        <View style={[styles.time, mediaOnly && styles.timeMedia]}>
          <Text style={[styles.timeText, isSelf && styles.timeSelf]}>{formatClock(message.createdAt)}</Text>
          {isSelf ? (seen ? (
            <View style={styles.check} accessibilityLabel="Seen"><ChecksIcon size={13} weight="bold" color={t.success[200]} /></View>
          ) : (
            <View style={styles.check} accessibilityLabel="Sent"><CheckIcon size={12} weight="bold" color="rgba(255, 255, 255, 0.9)" /></View>
          )) : null}
        </View>
      </View>
    </View>
  );
}

/** "Today", "Yesterday" or the date, between the days of a chat (.msgr-day). */
export function ChatDay({ label }) {
  return (
    <View style={styles.day}>
      <Text style={styles.dayText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  rowSelf: { flexDirection: 'row-reverse' },
  bubble: {
    maxWidth: '78%',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: t.neutral[100],
    boxShadow: '0px 1px 1px rgba(15, 23, 42, 0.04)',
  },
  bubbleSelf: { backgroundColor: t.primary[600] },
  mediaOnly: { padding: 4 },
  onSelf: { color: t.neutral[0] },
  text: { fontSize: 14, lineHeight: 21, color: t.neutral[900], ...font(400) },
  order: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8,
    backgroundColor: t.warning[100],
  },
  orderSelf: { backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  orderNum: { fontSize: 12, lineHeight: 18, color: t.warning[800], ...font(500) },
  orderMeta: { fontSize: 11.5, lineHeight: 17.25, color: t.warning[800], opacity: 0.9, ...font(400) },
  product: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 180, padding: 8, borderRadius: 10,
    borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  productImg: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  fill: { width: '100%', height: '100%' },
  productText: { flexShrink: 1, minWidth: 0, gap: 2 },
  productName: { fontSize: 13.5, lineHeight: 17.55, color: t.neutral[900], ...font(400) },
  productPrice: { fontSize: 13, lineHeight: 19.5, color: t.primary[700], ...font(500) },
  photo: { maxWidth: PHOTO_MAX, borderRadius: 10, overflow: 'hidden', backgroundColor: t.neutral[100] },
  time: { flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-end' },
  timeMedia: { paddingVertical: 2, paddingHorizontal: 6 },
  timeText: { fontSize: 11, lineHeight: 16.5, color: t.neutral[500], ...font(400) },
  timeSelf: { color: 'rgba(255, 255, 255, 0.85)' },
  check: { marginLeft: 4 },
  day: { alignItems: 'center', marginTop: 6, marginBottom: 2 },
  dayText: {
    paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999, overflow: 'hidden', backgroundColor: t.neutral[100],
    fontSize: 11.5, lineHeight: 18.4, color: t.neutral[500], ...font(500),
  },
});
