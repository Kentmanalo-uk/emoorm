import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../../theme';
import EmptyState from '../../EmptyState';

/*
 * Pieces of the seller's Returns & refunds page (web/src/pages/
 * SellerReturns.jsx, SellerReturns.css at phone size): the stages, the
 * status pill, one request row and the empty state.
 */

export const TABS = [['all', 'All'], ['REQUESTED', 'Requested'], ['AWAITING_SHIPMENT', 'Awaiting shipment'], ['RECEIVED', 'Received'], ['REFUNDED', 'Refunded'], ['REJECTED', 'Rejected']];
// Phones show these as chips; the other stages sit in a sheet.
export const PHONE_QUICK_TABS = ['all', 'REQUESTED'];
export const LABELS = { REQUESTED: 'Requested', APPROVED: 'Approved', AWAITING_SHIPMENT: 'Awaiting shipment', RECEIVED: 'Received', REFUNDED: 'Refunded', REJECTED: 'Rejected', CANCELLED: 'Cancelled', CLOSED: 'Closed', DISPUTED: 'Disputed (admin decides)' };

export const peso = (value) => `₱${Number(value || 0).toFixed(2)}`;

// .seller-status.status-* (phones)
const STATUS_COLOURS = {
  REQUESTED: [t.warning[100], t.warning[700]],
  APPROVED: [t.info[100], t.info[700]],
  AWAITING_SHIPMENT: [t.info[100], t.info[700]],
  RECEIVED: [t.info[100], t.info[700]],
  REFUNDED: [t.primary[100], t.primary[700]],
  CLOSED: [t.primary[100], t.primary[700]],
  REJECTED: [t.danger[100], t.danger[700]],
  CANCELLED: [t.danger[100], t.danger[700]],
  DISPUTED: [t.warning[100], t.warning[800]],
};

export function StatusPill({ status, style }) {
  const [bg, fg] = STATUS_COLOURS[status] || [t.neutral[100], t.secondary[950]];
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      <Text style={[styles.pillText, { color: fg }]} numberOfLines={1}>{LABELS[status] || status}</Text>
    </View>
  );
}

/** One request in the list (.seller-return-row). */
export function ReturnRow({ item, selected = false, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.row, selected && styles.rowOn]}>
      <View style={styles.rowMain}>
        <Text style={styles.rowNumber}>{item.requestNumber}</Text>
        <Text style={styles.rowSub}>{item.buyer?.fullName || 'Buyer'} · Order #{item.order?.orderNumber}</Text>
      </View>
      <View style={styles.rowEnd}>
        <StatusPill status={item.status} />
        <Text style={styles.rowAmount}>{peso(item.requestedAmount)}</Text>
      </View>
    </Pressable>
  );
}

/** The returns page's empty state: fills the room it is given and centres in it. */
export function ReturnsEmpty({ all = true }) {
  return (
    <EmptyState
      page
      art="returns"
      title="No return requests"
      text={all ? 'Requests from buyers will appear here, with the refund tools alongside them.' : 'Nothing is in this stage right now.'}
    />
  );
}

// --elev-card: rgba(149, 157, 165, 0.06) 0px 8px 24px
export const elevCard = { boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(149, 157, 165, 0.06)' }] };

const styles = StyleSheet.create({
  pill: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 999 },
  pillText: { fontSize: 11, lineHeight: 15.4, ...font(700) },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
    minHeight: 72, padding: 14, borderRadius: 12, backgroundColor: t.neutral[0], ...elevCard,
  },
  // is-selected: a 2px green ring inside the card.
  rowOn: { padding: 12, borderWidth: 2, borderColor: t.primary[600] },
  rowMain: { flex: 1, minWidth: 0 },
  rowNumber: { fontSize: 14, lineHeight: 19, ...font(700), color: t.secondary[950] },
  rowSub: { marginTop: 4, fontSize: 12, lineHeight: 17, ...font(400), color: t.neutral[500] },
  rowEnd: { flexShrink: 0, alignItems: 'flex-end' },
  rowAmount: { marginTop: 8, fontSize: 15, lineHeight: 20, ...font(700), color: t.secondary[950], textAlign: 'right' },

  // The list around it does not grow, so keep a screenful's room to centre in.
});
