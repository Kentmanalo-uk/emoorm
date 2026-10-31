import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { font, fontFamily, t, themed } from '../../../theme';
import EmptyState from '../../EmptyState';

/*
 * The analytics charts (web/src/components/analytics/BarChart.jsx,
 * TrendLine.jsx, StatusDonut.jsx; analytics.css): bars as Views, the trend
 * line and the donut in SVG, as the website draws them.
 */

/**
 * Total and Peak over a row of green bars, dates under some of them. The
 * website shows a bar's figure while the pointer is over it; on a phone a
 * tap shows it (and a second tap hides it).
 */
export function BarChart({
  data = [], valueKey = 'total', labelKey = 'date', formatValue = (v) => String(v), height = 180, showValues = true,
}) {
  const [shown, setShown] = useState(null);
  if (!data.length) {
    return <EmptyState art="analytics" title="No data yet" text="Nothing was recorded in this period." compact />;
  }
  const total = data.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);
  if (total === 0) {
    return <EmptyState art="analytics" title="No sales yet" text="Completed orders in this period will appear here." compact />;
  }
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey] || 0)));
  const peak = data.reduce((best, item) => (Number(item[valueKey] || 0) > Number(best[valueKey] || 0) ? item : best), data[0]);
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const last = data.length - 1;

  return (
    <View style={styles.chartWrap}>
      {showValues ? (
        <View style={styles.summary}>
          <View style={styles.summaryItem}>
            <Text style={styles.summarySmall}>Total</Text>
            <Text style={styles.summaryStrong}>{formatValue(total)}</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summarySmall}>Peak</Text>
            <Text style={styles.summaryStrong}>{formatValue(Number(peak[valueKey] || 0))}</Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.bars, { height }]}>
        {data.map((d, i) => {
          const value = Number(d[valueKey] || 0);
          const pct = (value / max) * 100;
          // The last day always gets a label; a regular one too close to it
          // is dropped so the two don't print on top of each other.
          const shouldLabel = i === last || (i % labelEvery === 0 && last - i >= Math.ceil(labelEvery / 2));
          const open = shown === i && value > 0;
          return (
            <Pressable
              key={`${d[labelKey]}-${i}`}
              accessibilityLabel={`${d[labelKey]}: ${formatValue(value)}`}
              onPress={() => setShown((s) => (s === i ? null : i))}
              style={[styles.bar, open && styles.barOnTop]}
            >
              <View style={[styles.fill, { height: `${Math.max(pct, 2)}%` }]}>
                {open ? (
                  <View style={styles.tipAnchor} pointerEvents="none">
                    <Text style={styles.tip} numberOfLines={1}>{formatValue(value)}</Text>
                  </View>
                ) : null}
              </View>
              {shouldLabel ? (
                <View style={styles.labelAnchor} pointerEvents="none">
                  <Text style={styles.label} numberOfLines={1}>{String(d[labelKey]).slice(5)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const TREND_W = 300;

/** The thin line (and a faint fill) under Sales analytics. Nothing when all is zero. */
export function TrendLine({ data = [], height = 60, valueKey = 'total', color = t.primary[600] }) {
  const points = data.map((d) => Number(d[valueKey] || 0));
  if (!points.some((v) => v !== 0)) return null;
  const max = Math.max(1, ...points);
  const min = Math.min(0, ...points);
  const range = max - min || 1;
  const h = height;
  const step = points.length > 1 ? TREND_W / (points.length - 1) : TREND_W;
  const coords = points.map((v, i) => [i * step, h - ((v - min) / range) * (h - 6) - 3]);
  const path = `M ${coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L ')}`;
  const area = `${path} L ${TREND_W.toFixed(1)},${h} L 0,${h} Z`;
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${TREND_W} ${h}`} preserveAspectRatio="none" accessibilityLabel="Sales trend over the period">
      <Path d={area} fill={color} opacity={0.08} />
      <Path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

const STATUS_COLORS = themed(() => ({
  PENDING: t.warning[500],
  CONFIRMED: t.info[500],
  PREPARING: t.violet[500],
  READY: t.sky[500],
  COMPLETED: t.primary[600],
  CANCELLED: t.danger[500],
  APPROVED: t.primary[600],
  HIDDEN: t.neutral[500],
  SUSPENDED: t.danger[500],
  ARCHIVED: t.neutral[700],
}));

/** The order statuses as a ring with the total inside, and the legend beside it. */
export function StatusDonut({
  counts = {}, colors = STATUS_COLORS, size = 140,
  emptyTitle = 'No orders yet', emptyMessage = 'Order statuses will be charted here.', emptyArt = 'orders',
}) {
  const entries = Object.entries(counts).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return <EmptyState art={emptyArt} title={emptyTitle} text={emptyMessage} compact />;

  const radius = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  const c = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = entries.map(([key, value]) => {
    const dash = (value / total) * c;
    const el = (
      <Circle
        key={key}
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={colors[key] || t.neutral[400]}
        strokeWidth={16}
        strokeDasharray={`${dash} ${c - dash}`}
        strokeDashoffset={-offset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <View style={styles.donutWrap}>
      <Svg width={size} height={size}>
        {arcs}
        <SvgText x={cx} y={cy - 4} textAnchor="middle" fontSize={18} fontFamily={fontFamily.bold} fontWeight="700" fill={t.neutral[900]}>
          {String(total).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        </SvgText>
        <SvgText x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fontFamily={fontFamily.medium} fontWeight="500" letterSpacing={0.55} fill={t.neutral[400]}>
          TOTAL
        </SvgText>
      </Svg>
      <View style={styles.legend}>
        {entries.map(([key, value]) => (
          <View key={key} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: colors[key] || t.neutral[400] }]} />
            <Text style={styles.legendKey}>{key.charAt(0) + key.slice(1).toLowerCase()}</Text>
            <Text style={styles.legendVal}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  chartWrap: { gap: 10 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 24, paddingHorizontal: 18 },
  summaryItem: { gap: 1 },
  summarySmall: { fontSize: 11, lineHeight: 14, color: t.neutral[500], ...font(500) },
  summaryStrong: { fontSize: 15, lineHeight: 18.75, color: t.neutral[900], ...font(700) },

  // .an-barchart: 22px over the bars for a figure, 20px under for the dates.
  bars: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 20,
    backgroundColor: t.neutral[0],
  },
  bar: { flex: 1, minWidth: 4, height: '100%', justifyContent: 'flex-end' },
  barOnTop: { zIndex: 2 },
  fill: { width: '100%', minHeight: 2, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: t.primary[600] },
  // .an-bar-value: a dark tag centred over the bar.
  tipAnchor: { position: 'absolute', bottom: '100%', left: -70, right: -70, alignItems: 'center', marginBottom: 4 },
  tip: {
    maxWidth: 130, paddingVertical: 3, paddingHorizontal: 5, borderRadius: 4, overflow: 'hidden',
    backgroundColor: t.neutral[900], color: t.neutral[0], fontSize: 11, lineHeight: 12, ...font(600),
  },
  // .an-bar-label: centred under the bar, never wrapped.
  labelAnchor: { position: 'absolute', top: '100%', left: -30, right: -30, alignItems: 'center', marginTop: 5 },
  label: { fontSize: 11, lineHeight: 12, color: t.neutral[500], ...font(400) },

  donutWrap: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 24,
    paddingVertical: 18, paddingHorizontal: 20,
  },
  legend: { flex: 1, minWidth: 120, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendKey: { flex: 1, fontSize: 12.5, lineHeight: 17, color: t.neutral[600], ...font(400) },
  legendVal: { fontSize: 12.5, lineHeight: 17, color: t.neutral[900], ...font(700) },
}));
