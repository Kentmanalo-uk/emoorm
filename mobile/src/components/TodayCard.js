import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ClockIcon, MapPinIcon, StarIcon } from 'phosphor-react-native';
import { isEndingSoon, shortLeft, windowState } from '../lib/availability';
import { saleInfo } from '../lib/variantPricing';
import { font, t } from '../theme';
import { ProductStars } from './ProductCard';
import ProductImage from './ProductImage';
import { peso, SaleWas } from './SaleTag';
import TodayTag from './TodayTag';

/**
 * One Available Today listing (an item from GET /today) as a product tile
 * (web/src/components/today/TodayCard.jsx): the picture, the name with its
 * kind as a tag in front, the price, then the stars / sold / "New" row ending
 * with the time left to order.
 *
 * `result`: the phone result list's look (the /today page): a larger price,
 * "★ 4.5 | 12 sold" and the town under it.
 * The card fills its parent's width (Home's row: 150 wide).
 */
export default function TodayCard({ item, result = false, onPress, style }) {
  const router = useRouter();
  const { product, store } = item;
  const remaining = item.remaining ?? product?.stock ?? null;
  const state = windowState(item, remaining);
  const soldOut = state.tone === 'ended';
  const reviews = Number(product.reviewCount || 0);
  const rating = Number(product.averageRating || 0);
  const sold = Number(product.soldCount || 0);
  const town = store?.municipality?.name;
  const soon = isEndingSoon(item.ordersCloseAt);
  const open = onPress || (() => router.push(`/product/${product.slug}`));

  const left = !soldOut && state.tone === 'live' ? (
    <View key="left" style={styles.time} accessibilityLabel={state.text}>
      <ClockIcon size={11} weight="bold" color={soon ? t.accent[700] : t.neutral[500]} />
      <Text style={[styles.timeText, result && styles.timeTextResult, soon && styles.timeSoon]}>
        {shortLeft(item.ordersCloseAt)} left
      </Text>
    </View>
  ) : null;

  // The result look's meta: rules between rating, sold and "New", not before the time.
  const meta = [];
  if (reviews > 0) {
    meta.push(
      <View key="rating" style={styles.rating}>
        <StarIcon size={13} weight="fill" color={t.warning[500]} />
        <Text style={[styles.metaText, styles.ratingText]}>{rating.toFixed(1)}</Text>
      </View>,
    );
  }
  if (sold > 0) meta.push(<Text key="sold" style={styles.metaText}>{sold} sold</Text>);
  if (reviews === 0 && sold === 0) meta.push(<Text key="new" style={[styles.metaText, styles.newText]}>New</Text>);

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={product.name} onPress={open} style={[styles.card, style]}>
      <View style={styles.image}>
        <ProductImage src={product.images?.[0]} style={StyleSheet.absoluteFill} />
        {!soldOut && remaining != null && remaining <= 5 ? (
          <Text style={styles.leftBadge}>{remaining} left</Text>
        ) : null}
        {soldOut ? (
          <View style={styles.cover}><Text style={styles.coverText}>{state.text}</Text></View>
        ) : null}
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, soldOut && styles.out]} numberOfLines={2}>
          <TodayTag mode={item.mode} style={styles.tag} />
          {product.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, result && styles.priceResult, soldOut && styles.out]} numberOfLines={1}>
            {peso(saleInfo(product).price)}
          </Text>
          <SaleWas product={product} compact style={styles.was} />
        </View>

        {result ? (
          <>
            <View style={styles.meta}>
              {meta.map((part, i) => (i ? <View key={part.key} style={styles.metaRule}>{part}</View> : part))}
              {left}
            </View>
            {town ? (
              <View style={styles.place}>
                <MapPinIcon size={13} color={t.neutral[500]} />
                <Text style={styles.metaText} numberOfLines={1}>{town}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.stats}>
            {reviews === 0 && sold === 0 ? <Text style={styles.count}>New</Text> : null}
            {reviews > 0 ? (
              <>
                <ProductStars rating={rating} />
                <Text style={styles.count}>({reviews})</Text>
              </>
            ) : null}
            {sold > 0 ? <Text style={styles.count}>{sold} sold</Text> : null}
            {left}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { minWidth: 0, overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[0] },
  image: { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[100] },
  leftBadge: {
    position: 'absolute', right: 6, bottom: 6, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 3, overflow: 'hidden',
    backgroundColor: 'rgba(17, 24, 39, 0.72)', color: '#fff', fontSize: 11, lineHeight: 16.5, ...font(500),
  },
  cover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.72)' },
  coverText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[800] },

  info: { flex: 1, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10, gap: 3 },
  name: { minHeight: 43.2, fontSize: 16, lineHeight: 21.6, ...font(400), color: t.neutral[800] },
  tag: { position: 'relative', top: -1 },
  out: { color: t.neutral[500] },

  // One line; a long sale price is cut off at the card's edge (white-space: nowrap).
  priceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, minWidth: 0, overflow: 'hidden' },
  price: { flexShrink: 0, fontSize: 15, lineHeight: 18, ...font(500), color: t.primary[600] },
  priceResult: { fontSize: 17, lineHeight: 20.4, color: t.primary[700], fontVariant: ['tabular-nums'] },
  was: { flexShrink: 0, marginLeft: 4 },

  stats: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0, marginTop: 2 },
  // white-space: nowrap: the row runs past the card's edge rather than wrapping.
  count: { flexShrink: 0, fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.neutral[500] },
  time: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 3, marginLeft: 'auto' },
  timeText: { fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.neutral[500], fontVariant: ['tabular-nums'] },
  timeTextResult: { fontSize: 12, lineHeight: 19.2 },
  timeSoon: { color: t.accent[700] },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  metaRule: { paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: t.neutral[200] },
  metaText: { flexShrink: 1, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: t.neutral[700] },
  newText: { color: t.primary[700] },
  place: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
});
