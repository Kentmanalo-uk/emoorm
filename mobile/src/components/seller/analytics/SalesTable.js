import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, t } from '../../../theme';
import EmptyState from '../../EmptyState';

const HAIRLINE = 'rgba(15, 23, 42, 0.05)';

/**
 * Daily sales (web/src/components/analytics/SalesTable.jsx, phone branch):
 * Date, Total Orders, Total Revenue. Phones list only the days that had
 * orders (a month of zero rows is a long scroll saying nothing), with a
 * button for the full list. A row opens that day's orders.
 */
export default function SalesTable({
  rows = [], onSelect, emptyMessage = 'No sales in this period.', labelKey = 'date',
  formatLabel = (v) => v, formatValue = (v) => v,
}) {
  const [showAll, setShowAll] = useState(false);
  if (!rows.length) return <EmptyState art="revenue" title="No sales yet" text={emptyMessage} compact />;

  const active = rows.filter((r) => Number(r.orders) > 0 || Number(r.total) > 0);
  const shortened = !showAll && active.length < rows.length;
  const shown = shortened ? active : rows;
  const clickable = typeof onSelect === 'function' && labelKey === 'date';

  return (
    <View>
      {shortened && active.length === 0 ? <Text style={styles.none}>No orders on any day in this period.</Text> : null}
      {shown.length > 0 ? (
        <View>
          <View style={styles.headRow}>
            <Text style={[styles.th, styles.colDate]}>Date</Text>
            <Text style={[styles.th, styles.colNum]}>Total Orders</Text>
            <Text style={[styles.th, styles.colNum]}>Total Revenue</Text>
          </View>
          {shown.map((r, i) => (
            <Pressable
              key={r[labelKey]}
              disabled={!clickable}
              accessibilityRole={clickable ? 'button' : undefined}
              onPress={clickable ? () => onSelect(r) : undefined}
              style={({ pressed }) => [styles.row, i === shown.length - 1 && styles.rowLast, pressed && styles.rowPressed]}
            >
              <Text style={[styles.td, styles.colDate]} numberOfLines={1}>{formatLabel(r[labelKey])}</Text>
              <Text style={[styles.td, styles.colNum]}>{r.orders}</Text>
              <Text style={[styles.td, styles.colNum, styles.money]}>{formatValue(r.total)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {active.length < rows.length ? (
        <Pressable accessibilityRole="button" onPress={() => setShowAll((v) => !v)} style={styles.more}>
          <Text style={styles.moreText}>{showAll ? 'Show only days with orders' : `Show all ${rows.length} days`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // .an-table-none sits at the card's edge, as on the website.
  none: { marginTop: 4, marginBottom: 8, fontSize: 13.5, lineHeight: 20, color: t.neutral[500], ...font(400) },
  headRow: {
    flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 18, gap: 18,
    backgroundColor: t.neutral[50], borderBottomWidth: 1, borderBottomColor: HAIRLINE,
  },
  th: { fontSize: 12, lineHeight: 16, letterSpacing: 0.48, textTransform: 'uppercase', color: t.neutral[500], ...font(600) },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18, gap: 18, borderBottomWidth: 1, borderBottomColor: HAIRLINE },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: t.neutral[50] },
  td: { fontSize: 13, lineHeight: 18, color: t.neutral[700], ...font(400) },
  colDate: { flexGrow: 1, flexShrink: 0 },
  colNum: { flex: 1, textAlign: 'right' },
  money: { color: t.primary[600], ...font(600) },
  // .an-table-more
  more: {
    minHeight: 44, marginTop: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: t.neutral[50],
  },
  moreText: { fontSize: 14, lineHeight: 20, color: t.primary[700], ...font(600) },
});
