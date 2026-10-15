import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import apiClient from '../../../api/client';
import Sheet from '../../Sheet';
import { font, t } from '../../../theme';
import { num, peso } from './format';
import { Thumb } from './parts';

const HAIRLINE = 'rgba(15, 23, 42, 0.05)';

// .an-badge-<status>
const BADGES = {
  completed: [t.primary[100], t.primary[700]],
  cancelled: [t.danger[100], t.danger[700]],
  pending: [t.warning[100], t.warning[700]],
  confirmed: [t.info[100], t.info[700]],
  preparing: [t.violet[100], t.violet[700]],
  ready: ['#cffafe', t.teal[600]],
};

/**
 * One day's orders (web/src/components/analytics/DayDetailModal.jsx, a
 * bottom sheet on phones): Orders, Items sold and Revenue, then each order
 * with its buyer, total and items.
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
            const status = String(o.status || '').toLowerCase();
            const [bg, fg] = BADGES[status] || [t.neutral[100], t.neutral[600]];
            return (
              <View key={o.id} style={styles.order}>
                <View style={styles.orderHead}>
                  <View style={styles.orderLeft}>
                    <Text style={styles.orderNo}>{o.orderNumber}</Text>
                    <View style={[styles.badge, { backgroundColor: bg }]}>
                      <Text style={[styles.badgeText, { color: fg }]}>{status}</Text>
                    </View>
                  </View>
                  <View style={styles.orderRight}>
                    <Text style={styles.buyer} numberOfLines={1}>{o.buyer?.name || 'Guest'}</Text>
                    {/* The shop's sale: a MoorMove rider's delivery fee is the rider's. */}
                    <Text style={styles.total}>{peso(o.shopTotal ?? o.total)}</Text>
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

const styles = StyleSheet.create({
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
  orderLeft: { flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 },
  orderNo: { fontSize: 13, lineHeight: 18, color: t.neutral[900], ...font(700) },
  badge: { marginLeft: 8, paddingVertical: 2, paddingHorizontal: 10, borderRadius: 999 },
  badgeText: { fontSize: 11, lineHeight: 14, letterSpacing: 0.44, textTransform: 'uppercase', ...font(600) },
  orderRight: { flexShrink: 0, maxWidth: '50%' },
  buyer: { marginTop: 4, fontSize: 13, lineHeight: 17, textAlign: 'right', color: t.neutral[700], ...font(600) },
  total: { fontSize: 13, lineHeight: 18, textAlign: 'right', color: t.primary[600], ...font(600) },
  riderNote: { fontSize: 11.5, lineHeight: 16, textAlign: 'right', color: t.neutral[500], ...font(400) },
  items: { gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemBody: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 13, lineHeight: 18, color: t.neutral[900], ...font(400) },
  itemSub: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
  itemTotal: { fontSize: 13, lineHeight: 18, color: t.neutral[900], ...font(600) },
});
