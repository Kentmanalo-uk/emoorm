import { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Image, Linking, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  EyeIcon, MapPinIcon, PackageIcon, PhoneIcon, StorefrontIcon, UserIcon,
} from '../../../lib/icons';
import { resolveImg } from '../../../lib/media';
import { variationImage } from '../../../lib/variationImage';
import { spanLabel } from '../../../lib/availability';
import { colors, font, t, themed } from '../../../theme';
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
export const STATUS_INK = themed(() => ({
  pending: t.warning[600],
  confirmed: t.info[600],
  preparing: t.indigo[500],
  ready: t.teal[600],
  completed: t.primary[600],
  cancelled: t.danger[600],
}));

/** The solid pills of the details sheet (.seller-badge--solid.status-*). */
export const STATUS_FILL = themed(() => ({
  pending: t.warning[500],
  confirmed: t.info[600],
  preparing: t.indigo[500],
  ready: t.teal[600],
  completed: t.primary[600],
  cancelled: t.danger[600],
}));

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

/**
 * The order's picture (.soc-pic on the website): one photo at a size worth
 * looking at, with a count when there is more than one item.
 *
 * It used to be three small thumbnails overlapping. Three stamps of 44px
 * tell you less than one picture of 72 does -- a seller glancing down a
 * list is recognising the thing they packed, and the second and third
 * photos were never legible enough to help with that.
 */
function OrderPicture({ items }) {
  const first = items[0];
  const src = first ? resolveImg(variationImage(first.product, first.selectedVariations)) : null;
  const [broken, setBroken] = useState(false);
  return (
    <View style={styles.pic}>
      {src && !broken ? (
        <Image
          source={{ uri: src }}
          style={styles.picImg}
          onError={() => setBroken(true)}
          accessibilityLabel={first?.product?.name || 'Product'}
        />
      ) : (
        <PackageIcon size={24} color={t.neutral[400]} />
      )}
      {items.length > 1 ? <Text style={styles.picMore}>+{items.length - 1}</Text> : null}
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
  const pickup = order.fulfillmentMethod === 'PICKUP';
  const phone = order.contactNumber || order.buyer?.contactNumber;
  // Held: every item, the buyer and the total, with Details and the next step.
  const peek = useSellerOrderPeek()(order, { statusColor: STATUS_INK[s.cls], onDetails, onNext });

  // The order that just moved to this tab: a mint wash that fades out
  // (@keyframes so-moved, 3s) and a green edge on the left.
  const wash = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!moved) return undefined;
    wash.setValue(1);
    // Opacity, not backgroundColor: a colour cannot be animated by the
    // native driver, so the old version ran this 3-second fade on the JS
    // thread -- on a card in a list, while the seller is scrolling it.
    // The wash is now a mint sheet over the card whose opacity fades,
    // which looks the same and runs off the JS thread entirely.
    const anim = Animated.timing(wash, { toValue: 0, duration: 3000, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [moved, wash]);


  return (
    <Animated.View style={styles.card}>
      {moved ? <Animated.View pointerEvents="none" style={[styles.wash, { opacity: wash }]} /> : null}
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
        <OrderPicture items={items} />
        <View style={styles.summary}>
          {items.length === 0 ? (
            <Text style={styles.productName}>No items</Text>
          ) : (
            <>
              <Text style={styles.productName} numberOfLines={2}>
                {items[0].product?.name || 'Product'}
              </Text>
              <Text style={styles.productMeta}>
                {items.length} {one ? 'item' : 'items'} · {one && ['LIVESTOCK', 'PACKAGE'].includes(lineKind(items[0])) ? countLabel(items[0]) : `Qty ${totalQty}`}
              </Text>
            </>
          )}
        </View>
        <Text style={styles.total}>{money(order.total)}</Text>
      </Pressable>

      {/* Who ordered it and where it goes -- the two things a seller is
          actually deciding on, and the delivery address was not on the
          card at all before: it meant opening every order to find out
          whether it was near enough to take on. */}
      <View style={styles.lines}>
        <View style={styles.line}>
          <UserIcon size={15} color={t.neutral[500]} />
          {order.buyer?.id ? (
            <Text
              style={[styles.lineText, styles.lineLink]}
              numberOfLines={1}
              accessibilityRole="link"
              accessibilityHint="View buyer profile"
              onPress={() => router.push(`/u/${order.buyer.id}`)}
            >
              {order.buyer.fullName || 'Buyer'}
            </Text>
          ) : (
            <Text style={styles.lineText} numberOfLines={1}>{order.buyer?.fullName || 'Buyer'}</Text>
          )}
        </View>
        <View style={styles.line}>
          {pickup
            ? <StorefrontIcon size={15} color={t.neutral[500]} />
            : <MapPinIcon size={15} color={t.neutral[500]} />}
          <Text style={styles.lineText} numberOfLines={2}>
            {pickup ? 'Picking up at your shop' : (order.deliveryAddress || 'No address given')}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {phone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Call ${order.buyer?.fullName || 'the buyer'} at ${phone}`}
            onPress={() => Linking.openURL(`tel:${String(phone).replace(/[^+\d]/g, '')}`).catch(() => {})}
            style={({ pressed }) => [styles.btn, styles.details, pressed && styles.detailsPressed]}
          >
            <PhoneIcon size={15} color={t.neutral[600]} />
            <Text style={styles.detailsText}>Call</Text>
          </Pressable>
        ) : null}
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

const styles = themed(() => StyleSheet.create({
  // The row as a card on phones: out to the screen edges, 12px corners, a faint shadow.
  card: {
    marginHorizontal: -12, paddingTop: 14, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(149, 157, 165, 0.06)' }],
  },
  // The mint sheet that fades out on an order that just moved here.
  wash: { ...StyleSheet.absoluteFill, borderRadius: 12, backgroundColor: 'rgb(209, 250, 229)' },
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
  // One picture, big enough to recognise what was packed (.soc-pic).
  pic: {
    width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  picImg: { ...StyleSheet.absoluteFill },
  picMore: {
    position: 'absolute', right: 0, bottom: 0,
    paddingHorizontal: 6, paddingVertical: 1,
    borderTopLeftRadius: 8,
    fontSize: 11, lineHeight: 17.6, ...font(700),
    color: colors.white, backgroundColor: 'rgba(17, 24, 39, 0.72)',
  },
  summary: { flex: 1, minWidth: 0, gap: 2 },
  productName: { fontSize: 14, lineHeight: 19.6, ...font(500), color: t.neutral[900] },
  productMeta: { fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.neutral[500] },
  total: { fontSize: 16, lineHeight: 25.6, ...font(700), color: t.neutral[900] },

  // Who ordered, and where it goes (.soc-lines).
  lines: { gap: 5 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  lineText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18.2, ...font(400), color: t.neutral[700] },
  lineLink: { ...font(500), color: t.neutral[900] },

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
  nextText: { flexShrink: 1, fontSize: 13.5, lineHeight: 20, ...font(600), color: t.onBrand },

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
}));
