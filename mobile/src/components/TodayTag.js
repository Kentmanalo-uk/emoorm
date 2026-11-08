import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
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
  // Its own gradient ids: two tags on a screen must not share them.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!product?.storeBestSeller) return null;
  return (
    <View style={[styles.slot, style]}>
      <View style={[styles.tag, styles.bestSeller]}>
        {/* Polished gold, as on the website: a deeper gold underneath, a
            glossy band of light over the top half and a bright top edge;
            no shadow. Hex stops with stopOpacity (iOS drops rgba alpha). */}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={`bsg${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff1a8" />
              <Stop offset="0.34" stopColor="#ffd23f" />
              <Stop offset="0.72" stopColor="#f5a800" />
              <Stop offset="1" stopColor="#d98c00" />
            </LinearGradient>
            <LinearGradient id={`bss${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <Stop offset="0.46" stopColor="#ffffff" stopOpacity="0.12" />
              <Stop offset="0.52" stopColor="#ffffff" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#bsg${uid})`} />
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#bss${uid})`} />
          <Rect x="0" y="0" width="100%" height="1" fill="#ffffff" fillOpacity="0.95" />
        </Svg>
        <Text style={[styles.label, styles.bestSellerLabel, { fontSize: size, lineHeight: size * 1.6, letterSpacing: size * 0.01 }]}>Best seller</Text>
      </View>
    </View>
  );
}

/**
 * The labels a seller can put on a product (product.badge; backend
 * utils/productBadges.js), with their tag style: Pre-order in the Pre-order
 * tag's pink, Palengke a fresh-market green (not Ready now's), DIY violet
 * (web components/product/ProductBadge.jsx). Only a label.
 */
export const PRODUCT_BADGES = [
  { key: 'PRE_ORDER', label: 'Pre-order', tone: 'badgePreOrder' },
  { key: 'PALENGKE', label: 'Palengke', tone: 'badgePalengke' },
  { key: 'DIY', label: 'DIY', tone: 'badgeDiy' },
];

const badgeOf = (key) => PRODUCT_BADGES.find((b) => b.key === key) || null;

/** One badge as its tag, by key (the seller form's choices use it too). */
export function BadgeTag({ badge, size = 10.5, style }) {
  const b = badgeOf(badge);
  if (!b) return null;
  return (
    <View style={[styles.slot, style]}>
      <View style={[styles.tag, styles[b.tone]]}>
        <Text style={[styles.label, { fontSize: size, lineHeight: size * 1.6, letterSpacing: size * 0.01 }]}>{b.label}</Text>
      </View>
    </View>
  );
}

/**
 * The seller's badge before a product's name. `todayMode` is the Available
 * Today tag shown next to it (by default the live one, as cards show it): a
 * Pre-order post already says Pre-order, so the seller's is not shown twice.
 */
export function ProductBadge({ product, todayMode, size = 10.5, style }) {
  const badge = product?.badge;
  if (!badgeOf(badge)) return null;
  const shown = todayMode === undefined ? liveMode(product) : todayMode;
  if (badge === 'PRE_ORDER' && shown === 'PRE_ORDER') return null;
  return <BadgeTag badge={badge} size={size} style={style} />;
}

const styles = themed(() => StyleSheet.create({
  // Gold drawn by the Svg inside; a fine darker-gold edge holds the shape.
  bestSeller: {
    overflow: 'hidden', paddingHorizontal: 4, borderWidth: 1, borderColor: 'rgba(176, 112, 0, 0.6)', backgroundColor: '#f5a800',
  },
  bestSellerLabel: { ...font(700), color: '#4a2c00' },
  badgePreOrder: { backgroundColor: t.accent[600] },
  badgePalengke: { backgroundColor: '#4d7c0f' },
  badgeDiy: { backgroundColor: '#6d28d9' },
  slot: { paddingRight: 8 },
  tag: { paddingHorizontal: 5, borderRadius: 3 },
  label: { ...font(500), color: t.onBrand },
}));
