import { Pressable, StyleSheet, Text, View } from 'react-native';
import { font, ink, t, themed } from '../../../theme';
import { MONTHS } from './format';

/*
 * Small pieces the Insights cards share (Seller Center › Analytics, the ML
 * engine's Phase 3): a tag, a row button, "Show all", a grey note and a
 * day / month written the way the rest of Analytics writes them.
 */

/** "2026-11-14" -> "Nov 14", read as a calendar day (no time zone shift). */
export const dayLabel = (ymd) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}` : '';
};

/** "2026-06" -> "Jun". */
export const monthLabel = (ym) => {
  const m = /^(\d{4})-(\d{2})/.exec(String(ym || ''));
  return m ? MONTHS[Number(m[2]) - 1] : '';
};

/** A figure for a count of units: whole when it is whole, else one decimal. */
export const units = (v) => {
  const n = Number(v || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

export const plural = (n, one, many = `${one}s`) => (Number(n) === 1 ? one : many);

/** A small tag (.badge): danger, warning, neutral or brand. */
export function Tag({ tone = 'neutral', children }) {
  const look = {
    danger: { backgroundColor: t.danger[50], color: t.danger[700] },
    warning: { backgroundColor: t.warning[50], color: t.warning[700] },
    brand: { backgroundColor: t.primary[50], color: t.primary[700] },
    neutral: { backgroundColor: t.neutral[100], color: t.neutral[600] },
  }[tone] || { backgroundColor: t.neutral[100], color: t.neutral[600] };
  return (
    <View style={[styles.tag, { backgroundColor: look.backgroundColor }]}>
      <Text style={[styles.tagText, { color: look.color }]} numberOfLines={1}>{children}</Text>
    </View>
  );
}

/**
 * A row's small white button (Bundle ideas' "Make a package"). Without
 * onPress it is only the look, for a row that is itself the button (a
 * button inside a button is not allowed on the web build).
 */
export function RowButton({ label, Icon, onPress, accessibilityLabel }) {
  if (!onPress) {
    return (
      <View style={styles.btn} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {Icon ? <Icon size={15} color={t.primary[700]} /> : null}
        <Text style={styles.btnText}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      {Icon ? <Icon size={15} color={t.primary[700]} /> : null}
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

/** "Show all 12" / "Show fewer" under a cut list. */
export function ShowMore({ open, total, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.more, pressed && styles.morePressed]}>
      <Text style={styles.moreText}>{open ? 'Show fewer' : `Show all ${total}`}</Text>
    </Pressable>
  );
}

/** A grey line inside a card: what a figure means, or why there is none yet. */
export function CardNote({ children, style }) {
  return <Text style={[styles.note, style]}>{children}</Text>;
}

export const insightStyles = themed(() => StyleSheet.create({
  // .an-toplist's rows.
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: ink(0.05),
  },
  rowLast: { borderBottomWidth: 0 },
  rowPressed: { backgroundColor: t.neutral[50] },
  body: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, fontSize: 13.5, lineHeight: 18, color: t.neutral[900], ...font(500) },
  sub: { fontSize: 12, lineHeight: 16, color: t.neutral[500], ...font(400) },
  strong: { color: t.neutral[900], ...font(500) },
  // Two or three figures across (.an-kpi's figure and label, inside a card).
  figures: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  figure: { flex: 1, minWidth: 0, gap: 2 },
  figureValue: { fontSize: 22, lineHeight: 25.3, color: t.neutral[900], fontVariant: ['tabular-nums'], ...font(700) },
  figureValueSmall: { fontSize: 17, lineHeight: 21, color: t.neutral[900], fontVariant: ['tabular-nums'], ...font(700) },
  figureLabel: { fontSize: 12.5, lineHeight: 17, color: t.neutral[700], ...font(600) },
  figureHint: { fontSize: 11.5, lineHeight: 15.5, color: t.neutral[500], ...font(400) },
  divider: { height: 1, backgroundColor: ink(0.05) },
}));

const styles = themed(() => StyleSheet.create({
  tag: { flexShrink: 0, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6 },
  tagText: { fontSize: 11, lineHeight: 15, ...font(600) },

  btn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, marginTop: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  btnPressed: { backgroundColor: t.neutral[50] },
  btnText: { fontSize: 13, lineHeight: 18, color: t.primary[700], ...font(500) },

  more: {
    alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: ink(0.05),
  },
  morePressed: { backgroundColor: t.neutral[50] },
  moreText: { fontSize: 13, lineHeight: 18, color: t.primary[700], ...font(500) },

  note: { paddingHorizontal: 16, paddingBottom: 14, fontSize: 12, lineHeight: 17, color: t.neutral[500], ...font(400) },
}));
