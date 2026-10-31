import { useEffect, useRef } from 'react';
import {
  Animated, Easing, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { ArrowDownIcon, ArrowUpIcon, ArrowsClockwiseIcon, DownloadSimpleIcon } from '../../../lib/icons';
import EmptyState from '../../EmptyState';
import LoadingSkeleton from '../../LoadingSkeleton';
import { resolveImg } from '../../../lib/media';
import { font, ink, t, themed } from '../../../theme';
import DateRangePicker from './DateRangePicker';

/*
 * The analytics pieces (web/src/components/analytics/*.jsx, analytics.css)
 * at Seller Center phone size: the card, the figure tiles,
 * the ranked lists, the Daily/Monthly/Yearly toggle and the row of period
 * chips with Refresh and Export that heads Analytics and Finance.
 */

/** --elev-card */
export const CARD_SHADOW = 'rgba(149, 157, 165, 0.06) 0px 8px 24px';

/** Turns its child while `on` (.an-spin). */
export function Spin({ on, children }) {
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) {
      turn.stopAnimation();
      turn.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [on, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={{ transform: [{ rotate }] }}>{children}</Animated.View>;
}

/**
 * The page head's controls on phones (.seller-header .an-actions): the
 * period chips across, then Refresh and Export sharing the row below.
 */
export function PeriodActions({
  range, onRange, onRefresh, refreshing, refreshDisabled, onExport, exportDisabled, exportLabel = 'Export',
}) {
  return (
    <View style={styles.actions}>
      <DateRangePicker value={range} onChange={onRange} />
      <View style={styles.actionRow}>
        <ActionButton label="Refresh" onPress={onRefresh} disabled={refreshDisabled}>
          <Spin on={refreshing}><ArrowsClockwiseIcon size={13} color={t.neutral[700]} /></Spin>
        </ActionButton>
        <ActionButton label={exportLabel} onPress={onExport} disabled={exportDisabled}>
          <DownloadSimpleIcon size={13} color={t.neutral[700]} />
        </ActionButton>
      </View>
    </View>
  );
}

/** .an-icon-btn inside the phone's .an-actions: white, 12px corners, sharing the row. */
export function ActionButton({ label, onPress, disabled, children, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed, disabled && styles.off, style]}
    >
      {({ pressed }) => (
        <>
          {children}
          <Text style={[styles.actionText, pressed && { color: t.primary[700] }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** .an-card with its head: a title, a grey note or a control on the right. */
export function AnCard({ title, sub, right, children, style }) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{title}</Text>
          {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
          {right || null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** .an-kpi: the figure, a change chip beside it, the label and a hint. */
export function KpiCard({ label, value, delta = null, hint = null, loading = false, style }) {
  if (loading) {
    return (
      <View style={[styles.kpi, style]}>
        <LoadingSkeleton width="70%" height={26} borderRadius={4} />
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    );
  }
  const up = Number(delta) > 0;
  return (
    <View style={[styles.kpi, style]}>
      <View style={styles.kpiTop}>
        <Text style={styles.kpiValue} numberOfLines={1}>{value}</Text>
        {delta ? (
          <View style={[styles.delta, up ? styles.deltaUp : styles.deltaDown]} accessibilityLabel={`${up ? 'Up' : 'Down'} ${Math.abs(delta)}% vs previous period`}>
            {up ? <ArrowUpIcon size={12} weight="bold" color={t.primary[700]} /> : <ArrowDownIcon size={12} weight="bold" color={t.danger[700]} />}
            <Text style={[styles.deltaText, { color: up ? t.primary[700] : t.danger[700] }]}>{Math.abs(delta)}%</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.kpiLabel}>{label}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

/** A small product picture (.an-toplist-thumb), grey when there is none. */
export function Thumb({ image }) {
  const uri = resolveImg(image);
  return (
    <View style={styles.thumb}>
      {uri ? <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" /> : <View style={styles.thumbFallback} />}
    </View>
  );
}

/** .an-toplist: numbered rows with a picture, a name, a note and a figure. */
export function TopList({
  items = [], emptyMessage = 'No items.', emptyTitle = 'Nothing here yet', emptyArt = 'analytics', renderMetric,
}) {
  if (!items.length) return <EmptyState art={emptyArt} title={emptyTitle} text={emptyMessage} compact />;
  return (
    <View>
      {items.map((item, i) => (
        <View key={item.id || i} style={[styles.topRow, i === items.length - 1 && styles.topRowLast]}>
          <Text style={styles.topRank}>{i + 1}</Text>
          {item.image !== undefined ? <Thumb image={item.image} /> : null}
          <View style={styles.topBody}>
            <Text style={styles.topName} numberOfLines={1}>{item.name}</Text>
            {item.subtitle ? <Text style={styles.topSub}>{item.subtitle}</Text> : null}
          </View>
          <Text style={styles.topMetric}>{renderMetric ? renderMetric(item) : ''}</Text>
        </View>
      ))}
    </View>
  );
}

const GRANULARITY = [
  { key: 'day', label: 'Daily' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
];

/** Daily / Monthly / Yearly: a grey pill with the chosen one in green (.an-daterange). */
export function GranularityToggle({ value = 'day', onChange }) {
  return (
    <View style={styles.toggle} accessibilityRole="radiogroup" accessibilityLabel="Granularity">
      {GRANULARITY.map((o) => {
        const on = value === o.key;
        return (
          <Pressable key={o.key} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.key)} style={[styles.toggleBtn, on && styles.toggleBtnOn]}>
            <Text style={[styles.toggleText, on && styles.toggleTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const anStyles = StyleSheet.create({
  // The KPI grid: two columns, 12px apart.
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  half: { flexBasis: '45%', flexGrow: 1 },
});

const styles = themed(() => StyleSheet.create({
  actions: { width: '100%', gap: 8, marginBottom: 12 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40,
    paddingVertical: 9, paddingHorizontal: 16, borderRadius: 12, backgroundColor: t.neutral[0],
  },
  actionBtnPressed: { backgroundColor: t.neutral[200] },
  actionText: { fontSize: 13, lineHeight: 16, color: t.neutral[700], ...font(600) },
  off: { opacity: 0.6 },

  card: { marginBottom: 12, borderRadius: 16, overflow: 'hidden', backgroundColor: t.neutral[0], boxShadow: CARD_SHADOW },
  cardHead: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingTop: 14, paddingHorizontal: 16, paddingBottom: 8,
  },
  cardTitle: { flexShrink: 1, fontSize: 15, lineHeight: 17.25, color: t.neutral[900], ...font(500) },
  cardSub: { flexShrink: 1, fontSize: 12.5, lineHeight: 18, color: t.neutral[500], ...font(400) },

  kpi: { minWidth: 0, gap: 4, padding: 14, borderRadius: 16, backgroundColor: t.neutral[0], boxShadow: CARD_SHADOW },
  kpiTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', rowGap: 4, columnGap: 8 },
  kpiValue: { fontSize: 22, lineHeight: 25.3, color: t.neutral[900], fontVariant: ['tabular-nums'], ...font(700) },
  kpiLabel: { marginTop: 4, fontSize: 13, lineHeight: 20.8, color: t.neutral[700], ...font(600) },
  kpiHint: { fontSize: 11.5, lineHeight: 15.5, color: t.neutral[500], ...font(400) },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 4, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 },
  deltaUp: { backgroundColor: t.secondary[50] },
  deltaDown: { backgroundColor: t.danger[50] },
  deltaText: { fontSize: 12, lineHeight: 16, ...font(700) },

  thumb: { width: 36, height: 36, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  thumbImg: { width: '100%', height: '100%' },
  thumbFallback: { flex: 1, backgroundColor: t.neutral[200] },

  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: ink(0.05),
  },
  topRowLast: { borderBottomWidth: 0 },
  topRank: { width: 18, fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(700) },
  topBody: { flex: 1, minWidth: 0, gap: 2 },
  topName: { fontSize: 13.5, lineHeight: 18, color: t.neutral[900], ...font(500) },
  topSub: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
  topMetric: { flexShrink: 0, fontSize: 13.5, lineHeight: 18, color: t.primary[600], ...font(700) },

  toggle: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: t.neutral[100] },
  toggleBtn: { minHeight: 38, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  toggleBtnOn: { backgroundColor: t.primary[600] },
  toggleText: { fontSize: 12.5, lineHeight: 16, color: t.neutral[500], ...font(500) },
  toggleTextOn: { color: t.neutral[0] },
}));
