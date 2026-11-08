import { StyleSheet, Text, View } from 'react-native';
import { liveMode, modeLabel } from '../lib/availability';
import { font, t, themed } from '../theme';

const TONES = themed(() => ({
  READY_NOW: t.primary[600],
  MADE_TO_ORDER: t.orange[700],
  PRE_ORDER: t.accent[600],
}));

/**
 * The kind of an Available Today listing (Ready now, Made to order,
 * Pre-order) as a small filled tag (web/src/components/today/TodayTag.jsx).
 * A View, so it can sit inline at the start of a product name's <Text>.
 * `size` is the label's font size: 10.5 in product cards on phones.
 *
 * The gap after it is padding on an outer View, not a margin: Android can
 * drop the margin of a View sitting inside a <Text>, which leaves the tag
 * touching the name.
 */
export default function TodayTag({ mode, size = 10.5, style }) {
  if (!mode) return null;
  return (
    <View style={[styles.slot, style]}>
      <View style={[styles.tag, { backgroundColor: TONES[mode] || t.primary[600] }]}>
        <Text style={[styles.label, { fontSize: size, lineHeight: size * 1.6, letterSpacing: size * 0.01 }]}>{modeLabel(mode)}</Text>
      </View>
    </View>
  );
}

/**
 * On a product card: the tag when the product is a live Available Today
 * item; nothing for a menu item that isn't posted now (its page says so).
 */
export function ProductTodayTag({ product, size = 10.5, style }) {
  const mode = liveMode(product);
  return mode ? <TodayTag mode={mode} size={size} style={style} /> : null;
}

/**
 * "Best seller": the product its shop has sold the most of (the server sets
 * storeBestSeller; backend bestSeller.service). Drawn like the Pre-order
 * tag, in gold (web product/BestSellerTag.jsx).
 */
export function BestSellerTag({ product, size = 10.5, style }) {
  if (!product?.storeBestSeller) return null;
  return (
    <View style={[styles.slot, style]}>
      <View style={[styles.tag, styles.bestSeller]}>
        <Text style={[styles.label, { fontSize: size, lineHeight: size * 1.6, letterSpacing: size * 0.01 }]}>Best seller</Text>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  bestSeller: { backgroundColor: '#b7791f' },
  slot: { paddingRight: 8 },
  tag: { paddingHorizontal: 5, borderRadius: 3 },
  label: { ...font(500), color: t.onBrand },
}));
