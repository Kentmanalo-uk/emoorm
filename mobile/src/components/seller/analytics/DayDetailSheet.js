import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import apiClient from '../../../api/client';
import Sheet from '../../Sheet';
import { font, t, themed } from '../../../theme';
import { num, peso } from './format';
import { Thumb } from './parts';
import { statusLabel } from '../../orders/orderProgress';
import { OrderState } from '../orders/OrderLook';

const HAIRLINE = 'rgba(15, 23, 42, 0.05)';

// "3:05 PM", for the order's line under the buyer.
const timeOf = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
};

/**
 * One day's orders (web/src/components/analytics/DayDetailModal.jsx, a
 * bottom sheet on phones): Orders, Items sold and Revenue, then each order:
 * who ordered and when lead (the order number a reference after the time),
 * the total over where it stands, then the items.
 */
export default function DayDetailSheet({ date, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    apiClient.get('/analytics/seller/day', { params: { date } })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load day details'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  return (
    <Sheet variant="seller" open={Boolean(date)} title={date ? `Sales for ${date}` : ''} onClose={onClose} bodyStyle={styles.body}>
      {loading ? <Text style={styles.empty}>Loading…</Text> : null}
      {error ? <Text style={[styles.empty, { color: t.danger[600] }]}>{error}</Text> : null}

      {data ? (
        <>
          <View style={styles.summary}>
            <Figure label="Orders" value={num(data.summary?.orders)} />
            <Figure label="Items sold" value={num(data.summary?.items)} />
            <Figure label="Revenue" value={peso(data.summary?.revenue)} />
          </View>

          {(data.orders || []).length === 0 ? <Text style={styles.empty}>No orders on this date.</Text> : null}

          {(data.orders || []).map((o) => {
            const time = timeOf(o.createdAt);
            return (
              <View key={o.id} style={styles.order}>
                {/* Who ordered and when lead; the order number is a reference. */}
                <View style={styles.orderHead}>
                  <View style={styles.orderWho}>
                    <Text style={styles.buyer} numberOfLines={1}>{o.buyer?.name || 'Guest'}</Text>
                    <Text style={styles.orderSub} numberOfLines={1}>{`${time ? `${time} · ` : ''}#${o.orderNumber}`}</Text>
                  </View>
                  <View style={styles.orderSide}>
                    {/* The shop's sale: a MoorMove rider's delivery fee is the rider's. */}
                    <Text style={styles.total}>{peso(o.shopTotal ?? o.total)}</Text>
                    <OrderState status={o.status} label={o.status === 'PENDING' ? 'New' : statusLabel(o.status, o.fulfillmentMethod)} />
                    {Number(o.riderFee) > 0 ? <Text style={styles.riderNote}>Rider fee {peso(o.riderFee)} goes to MoorMove</Text> : null}
                  </View>
                </View>
                <View style={styles.items}>
                  {(o.items || []).map((it) => (
                    <View key={it.id} style={styles.item}>
                      <Thumb image={it.productImage || null} />
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>{it.productName}</Text>
                        <Text style={styles.itemSub}>{`${peso(it.price)} × ${it.quantity}`}</Text>
                      </View>
                      <Text style={styles.itemTotal}>{peso(it.subtotal)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </>
      ) : null}
    </Sheet>
  );
}

function Figure({ label, value }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  body: { paddingHorizontal: 0, paddingTop: 0 },
  empty: { paddingVertical: 32, paddingHorizontal: 16, textAlign: 'center', fontSize: 13, lineHeight: 18, color: t.neutral[500], ...font(400) },
  // .an-modal-summary
  summary: { flexDirection: 'row', gap: 8, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: t.neutral[50] },
  figure: { flex: 1, minWidth: 0 },
  figureLabel: { marginTop: 4, fontSize: 13, lineHeight: 17, color: t.neutral[700], ...font(600) },
  figureValue: { fontSize: 22, lineHeight: 25.3, color: t.neutral[900], ...font(700) },
  // .an-day-order
  order: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  orderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  // .an-day-order-who / -side
  orderWho: { flex: 1, minWidth: 0, gap: 2 },
  buyer: { fontSize: 14, lineHeight: 18, color: t.neutral[900], ...font(600) },
  orderSub: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
  orderSide: { flexShrink: 0, maxWidth: '50%', alignItems: 'flex-end', gap: 4 },
  total: { fontSize: 14, lineHeight: 18, textAlign: 'right', color: t.neutral[900], ...font(700) },
  riderNote: { fontSize: 11.5, lineHeight: 16, textAlign: 'right', color: t.neutral[500], ...font(400) },
  items: { gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemBody: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 13, lineHeight: 18, color: t.neutral[900], ...font(400) },
  itemSub: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
  itemTotal: { fontSize: 13, lineHeight: 18, color: t.neutral[900], ...font(600) },
}));
