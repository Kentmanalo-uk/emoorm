import { StyleSheet, Text, View } from 'react-native';
import EmptyState from '../../EmptyState';
import { font, t, themed } from '../../../theme';
import { AnCard } from './parts';
import { num, peso } from './format';
import {
  CardNote, insightStyles as is, monthLabel, plural,
} from './InsightsParts';

/*
 * Insights › Buyer groups (GET /ml/insights/mine → buyers, module 04): the
 * shop's buyers of the last year in six groups by how recently, how often
 * and how much they buy, as counts only (no buyer is named), the repeat
 * rate, average orders and spend, and new against returning buyers over the
 * last 6 months. A shop under 5 buyers gets no groups.
 */

const GROUPS = [
  { key: 'new', label: 'New', hint: 'First order in the last 30 days' },
  { key: 'frequent', label: 'Frequent', hint: '3 or more orders, the last within 60 days' },
  { key: 'high_value', label: 'High spenders', hint: 'Your top quarter by spend, ordered in the last 90 days' },
  { key: 'returning', label: 'Returning', hint: '2 or more orders, the last within 90 days' },
  { key: 'occasional', label: 'Occasional', hint: 'One order, 1 to 4 months ago' },
  { key: 'inactive', label: 'Inactive', hint: 'No order in over 4 months' },
];

export default function InsightsBuyers({ part }) {
  if (!part || part.status === 'off' || part.status === 'unavailable') return null;

  if (part.status !== 'ok') {
    const needs = typeof part.needs === 'number' ? part.needs : 5;
    const so = part.buyers != null ? ` So far: ${num(part.buyers)}.` : '';
    return (
      <AnCard title="Buyer groups">
        <EmptyState
          compact
          art="users"
          title="Not enough buyers yet"
          text={`Groups show once at least ${needs} buyers have ordered.${so}`}
        />
      </AnCard>
    );
  }

  const groups = part.groups || {};
  const total = Math.max(1, Number(part.buyers || 0));
  const max = Math.max(1, ...GROUPS.map((g) => Number(groups[g.key] || 0)));

  return (
    <AnCard title="Buyer groups" sub={`${num(part.buyers)} ${plural(part.buyers, 'buyer')} in the last year`}>
      <View style={styles.groups}>
        {GROUPS.map((g) => {
          const n = Number(groups[g.key] || 0);
          return (
            <View key={g.key} style={styles.group} accessible accessibilityLabel={`${g.label}: ${n} ${plural(n, 'buyer')}. ${g.hint}`}>
              <View style={styles.groupHead}>
                <Text style={styles.groupLabel}>{g.label}</Text>
                <Text style={styles.groupValue}>
                  {num(n)}
                  <Text style={styles.groupPct}>{`  ${Math.round((n / total) * 100)}%`}</Text>
                </Text>
              </View>
              <View style={styles.track}>
                {n > 0 ? <View style={[styles.fill, { width: `${Math.max(2, (n / max) * 100)}%` }]} /> : null}
              </View>
              <Text style={is.sub}>{g.hint}</Text>
            </View>
          );
        })}
      </View>
      <View style={is.divider} />
      <View style={[is.figures, styles.figures]}>
        <Figure value={`${Math.round(Number(part.repeatRate || 0) * 100)}%`} label="Repeat rate" hint="Ordered twice or more" />
        <Figure value={Number(part.avgOrders || 0).toFixed(1)} label="Avg orders" hint="Per buyer" />
        <Figure value={peso(part.avgSpend)} label="Avg spend" hint="Per buyer" />
      </View>
      {Array.isArray(part.months) && part.months.length ? <Months months={part.months} /> : null}
      <CardNote>Counts only: no buyer is named here.</CardNote>
    </AnCard>
  );
}

function Figure({ value, label, hint }) {
  return (
    <View style={is.figure}>
      <Text style={is.figureValueSmall} numberOfLines={1}>{value}</Text>
      <Text style={is.figureLabel}>{label}</Text>
      <Text style={is.figureHint}>{hint}</Text>
    </View>
  );
}

/** New and returning buyers per month: two thin bars a month, the count over each. */
function Months({ months }) {
  const max = Math.max(1, ...months.flatMap((m) => [Number(m.new || 0), Number(m.returning || 0)]));
  const NEW = t.primary[600];
  const BACK = t.sky[600];
  return (
    <View style={styles.months}>
      <View style={styles.monthsHead}>
        <Text style={styles.monthsTitle}>Last 6 months</Text>
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: NEW }]} /><Text style={styles.legendText}>New</Text></View>
          <View style={styles.legendItem}><View style={[styles.swatch, { backgroundColor: BACK }]} /><Text style={styles.legendText}>Returning</Text></View>
        </View>
      </View>
      <View style={styles.monthBars}>
        {months.map((m) => {
          const a = Number(m.new || 0);
          const b = Number(m.returning || 0);
          return (
            <View key={m.month} style={styles.month} accessible accessibilityLabel={`${monthLabel(m.month)}: ${a} new, ${b} returning`}>
              <View style={styles.pair}>
                <Bar value={a} max={max} color={NEW} />
                <Bar value={b} max={max} color={BACK} />
              </View>
              <Text style={styles.monthLabel}>{monthLabel(m.month)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const BAR_H = 56;

function Bar({ value, max, color }) {
  return (
    <View style={styles.barCol}>
      <Text style={styles.barValue}>{value > 0 ? num(value) : ''}</Text>
      <View style={[styles.bar, { height: value > 0 ? Math.max(3, (value / max) * BAR_H) : 2, backgroundColor: value > 0 ? color : t.neutral[150] }]} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  groups: { gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
  group: { gap: 4 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  groupLabel: { fontSize: 13.5, lineHeight: 18, color: t.neutral[900], ...font(500) },
  groupValue: { fontSize: 13.5, lineHeight: 18, color: t.neutral[900], fontVariant: ['tabular-nums'], ...font(700) },
  groupPct: { fontSize: 12, color: t.neutral[500], ...font(400) },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: t.neutral[100] },
  fill: { height: '100%', borderRadius: 4, backgroundColor: t.primary[600] },

  figures: { paddingTop: 12 },

  months: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 8 },
  monthsHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  monthsTitle: { fontSize: 12.5, lineHeight: 17, color: t.neutral[700], ...font(600) },
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, lineHeight: 16, color: t.neutral[600], ...font(400) },
  monthBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  month: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  pair: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: BAR_H + 16 },
  barCol: { alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  barValue: { fontSize: 10, lineHeight: 12, color: t.neutral[600], fontVariant: ['tabular-nums'], ...font(500) },
  bar: { width: 12, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  monthLabel: { fontSize: 11, lineHeight: 12, color: t.neutral[500], ...font(400) },
}));
