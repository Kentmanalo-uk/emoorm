import { StyleSheet, Text, View } from 'react-native';
import { StarIcon } from '../lib/icons';
import { font, t, themed } from '../theme';

/*
 * A product's rating line, as the product tiles show it (web Home.jsx
 * ProductStats): ProductCard, TodayCard, the product page's shelves and the
 * long-press preview (peek/ProductPeek) all use it.
 */

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

const styles = themed(() => StyleSheet.create({
  stats: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 12, marginTop: 2 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  count: { fontSize: 12, lineHeight: 12, ...font(400), color: t.neutral[500] },
}));
