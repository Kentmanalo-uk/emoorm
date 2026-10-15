import { StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../../theme';
import { CARD_SHADOW } from '../analytics/parts';
import { numericDate, peso } from '../analytics/format';

/*
 * Finance pieces at Seller Center phone size (web/src/pages/SellerFinance.jsx;
 * SellerDashboard.css .sd-stat, layout/SellerPhoneFit.css "Finance:
 * completed orders as cards").
 */

export const PAYMENT_LABELS = {
  PENDING: 'Unpaid',
  PENDING_VERIFICATION: 'To verify',
  PAID: 'Paid',
  FAILED: 'Proof rejected',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

// Refunded amount for a completed order: the sum of its REFUNDED return
// requests when the payload carries them, else inferred from paymentStatus.
const refundedOf = (o) => {
  if (Array.isArray(o.returnRequests)) {
    return o.returnRequests
      .filter((r) => r.status === 'REFUNDED')
      .reduce((sum, r) => sum + Number(r.refundedAmount || 0), 0);
  }
  if (o.paymentStatus === 'REFUNDED') return Number(o.total || 0);
  return null;
};

/** One completed order as the page lists it. */
export const toRow = (o) => ({
  id: o.id,
  date: o.createdAt,
  number: (o.orderNumber || o.id).toString(),
  buyer: o.buyer?.fullName || o.buyer?.email || '—',
  items: o.items?.length || 0,
  // The shop's sale: a MoorMove rider's delivery fee is the rider's.
  amount: Number(o.shopTotal ?? o.total ?? 0),
  riderFee: Number(o.riderFee || 0),
  paymentStatus: o.paymentStatus || '',
  refunded: refundedOf(o),
});

/** .sd-stat: the figure first, then its label and a grey note. */
export function StatTile({ label, value, hint, big = false, style }) {
  return (
    <View style={[styles.stat, style]}>
      <Text style={[styles.statValue, big && styles.statValueBig]} numberOfLines={1}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint ? <Text style={styles.statHint} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

/**
 * A completed order as a phone card: the number and amount, the buyer and
 * date, then Items, Payment and Refunded in three small grey boxes.
 */
export function FinanceRow({ order }) {
  const refunded = order.refunded === null ? '—' : (order.refunded > 0 ? peso(order.refunded) : '—');
  return (
    <View style={styles.row}>
      <View style={styles.line}>
        <Text style={[styles.cell2, styles.number]}>#{order.number.slice(-8)}</Text>
        <Text style={[styles.cell1, styles.amount]}>{peso(order.amount)}</Text>
      </View>
      <View style={styles.line}>
        <Text style={[styles.cell2, styles.buyer]}>{order.buyer}</Text>
        <Text style={[styles.cell1, styles.date]}>{numericDate(order.date)}</Text>
      </View>
      {order.riderFee > 0 ? <Text style={styles.riderNote}>Rider fee {peso(order.riderFee)} goes to MoorMove</Text> : null}
      <View style={styles.line}>
        <Box label="Items" value={order.items} />
        <Box label="Payment" value={PAYMENT_LABELS[order.paymentStatus] || order.paymentStatus || '—'} />
        <Box label="Refunded" value={refunded} />
      </View>
    </View>
  );
}

function Box({ label, value }) {
  return (
    <View style={[styles.cell1, styles.box]}>
      <Text style={styles.boxLabel}>{label}</Text>
      <Text style={styles.boxValue}>{value}</Text>
    </View>
  );
}

/** The table's foot: "Total" (or "Page 2 total") and the sum. */
export function FinanceTotal({ label, value }) {
  return (
    <View style={styles.foot}>
      <Text style={styles.footLabel}>{label}</Text>
      <Text style={styles.footValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { minWidth: 0, gap: 5, padding: 14, borderRadius: 16, backgroundColor: t.neutral[0], boxShadow: CARD_SHADOW },
  statValue: { fontSize: 22, lineHeight: 25.3, color: t.neutral[900], ...font(700) },
  statValueBig: { fontSize: 28, lineHeight: 32.2 },
  statLabel: { fontSize: 12, lineHeight: 16.2, color: t.neutral[500], ...font(500) },
  statHint: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },

  // tbody tr: a 3-column grid, "order order amount / buyer buyer date / items pay refund".
  row: { gap: 4, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  line: { flexDirection: 'row', columnGap: 10 },
  cell1: { flex: 1, minWidth: 0 },
  cell2: { flex: 2, minWidth: 0 },
  number: { fontSize: 13.5, lineHeight: 20, color: t.neutral[900], ...font(700) },
  amount: { textAlign: 'right', fontSize: 15, lineHeight: 20, color: t.primary[700], ...font(700) },
  buyer: { fontSize: 13.5, lineHeight: 20, color: t.neutral[700], ...font(400) },
  date: { textAlign: 'right', fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  riderNote: { fontSize: 12, lineHeight: 17, color: t.neutral[500], ...font(400) },
  box: { marginTop: 6, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8, backgroundColor: t.neutral[50] },
  boxLabel: { marginBottom: 1, fontSize: 11, lineHeight: 14, color: t.neutral[500], ...font(500) },
  boxValue: { fontSize: 13.5, lineHeight: 20, color: t.neutral[800], ...font(600) },

  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: t.neutral[150],
  },
  footLabel: { fontSize: 13.5, lineHeight: 20, color: t.neutral[700], ...font(600) },
  footValue: { fontSize: 13.5, lineHeight: 20, color: t.primary[700], ...font(700) },
});
