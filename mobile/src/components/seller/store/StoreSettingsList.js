import { Children } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretRightIcon } from '../../../lib/icons';
import { font, ink, t, themed } from '../../../theme';

/*
 * Phones: a settings page broken into its parts, one row each showing what
 * is set now; each row opens a page that edits just that part (web
 * components/seller/SettingsList.jsx + .css, .scm-setlist). In the Seller
 * Center the list runs edge to edge (styles/phone-app.css), so it pulls out
 * of the page's 12px gutters.
 */
export function SettingsList({ children, label, style }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View accessibilityLabel={label} style={[styles.list, style]}>
      {rows.map((row, i) => <View key={row.key ?? i} style={i > 0 && styles.line}>{row}</View>)}
    </View>
  );
}

/**
 * onPress: open the part's page (without it the row only shows its value).
 * value: a string, or { swatches: [color, …], text } for the colours row.
 * missing: nothing set yet, the value reads as a warning. tag: e.g. "Needed to sell".
 */
export function SettingsRow({ onPress, Icon, label, value, missing = false, tag = null }) {
  const swatches = value && typeof value === 'object' ? value.swatches || [] : [];
  const text = value && typeof value === 'object' ? value.text : value;
  const body = (
    <>
      <View style={styles.icon}><Icon size={20} weight="fill" color={t.neutral[900]} /></View>
      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        <View style={styles.valueRow}>
          {swatches.map((c, i) => (
            <View key={i} style={[styles.swatch, { backgroundColor: c }, i === swatches.length - 1 ? styles.swatchLast : null]} />
          ))}
          <Text style={[styles.value, missing && styles.missing]} numberOfLines={1}>{text}</Text>
        </View>
      </View>
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      {onPress ? <CaretRightIcon size={16} color={t.neutral[300]} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {body}
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { marginHorizontal: -12, backgroundColor: t.neutral[0] },
  line: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 12, paddingLeft: 16, paddingRight: 14 },
  pressed: { backgroundColor: t.neutral[50] },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  valueRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  value: { flexShrink: 1, fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  missing: { color: t.warning[700] },
  swatch: {
    width: 12,
    height: 12,
    marginRight: 4,
    borderRadius: 6,
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, inset: true, color: ink(0.12) }],
  },
  swatchLast: { marginRight: 8 },
  tag: {
    flexShrink: 0,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: t.accent[50],
    color: t.accent[700],
    fontSize: 11.5,
    lineHeight: 15,
    ...font(500),
  },
}));
