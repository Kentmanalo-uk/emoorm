import { StyleSheet, Text, View } from 'react-native';
import { liveMode, modeLabel } from '../lib/availability';
import { font, t } from '../theme';

const TONES = {
  READY_NOW: t.primary[600],
  MADE_TO_ORDER: t.orange[700],
  PRE_ORDER: t.accent[600],
};

/**
 * The kind of an Available Today listing (Ready now, Made to order,
 * Pre-order) as a small filled tag (web/src/components/today/TodayTag.jsx).
 * A View, so it can sit inline at the start of a product name's <Text>.
 * `size` is the label's font size: 10.5 in product cards on phones.
 */
export default function TodayTag({ mode, size = 10.5, style }) {
  if (!mode) return null;
  return (
    <View style={[styles.tag, { backgroundColor: TONES[mode] || t.primary[600] }, style]}>
      <Text style={[styles.label, { fontSize: size, lineHeight: size * 1.6, letterSpacing: size * 0.01 }]}>{modeLabel(mode)}</Text>
    </View>
  );
}

/** On a product card: the tag when the product is a live Available Today item. */
export function ProductTodayTag({ product, size, style }) {
  const mode = liveMode(product);
  return mode ? <TodayTag mode={mode} size={size} style={style} /> : null;
}

const styles = StyleSheet.create({
  tag: { marginRight: 5, paddingHorizontal: 5, borderRadius: 3 },
  label: { ...font(500), color: '#fff' },
});
