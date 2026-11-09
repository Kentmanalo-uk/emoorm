import { memo, useState } from 'react';
import {
  Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { saleInfo } from '../../lib/variantPricing';
import { font, t, themed } from '../../theme';
import ProductImage from '../ProductImage';
import KindPrice from '../product/KindPrice';
import { parseImages } from '../product/productLib';
import useOpenProduct from '../useOpenProduct';
import { colorMix, plgColors } from './plgTheme';

/*
 * "Top Palengke" (web/src/components/palengke/PalengkeTop.jsx, phone
 * layout): the three best-selling palengke products (units sold), Top 1 in
 * the middle and a little larger, each with its ribbon. The page shows it
 * only when three products have really sold, so the ranking is never made up.
 */

const RIBBONS = {
  1: { bg: '#F5B301', ink: '#5A3A00', size: 12, n: 17 },
  2: { bg: '#CBD5E1', ink: '#334155', size: 11, n: 14 },
  3: { bg: '#E9A46A', ink: '#5B2A0A', size: 11, n: 14 },
};
const NOTCH = 7;

/** The flat ribbon, a swallowtail cut into its end (the website's clip-path). */
function Ribbon({ rank }) {
  const r = RIBBONS[rank];
  const [box, setBox] = useState(null);
  const w = box?.w || 0;
  const h = box?.h || 0;
  return (
    <View
      style={styles.ribbon}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== w || height !== h) setBox({ w: width, h: height });
      }}
      accessibilityLabel={`Top ${rank}`}
    >
      {w ? (
        <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path
            d={`M8 0H${w}L${w - NOTCH} ${h / 2}L${w} ${h}H8A8 8 0 0 1 0 ${h - 8}V8A8 8 0 0 1 8 0Z`}
            fill={r.bg}
          />
        </Svg>
      ) : null}
      <Text style={[styles.ribbonText, { color: r.ink, fontSize: r.size, lineHeight: r.n }]}>
        Top{' '}
        <Text style={[styles.ribbonN, { fontSize: r.n }]}>{rank}</Text>
      </Text>
    </View>
  );
}

function RankCard({ product, rank, width }) {
  const openProduct = useOpenProduct();
  const photo = parseImages(product.images)[0];
  const c = plgColors();
  return (
    <View style={{ width }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Top ${rank}: ${product.name}`}
        onPress={() => openProduct({ slug: product.slug, photo, seed: product })}
        style={({ pressed }) => [
          styles.card,
          rank === 1 && { backgroundColor: colorMix(c.gold, 0.22, t.neutral[0]) },
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.photo}>
          <ProductImage src={photo} width={width} style={styles.photoImg} />
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.price}>
            <KindPrice product={product} size={13.5}>₱{saleInfo(product).price.toFixed(2)}</KindPrice>
          </Text>
          <Text style={styles.sold}>{Number(product.soldCount)} sold</Text>
        </View>
      </Pressable>
      <Ribbon rank={rank} />
    </View>
  );
}

function PalengkeTop({ products }) {
  const { width: screenW } = useWindowDimensions();
  const c = plgColors();
  // grid-template-columns: 1fr 1.16fr 1fr, 7px apart, inside 10px margins
  // and 10px padding.
  const inner = Math.min(screenW - 40, 680) - 14;
  const side = Math.floor((inner / 3.16) * 100) / 100;
  const middle = Math.floor((inner - side * 2) * 100) / 100;
  // Top 2, Top 1, Top 3, left to right.
  const order = [[products[1], 2], [products[0], 1], [products[2], 3]];
  return (
    <View style={[styles.top, { backgroundColor: colorMix(c.gold, 0.08, t.neutral[0]) }]}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">Top Palengke</Text>
        <Text style={styles.sub}>Most sold</Text>
      </View>
      <View style={styles.row} accessibilityRole="list">
        {order.map(([p, rank]) => (p ? (
          <RankCard key={p.id} product={p} rank={rank} width={rank === 1 ? middle : side} />
        ) : null))}
      </View>
    </View>
  );
}

export default memo(PalengkeTop);

const styles = themed(() => StyleSheet.create({
  top: {
    marginTop: 4, marginHorizontal: 10, paddingTop: 14, paddingHorizontal: 10, paddingBottom: 14, borderRadius: 20,
  },
  head: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4,
  },
  title: {
    fontSize: 20, lineHeight: 23, letterSpacing: -0.3, ...font(800), color: t.primary[700],
  },
  sub: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  row: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 7, marginTop: 16,
  },
  card: { borderRadius: 14, backgroundColor: t.neutral[0] },
  pressed: { opacity: 0.85 },
  photo: {
    width: '100%', aspectRatio: 1, overflow: 'hidden', borderTopLeftRadius: 14, borderTopRightRadius: 14,
    backgroundColor: t.neutral[100],
  },
  photoImg: { width: '100%', height: '100%' },
  info: { gap: 1, paddingTop: 6, paddingHorizontal: 7, paddingBottom: 8 },
  name: {
    minHeight: 32.5, fontSize: 12.5, lineHeight: 16.25, ...font(400), color: t.neutral[800],
  },
  price: { fontSize: 13.5, lineHeight: 21.6, ...font(700), color: t.primary[700] },
  sold: { fontSize: 11, lineHeight: 17.6, ...font(400), color: t.neutral[500] },
  ribbon: {
    position: 'absolute', top: -7, left: -4, zIndex: 1, flexDirection: 'row',
    paddingTop: 4, paddingRight: 13, paddingBottom: 4, paddingLeft: 7,
  },
  ribbonText: { ...font(700) },
  ribbonN: { ...font(800) },
}));
