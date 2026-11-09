import { memo, useRef } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { CheckIcon } from '../../lib/icons';
import useAppSettings, { shortcutLook } from '../../lib/appSettings';
import { font, t, themed } from '../../theme';
import {
  BasketArt, FishArt, LivestockArt, PiggyArt, TONES, TrendArt,
} from '../art/FlatArt';
import { GulayMark, PrutasMark } from './PalengkeMarks';
import { colorMix } from './plgTheme';

/*
 * The cards under the band (web/src/components/palengke/PalengkeCards.jsx,
 * phone layout): what kind of produce (a category, by slug, as GET
 * /products?categorySlug= takes it) and two ways to order the list. The
 * marks are the Home shortcuts' own, in the look the super admin chose for
 * them. The rest is flat: a pill in one deep shade of the mark's hue that
 * white reads on, a pale wash of its tint behind the card (a stronger one
 * when chosen).
 */
export const PLG_KINDS = [
  { slug: '', label: 'Lahat', name: 'Everything', art: (s, look) => <BasketArt size={s} look={look} />, color: '#047857', tint: TONES.green[0] },
  { slug: 'vegetables', label: 'Gulay', name: 'Vegetables', art: (s, look) => <GulayMark size={s} look={look} />, color: '#15803D', tint: TONES.emerald[0] },
  { slug: 'fruits', label: 'Prutas', name: 'Fruits', art: (s, look) => <PrutasMark size={s} look={look} />, color: '#C2410C', tint: TONES.orange[0] },
  { slug: 'seafood', label: 'Seafood', name: 'Seafood', art: (s, look) => <FishArt size={s} look={look} />, color: '#0369A1', tint: TONES.sky[0] },
  { slug: 'livestock', label: 'Hayop', name: 'Livestock', art: (s, look) => <LivestockArt size={s} look={look} />, color: '#B45309', tint: TONES.amber[0] },
];

export const PLG_ORDERS = [
  // A soft hyphen: the long word may break in the pill.
  { key: 'top-sales', label: 'Pinaka­mabenta', art: (s, look) => <TrendArt size={s} look={look} />, color: '#B91C1C', tint: TONES.red[0] },
  { key: 'price-low', label: 'Pinaka­mura', art: (s, look) => <PiggyArt size={s} look={look} />, color: '#6D28D9', tint: TONES.violet[0] },
];

const CARD_W = 80;
const ROW_PAD = 12;
const GAP = 8;
const MARK = 50;

const Card = memo(function Card({
  on, label, art, color, tint, onPress, look, onLayout,
}) {
  // The soft hyphen does not count: "Pinakamura" is a long word too.
  const long = label.replace(/­/g, '').length > 9;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label.replace(/­/g, '')}
      onPress={onPress}
      onLayout={onLayout}
      style={[styles.card, { backgroundColor: colorMix(tint, on ? 0.46 : 0.16, t.neutral[0]) }]}
    >
      <View style={styles.art}>{art(MARK, look)}</View>
      <View style={[styles.pill, { backgroundColor: color }]}>
        <Text style={[styles.pillText, long && styles.pillLong]} numberOfLines={2}>{label}</Text>
      </View>
      {on ? (
        <View style={[styles.check, { backgroundColor: color }]}>
          <CheckIcon size={11} weight="bold" color="#FFFFFF" />
        </View>
      ) : null}
    </Pressable>
  );
});

/**
 * kinds: the kinds whose category exists (the page filters PLG_KINDS).
 * cat / sort: what is chosen; onCat(slug) / onSort(key) choose. A sort card
 * chosen again goes back to the newest first.
 */
export default function PalengkeCards({
  kinds, cat, sort, onCat, onSort,
}) {
  const look = shortcutLook(useAppSettings());
  const { width: screenW } = useWindowDimensions();
  const row = useRef(null);
  const scrolled = useRef(false);
  // A chosen card past the screen's edge (an order, opened from a link):
  // the row starts scrolled to show it. Once, on the first layout.
  const reveal = (e) => {
    if (scrolled.current) return;
    scrolled.current = true;
    const { x, width } = e.nativeEvent.layout;
    const past = x + width + ROW_PAD - screenW;
    if (past > 0) row.current?.scrollTo({ x: past, animated: false });
  };
  const sortOn = Boolean(PLG_ORDERS.find((o) => o.key === sort));
  return (
    <ScrollView
      ref={row}
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={styles.rowInner}
      accessibilityRole="toolbar"
      accessibilityLabel="Filter the palengke"
    >
      {kinds.map((k) => (
        <Card
          key={k.slug || 'all'}
          on={cat === k.slug}
          label={k.label}
          art={k.art}
          color={k.color}
          tint={k.tint}
          look={look}
          onPress={() => onCat(k.slug)}
        />
      ))}
      <View style={styles.gap} />
      {PLG_ORDERS.map((o) => (
        <Card
          key={o.key}
          on={sort === o.key}
          label={o.label}
          art={o.art}
          color={o.color}
          tint={o.tint}
          look={look}
          onPress={() => onSort(sort === o.key ? '' : o.key)}
          onLayout={sortOn && sort === o.key ? reveal : undefined}
        />
      ))}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexGrow: 0 },
  rowInner: {
    flexDirection: 'row', alignItems: 'stretch', gap: GAP, paddingTop: 2, paddingHorizontal: ROW_PAD, paddingBottom: 10,
  },
  card: {
    width: CARD_W, alignItems: 'center', gap: 5, paddingTop: 8, paddingHorizontal: 5, paddingBottom: 6, borderRadius: 16,
  },
  art: { height: 52, alignItems: 'center', justifyContent: 'center' },
  pill: {
    alignSelf: 'stretch', height: 28, marginTop: 'auto', paddingVertical: 2, paddingHorizontal: 5, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  pillText: { fontSize: 12, lineHeight: 12.6, ...font(700), color: '#FFFFFF', textAlign: 'center' },
  pillLong: { fontSize: 10.5, lineHeight: 10.3 },
  check: {
    position: 'absolute', top: 4, right: 4, width: 17, height: 17, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  gap: { width: 1, marginVertical: 22, marginHorizontal: 2, backgroundColor: t.neutral[200] },
}));
