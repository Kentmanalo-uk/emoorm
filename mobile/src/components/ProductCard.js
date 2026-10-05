import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPinIcon, StarIcon } from 'phosphor-react-native';
import { saleInfo } from '../lib/variantPricing';
import { font, t } from '../theme';
import ProductImage from './ProductImage';
import { SaleWas } from './SaleTag';
import { ProductTodayTag } from './TodayTag';

/*
 * The website's phone product tile.
 *
 *   variant="home"    Home's "Suggested for You" / "Explore Products" tile
 *                     (web/src/pages/Home.jsx HomeProductCard, ProductStats)
 *   variant="result"  the search results' tile (web/src/pages/Products.jsx
 *                     .srch-card): larger price, "★ 4.5 | 12 sold", the town
 *
 * Pass the API's `product`; the card fills the width its parent gives it
 * (the website's grids: 2 columns, 4px apart). Tapping opens the product
 * unless `onPress` is given. Phones have no add-to-cart button on the card.
 *
 * Older callers still pass name / price / imageUrl / rating / reviewCount
 * with variant "grid" (48% wide) or "list" (a row).
 */
export default function ProductCard({
  product,
  variant,
  onPress,
  style,
  name,
  price,
  imageUrl,
  rating = 0,
  reviewCount = 0,
}) {
  const router = useRouter();
  const p = product || { name, price, averageRating: rating, reviewCount, images: imageUrl ? [imageUrl] : [] };
  const look = variant || (product ? 'home' : 'grid');
  const result = look === 'result';
  const list = look === 'list';
  const open = onPress || (p.slug ? () => router.push(`/product/${p.slug}`) : undefined);
  const { price: now } = saleInfo(p);
  const town = p.municipality?.name || p.store?.municipality?.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.name}
      onPress={open}
      style={[styles.card, look === 'grid' && styles.cardGrid, list && styles.cardList, style]}
    >
      <View style={[styles.image, list && styles.imageList]}>
        <ProductImage src={p.images?.[0]} style={StyleSheet.absoluteFill} />
        {result && p.stock === 0 ? <Text style={[styles.badge, styles.badgeOut]}>Out of Stock</Text> : null}
        {result && p.isFeatured ? <Text style={[styles.badge, styles.badgeFeatured]}>Featured</Text> : null}
      </View>

      <View style={[styles.info, list && styles.infoList]}>
        <Text style={[styles.name, result && styles.nameResult]} numberOfLines={2}>
          <ProductTodayTag product={p} style={styles.tag} />
          {p.name}
        </Text>

        {result ? (
          <>
            <View style={styles.priceRow}>
              <Text style={styles.priceResult}>
                ₱{now.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <SaleWas product={p} compact style={styles.was} />
            </View>
            <ResultMeta product={p} />
            {town ? (
              <View style={styles.place}>
                <MapPinIcon size={13} color={t.neutral[500]} />
                <Text style={styles.placeText} numberOfLines={1}>{town}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={[styles.priceRow, styles.priceRowHome]}>
              <Text style={styles.price}>₱{now.toFixed(2)}</Text>
              <SaleWas product={p} compact style={styles.was} />
            </View>
            <ProductStats product={p} />
          </>
        )}
      </View>
    </Pressable>
  );
}

/** Five small stars for an average rating (filled up to the rounded rating). */
export function ProductStars({ rating, size = 11 }) {
  const filled = Math.round(Number(rating || 0));
  return (
    <View style={styles.stars} accessibilityLabel={`Rated ${Number(rating || 0).toFixed(1)} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarIcon
          key={i}
          size={size}
          weight={i < filled ? 'fill' : 'regular'}
          color={i < filled ? t.warning[500] : t.neutral[300]}
        />
      ))}
    </View>
  );
}

/** Stars only from real reviews; sold only from settled orders; else "New". */
export function ProductStats({ product }) {
  const reviews = Number(product.reviewCount || 0);
  const sold = Number(product.soldCount || 0);
  return (
    <View style={styles.stats}>
      {reviews === 0 && sold === 0 ? <Text style={styles.count}>New</Text> : null}
      {reviews > 0 ? (
        <>
          <ProductStars rating={product.averageRating} />
          <Text style={styles.count}>({reviews})</Text>
        </>
      ) : null}
      {sold > 0 ? <Text style={styles.count}>{sold} sold</Text> : null}
    </View>
  );
}

/** The result tile's "★ 4.5 | 12 sold" (or "New"), divided by thin rules. */
function ResultMeta({ product }) {
  const reviews = Number(product.reviewCount || 0);
  const sold = Number(product.soldCount || 0);
  const parts = [];
  if (reviews > 0) {
    parts.push(
      <View key="rating" style={styles.rating}>
        <StarIcon size={13} weight="fill" color={t.warning[500]} />
        <Text style={[styles.metaText, styles.ratingText]}>{Number(product.averageRating || 0).toFixed(1)}</Text>
      </View>,
    );
  }
  if (sold > 0) parts.push(<Text key="sold" style={styles.metaText}>{sold} sold</Text>);
  if (!parts.length) parts.push(<Text key="new" style={[styles.metaText, styles.newText]}>New</Text>);
  return (
    <View style={styles.meta}>
      {parts.map((part, i) => (i ? <View key={part.key} style={styles.metaRule}>{part}</View> : part))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Phones: square corners, white tile (index.css .layout-main .product-card).
  card: { minWidth: 0, overflow: 'hidden', backgroundColor: t.neutral[0] },
  cardGrid: { width: '48%' },
  cardList: { width: '100%', flexDirection: 'row' },
  image: { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[100] },
  imageList: { width: 96, height: 96, aspectRatio: undefined },

  info: { paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10, gap: 3 },
  infoList: { flex: 1, justifyContent: 'center' },
  name: { minHeight: 43.2, fontSize: 16, lineHeight: 21.6, ...font(400), color: t.neutral[800] },
  nameResult: { color: t.secondary[950] },
  // vertical-align: 1px on the website.
  tag: { position: 'relative', top: -1 },

  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  priceRowHome: { marginTop: 2 },
  price: { fontSize: 15, lineHeight: 18, ...font(500), color: t.primary[600] },
  priceResult: { fontSize: 17, lineHeight: 27.2, ...font(500), color: t.primary[700], fontVariant: ['tabular-nums'] },
  // The space between the price and the old price.
  was: { marginLeft: 4 },

  stats: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 12, marginTop: 2 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  count: { fontSize: 12, lineHeight: 12, ...font(400), color: t.neutral[500] },

  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  metaRule: { paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: t.neutral[200] },
  metaText: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: t.neutral[700] },
  newText: { color: t.primary[700] },

  place: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  placeText: { flexShrink: 1, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },

  badge: {
    position: 'absolute', top: 6, left: 6, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden',
    fontSize: 11, lineHeight: 14, ...font(500), color: '#fff', textTransform: 'uppercase',
  },
  badgeOut: { backgroundColor: t.danger[500] },
  badgeFeatured: { backgroundColor: t.warning[500] },
});
