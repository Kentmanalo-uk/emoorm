import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRightIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import ProductImage from '../ProductImage';
import { OrderBadge, cardShadow } from '../orders/OrderBits';
import { longDate } from '../orders/orderProgress';

/*
 * The pieces of Returns & Refunds (web/src/pages/Returns.jsx, ReturnDetail.jsx,
 * ReturnRequest.jsx with Returns.css and Orders.css at phone size).
 */

/** The list's tabs (web Returns.jsx TABS). */
export const RETURN_TABS = [
  { key: 'all', label: 'All' },
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'AWAITING_SHIPMENT', label: 'Ship back' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: 'REJECTED', label: 'Rejected' },
];

/** The list cards' badges: the same tones as My Orders. */
export const RETURN_BADGES = {
  REQUESTED: { label: 'Requested', tone: 'neutral' },
  APPROVED: { label: 'Approved', tone: 'accent' },
  AWAITING_SHIPMENT: { label: 'Ship items back', tone: 'accent' },
  RECEIVED: { label: 'Received', tone: 'accent' },
  REFUNDED: { label: 'Refunded', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  DISPUTED: { label: 'With the admin', tone: 'accent' },
};

/** The detail page's words for each step (web ReturnDetail.jsx LABELS). */
export const RETURN_LABELS = {
  REQUESTED: 'Request submitted',
  APPROVED: 'Return approved',
  AWAITING_SHIPMENT: 'Ship items back',
  RECEIVED: 'Items received',
  REFUNDED: 'Refund issued',
  REJECTED: 'Request rejected',
  CANCELLED: 'Request cancelled',
  CLOSED: 'Return closed',
  DISPUTED: 'With the municipal admin',
};

/** The amount a return is about: refunded, else approved, else asked for. */
export const returnAmount = (item) => Number(item.refundedAmount || item.approvedAmount || item.requestedAmount || 0);

/**
 * One return in the list (an .order-card link): the shop and its badge,
 * up to three items, then the return and order numbers, the date and the
 * refund amount with a caret. Tapping it opens the return.
 */
export function ReturnCard({ item, onPress }) {
  const badge = RETURN_BADGES[item.status] || { label: item.status, tone: 'neutral' };
  const lines = item.items || [];
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.storeName} numberOfLines={1}>{item.store?.name || item.order?.store?.name || 'Store'}</Text>
        <OrderBadge label={badge.label} tone={badge.tone} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.items}>
          {lines.slice(0, 3).map((line) => (
            <View key={line.id} style={styles.item}>
              <View style={styles.itemImage}><ProductImage src={line.orderItem?.product?.images?.[0]} /></View>
              <View style={styles.itemText}>
                <Text style={styles.itemName} numberOfLines={2}>{line.orderItem?.product?.name || line.orderItem?.productName}</Text>
                <Text style={styles.itemQty}>Qty: {line.quantity}</Text>
              </View>
            </View>
          ))}
          {lines.length > 3 ? (
            <Text style={styles.more}>+{lines.length - 3} more item{lines.length - 3 > 1 ? 's' : ''}</Text>
          ) : null}
        </View>

        <View style={styles.info}>
          <InfoRow label="Return number" value={item.requestNumber} />
          <InfoRow label="Order number" value={item.order?.orderNumber || '—'} />
          <InfoRow label="Requested on" value={longDate(item.createdAt)} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Refund amount</Text>
            <View style={styles.totalWrap}>
              <Text style={[styles.infoValue, styles.infoTotal]}>₱{returnAmount(item).toFixed(2)}</Text>
              <CaretRightIcon size={16} color={t.neutral[500]} style={styles.caret} />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

// .return-status on the detail page: the status tint; the text keeps
// .return-detail-head span's grey 13px (that rule outranks the tint's colour).
const PILL_BG = {
  REQUESTED: t.orange[100],
  APPROVED: t.sky[100],
  RECEIVED: t.sky[100],
  AWAITING_SHIPMENT: t.info[50],
  REFUNDED: t.secondary[50],
  CLOSED: t.secondary[50],
  REJECTED: t.danger[100],
  CANCELLED: t.danger[100],
  DISPUTED: t.warning[100],
};

/** The detail page's status pill (upper case, letter-spaced). */
export function ReturnStatusPill({ status }) {
  return (
    <View style={[styles.pill, { backgroundColor: PILL_BG[status] || 'transparent' }]}>
      <Text style={styles.pillText}>{(RETURN_LABELS[status] || status || '').toUpperCase()}</Text>
    </View>
  );
}

/**
 * .returns-primary on phones: the dark green button across the width
 * (46 tall, 10px corners). A disabled one looks the same on the website
 * (there is no :disabled style); it just does nothing.
 */
export function ReturnsPrimary({
  label, onPress, disabled = false, style, textStyle,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && !disabled && styles.primaryPressed, style]}
    >
      <Text style={[styles.primaryText, textStyle]}>{label}</Text>
    </Pressable>
  );
}

/** .returns-empty: a message (and maybe a button) in the middle of 280px. */
export function ReturnsMessage({ children }) {
  return <View style={styles.message}>{children}</View>;
}

export const returnsText = StyleSheet.create({
  message: { fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[500], textAlign: 'center' },
});

const styles = StyleSheet.create({
  card: { borderRadius: 12, backgroundColor: t.neutral[0], overflow: 'hidden', ...cardShadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 4 },
  storeName: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[900] },
  cardBody: { paddingTop: 8, paddingHorizontal: 14 },
  items: { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: t.neutral[150] },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  itemImage: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { marginBottom: 4, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  itemQty: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  more: { marginTop: 7, fontSize: 12, lineHeight: 19.2, fontStyle: 'italic', ...font(400), color: t.neutral[500] },
  info: { gap: 6, paddingBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  infoLabel: { flexShrink: 0, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  infoValue: { flexShrink: 1, textAlign: 'right', fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[900] },
  infoTotal: { fontSize: 17, lineHeight: 27.2 },
  totalWrap: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  caret: { marginLeft: 4 },

  pill: { flexShrink: 0, marginTop: 2, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999 },
  pillText: { fontSize: 13, lineHeight: 20.8, letterSpacing: 0.52, ...font(500), color: t.neutral[500] },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 46,
    paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, backgroundColor: t.secondary[700],
  },
  primaryPressed: { backgroundColor: t.secondary[800] },
  primaryText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: t.neutral[0] },

  message: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: 10 },
});
