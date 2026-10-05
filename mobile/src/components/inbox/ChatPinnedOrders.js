import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../theme';
import ChatProductThumb from './ChatProductThumb';
import { formatMoney, ORDER_STATUS_STYLES } from './inboxFormat';

/*
 * The orders between this buyer and shop, above the messages (web
 * Messenger.jsx .msgr-pins / PinnedOrderCard, as phones show them: the
 * item's name, the status in green capitals and the total; the order
 * number, date and "Reference" button are hidden on phones).
 */
function PinnedOrderCard({ order }) {
  const style = ORDER_STATUS_STYLES[order.status] || { label: order.status };
  const firstItem = order.items?.[0];
  const extra = Math.max(0, (order.itemCount || 0) - (firstItem?.quantity || 0));
  return (
    <View style={styles.card}>
      <View style={styles.thumb}><ChatProductThumb src={firstItem?.image} style={styles.fill} /></View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {firstItem?.productName || 'Order items'}
          {extra > 0 ? <Text style={styles.more}> +{extra} more</Text> : null}
        </Text>
        <Text style={styles.status} numberOfLines={1}>{String(style.label || '').toUpperCase()}</Text>
        <Text style={styles.total}>{formatMoney(order.total)}</Text>
      </View>
    </View>
  );
}

export default function ChatPinnedOrders({ orders, sellerSide }) {
  if (!orders?.length) return null;
  return (
    <View style={styles.pins}>
      <Text style={styles.head}>
        {sellerSide ? 'Buyer orders' : 'Your orders'}
        <Text style={styles.count}> · {orders.length}</Text>
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.track}>
        {orders.map((o) => <PinnedOrderCard key={o.id} order={o} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pins: {
    paddingVertical: 10, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.neutral[150], backgroundColor: t.neutral[0],
  },
  head: { marginBottom: 6, fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(500) },
  count: { color: t.neutral[500], ...font(500) },
  track: { gap: 10 },
  card: {
    width: 240, flexDirection: 'row', alignItems: 'stretch', gap: 10, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10, backgroundColor: t.neutral[0],
  },
  thumb: { width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  fill: { width: '100%', height: '100%' },
  body: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 13, lineHeight: 17.55, color: t.neutral[900], ...font(500) },
  more: { fontSize: 11.5, color: t.neutral[500], ...font(400) },
  status: { marginTop: 2, fontSize: 11, lineHeight: 17.6, letterSpacing: 0.44, color: t.primary[600], ...font(500) },
  total: { fontSize: 12.5, lineHeight: 20, color: t.neutral[500], ...font(500) },
});
