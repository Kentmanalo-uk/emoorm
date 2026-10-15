import { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { EyeIcon, PackageIcon } from 'phosphor-react-native';
import { resolveImg } from '../../../lib/media';
import { variationImage } from '../../../lib/variationImage';
import { spanLabel } from '../../../lib/availability';
import { font, t } from '../../../theme';
import TimeLeft from './TimeLeft';
import {
  ACTION_LABELS, statusOf, cookingFor, countLabel, etaLabel, lineKind, money, nextStep, orderNo, shortDate,
} from './sellerOrderLib';
import { PageLoader } from '../../BrandLoader';
import { useSellerOrderPeek } from '../../peek/SellerOrderPeek';

/*
 * One order in the seller's list on phones: the website's table row turned
 * into a card (web/src/pages/SellerOrders.css "Order list: each table row
 * becomes a card", layout/SellerMobile.css "── Orders", SellerPhoneFit.css):
 *
 *   #order number · day · Today/Paluto      status in coloured words
 *   [product photos  name +N more / N items · Qty N]   (grey block)
 *   buyer name / their number                 ₱total
 *   [ Details ] [ next step ]
 *
 * Also here: TodayTag / CookTag (the Available Today and paluto timing) and
 * the list's loading skeleton (Skeleton.Table at phone width).
 */

/** The coloured words of a status (.seller-badge--solid inside the card). */
export const STATUS_INK = {
  pending: t.warning[600],
  confirmed: t.info[600],
  preparing: t.indigo[500],
  ready: t.teal[600],
  completed: t.primary[600],
  cancelled: t.danger[600],
};

/** The solid pills of the details sheet (.seller-badge--solid.status-*). */
export const STATUS_FILL = {
  pending: t.warning[500],
  confirmed: t.info[600],
  preparing: t.indigo[500],
  ready: t.teal[600],
  completed: t.primary[600],
  cancelled: t.danger[600],
};

// Available Today orders carry a time to confirm by (respondBy); unconfirmed
// by then, they cancel on their own.
export function TodayTag({ order }) {
  if (!order?.respondBy) return null;
  const waiting = order.status === 'PENDING';
  const ready = !waiting && order.etaFrom && !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(order.status);
  return (
    <View style={styles.today}>
      <Text style={styles.todayBadge}>Today</Text>
      {waiting ? <TimeLeft until={order.respondBy} prefix="Confirm in" style={styles.todayDue} /> : null}
      {ready ? <Text style={styles.todayReady}>Ready {spanLabel(order.etaFrom, order.etaTo || order.etaFrom)}</Text> : null}
    </View>
  );
}

// Paluto is cooked after the order: when the buyer expects it.
export function CookTag({ order }) {
  if (!cookingFor(order)) return null;
  return (
    <View style={styles.today}>
      <Text style={[styles.todayBadge, styles.cookBadge]}>Paluto</Text>
      <Text style={styles.todayReady}>Ready {etaLabel(order)}</Text>
    </View>
  );
}

/** A product photo (.so-product-thumb): hidden on a broken link, a box icon without one. */
function Thumb({ item }) {
  // The chosen option's own photo when it has one.
  const src = resolveImg(variationImage(item.product, item.selectedVariations));
  const [broken, setBroken] = useState(false);
  return (
    <View style={styles.thumb}>
      {src && !broken ? (
        <Image source={{ uri: src }} style={styles.thumbImg} onError={() => setBroken(true)} accessibilityLabel={item.product?.name || 'Product'} />
      ) : null}
      {!src ? <PackageIcon size={14} color={t.neutral[500]} /> : null}
    </View>
  );
}

function OrderCard({
  order, selected = false, moved = false, updating = false, onDetails, onNext,
}) {
  const router = useRouter();
  const s = statusOf(order);
  const next = nextStep(order);
  const items = order.items || [];
  const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const one = items.length === 1;
  // Held: every item, the buyer and the total, with Details and the next step.
  const peek = useSellerOrderPeek()(order, { statusColor: STATUS_INK[s.cls], onDetails, onNext });

  // The order that just moved to this tab: a mint wash that fades out
  // (@keyframes so-moved, 3s) and a green edge on the left.
  const wash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!moved) return undefined;
    wash.setValue(1);
    const anim = Animated.timing(wash, { toValue: 0, duration: 3000, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
  }, [moved, wash]);
  const washColor = wash.interpolate({ inputRange: [0, 1], outputRange: ['rgba(209, 250, 229, 0)', 'rgba(209, 250, 229, 1)'] });

  return (
    <Animated.View style={[styles.card, moved && { backgroundColor: washColor }]}>
      <View style={styles.top}>
        <View style={styles.num}>
          <Text style={styles.numText}>#{orderNo(order)}</Text>
          {order.createdAt ? <Text style={styles.date}>{shortDate(order.createdAt)}</Text> : null}
          <TodayTag order={order} />
          <CookTag order={order} />
        </View>
        <Text style={[styles.status, { color: STATUS_INK[s.cls] || t.neutral[600] }]}>{s.label}</Text>
      </View>

      <Pressable style={styles.products} {...peek} onPress={() => onDetails?.(order)} accessibilityLabel={`Order ${orderNo(order)} items`}>
        <View style={styles.thumbs}>
          {items.slice(0, 3).map((it, i) => (
            <View key={it.id || i} style={i > 0 && styles.overlap}><Thumb item={it} /></View>
          ))}
          {items.length > 3 ? (
            <View style={[styles.thumb, styles.more, styles.overlap]}>
              <Text style={styles.moreText}>+{items.length - 3}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.summary}>
          {items.length === 0 ? (
            <Text style={styles.productName}>No items</Text>
          ) : (
            <>
              <Text style={styles.productName} numberOfLines={1}>
                {items[0].product?.name || 'Product'}
                {items.length > 1 ? <Text style={styles.productExtra}> +{items.length - 1} more</Text> : null}
              </Text>
              <Text style={styles.productMeta}>
                {items.length} {one ? 'item' : 'items'} · {one && ['LIVESTOCK', 'PACKAGE'].includes(lineKind(items[0])) ? countLabel(items[0]) : `Qty ${totalQty}`}
              </Text>
            </>
          )}
        </View>
      </Pressable>

      <View style={styles.mid}>
        <View style={styles.buyer}>
          {order.buyer?.id ? (
            <Text
              style={styles.buyerName}
              numberOfLines={1}
              accessibilityRole="link"
              accessibilityHint="View buyer profile"
              onPress={() => router.push(`/u/${order.buyer.id}`)}
            >
              {order.buyer.fullName || 'Buyer'}
            </Text>
          ) : (
            <Text style={styles.buyerName} numberOfLines={1}>{order.buyer?.fullName || 'Buyer'}</Text>
          )}
          {order.buyer?.contactNumber ? <Text style={styles.buyerMeta}>{order.buyer.contactNumber}</Text> : null}
        </View>
        <Text style={styles.total}>{money(order.total)}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View order details"
          onPress={() => onDetails?.(order)}
          style={({ pressed }) => [styles.btn, styles.details, pressed && styles.detailsPressed]}
        >
          <EyeIcon size={15} color={t.neutral[600]} />
          <Text style={styles.detailsText}>Details</Text>
        </Pressable>
        {next ? (
          <Pressable
            accessibilityRole="button"
            disabled={updating}
            onPress={() => onNext?.(order, next)}
            style={({ pressed }) => [styles.btn, styles.next, pressed && styles.nextPressed, updating && styles.nextBusy]}
          >
            {updating ? <ActivityIndicator size={14} color="#fff" /> : null}
            <Text style={styles.nextText} numberOfLines={1}>{ACTION_LABELS[next]?.label || next}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Picked out: a 2px green ring that does not change the card's size. */}
      {selected ? <View pointerEvents="none" style={styles.ring} /> : null}
      {moved ? <View pointerEvents="none" style={styles.edge} /> : null}
    </Animated.View>
  );
}

export default memo(OrderCard);

/**
 * Loading: Skeleton.Table (cols 6, rows 6) at phone width: a header strip,
 * then rows of a round picture with two lines and two shorter lines.
 */
export function OrdersSkeleton({ rows = 6 }) {
  return <PageLoader minHeight={320} label="Loading orders" />;
}

const styles = StyleSheet.create({
  // The row as a card on phones: out to the screen edges, 12px corners, a faint shadow.
  card: {
    marginHorizontal: -12, paddingTop: 14, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(149, 157, 165, 0.06)' }],
  },
  ring: { ...StyleSheet.absoluteFill, borderRadius: 12, borderWidth: 2, borderColor: t.primary[600] },
  edge: { ...StyleSheet.absoluteFill, borderRadius: 12, borderLeftWidth: 3, borderColor: t.primary[600] },

  top: { flexDirection: 'row', gap: 12 },
  num: { flex: 1, minWidth: 0 },
  numText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[500] },
  date: { marginTop: 2, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  status: { textAlign: 'right', fontSize: 13.5, lineHeight: 21.6, ...font(600) },

  today: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 6, marginTop: 4 },
  todayBadge: {
    paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.accent[50], color: t.accent[700], fontSize: 11.5, lineHeight: 18.4, ...font(600),
  },
  cookBadge: { backgroundColor: t.warning[50], color: t.warning[700] },
  todayDue: { fontSize: 12, lineHeight: 19.2, ...font(500), color: t.accent[700] },
  todayReady: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[600] },

  products: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12, padding: 10, borderRadius: 10, backgroundColor: t.neutral[50],
  },
  thumbs: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  overlap: { marginLeft: -8 },
  thumb: {
    width: 44, height: 44, borderRadius: 8, borderWidth: 2, borderColor: t.neutral[0], overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(149, 157, 165, 0.06)' }],
  },
  thumbImg: { ...StyleSheet.absoluteFill },
  more: { backgroundColor: t.neutral[200] },
  moreText: { fontSize: 11, lineHeight: 17.6, ...font(600), color: t.neutral[600] },
  summary: { flex: 1, minWidth: 0, gap: 2 },
  productName: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  productExtra: { fontSize: 12, ...font(400), color: t.neutral[500] },
  productMeta: { fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.neutral[500] },

  mid: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  buyer: { flex: 1, minWidth: 0, gap: 2 },
  buyerName: { fontSize: 14.5, lineHeight: 23.2, ...font(500), color: t.neutral[900] },
  buyerMeta: { fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.neutral[500] },
  total: { fontSize: 16, lineHeight: 25.6, ...font(700), color: t.neutral[900] },

  actions: {
    flexDirection: 'row', gap: 8, marginTop: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  btn: {
    flex: 1, flexBasis: 0, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    height: 42, paddingHorizontal: 14, borderRadius: 10,
  },
  details: { borderWidth: 1, borderColor: t.neutral[200] },
  detailsPressed: { backgroundColor: t.neutral[100] },
  detailsText: { fontSize: 13.5, lineHeight: 20, ...font(600), color: t.neutral[600] },
  next: { backgroundColor: t.primary[600] },
  nextPressed: { backgroundColor: t.primary[700] },
  nextBusy: { opacity: 0.6 },
  nextText: { flexShrink: 1, fontSize: 13.5, lineHeight: 20, ...font(600), color: '#fff' },

  skTable: { width: '100%', borderRadius: 10, overflow: 'hidden', backgroundColor: t.neutral[0] },
  skRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  skHead: { paddingVertical: 10, backgroundColor: t.neutral[50] },
  skLast: { borderBottomWidth: 0 },
  // grid-template-columns: 1.4fr 1fr 0.6fr (the first three cells at ≤600px)
  skUser: { flex: 1.4, minWidth: 0 },
  skUserRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skLines: { flex: 1, minWidth: 0, gap: 5, overflow: 'hidden' },
  skCell: { flex: 1, minWidth: 0 },
  sk: { backgroundColor: t.neutral[150] },
});
