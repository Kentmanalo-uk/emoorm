import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { StarIcon } from 'phosphor-react-native';
import CartProductImage from './CartProductImage';
import { font, t } from '../../theme';

/*
 * "You may also like" under the cart (web Cart.jsx suggestionsSection,
 * Cart.css .cart-suggestions ≤768px): a title with See more, then a 2-up grid
 * of small product cards (photo, two-line name, price, stars or "New").
 * While loading: four grey skeleton cards.
 */

// Stars only from real review data; unreviewed products read "New".
function SuggestionRating({ product }) {
  const count = Number(product.reviewCount ?? 0);
  if (count <= 0) {
    return (
      <View style={styles.rating}>
        <Text style={styles.count}>New</Text>
      </View>
    );
  }
  const filled = Math.round(Number(product.averageRating || 0));
  return (
    <View style={styles.rating}>
      <View style={styles.stars}>
        {[0, 1, 2, 3, 4].map((i) => (
          <StarIcon key={i} size={11} weight={i < filled ? 'fill' : 'regular'} color={i < filled ? t.warning[500] : t.neutral[300]} />
        ))}
      </View>
      <Text style={styles.count}>({count})</Text>
    </View>
  );
}

export default function CartSuggestions({ suggestions, loading, style }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // Two columns 8px apart inside the page's 12px gutters.
  const cardW = Math.floor((Math.min(width, 768) - 24 - 8) / 2);
  if (!loading && suggestions.length === 0) return null;
  return (
    <View style={[styles.section, style]}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">You may also like</Text>
        <Pressable onPress={() => router.push('/products')} style={styles.more} accessibilityRole="link">
          <Text style={styles.moreText}>See more</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <View key={i} style={[styles.card, { width: cardW }, styles.skel]}>
              <View style={styles.skelImg} />
              <View style={styles.skelLine} />
              <View style={[styles.skelLine, styles.skelShort]} />
            </View>
          ))
          : suggestions.map((product) => (
            <Pressable key={product.id} style={[styles.card, { width: cardW }]} onPress={() => router.push(`/product/${product.slug}`)} accessibilityRole="link">
              <View style={styles.image}>
                <CartProductImage src={Array.isArray(product.images) ? product.images[0] : product.images} style={styles.imageFill} />
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
                <Text style={styles.price}>₱{Number(product.price).toFixed(2)}</Text>
                <SuggestionRating product={product} />
              </View>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  title: { flexShrink: 1, fontSize: 18, lineHeight: 20.7, ...font(500), color: t.neutral[900] },
  more: { minHeight: 32, justifyContent: 'center' },
  moreText: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.primary[600] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[0] },
  image: { width: '100%', aspectRatio: 1, backgroundColor: t.neutral[100], overflow: 'hidden' },
  imageFill: { width: '100%', height: '100%' },
  info: { gap: 3, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 },
  name: { minHeight: 43.2, fontSize: 16, lineHeight: 21.6, ...font(400), color: t.neutral[800] },
  price: { fontSize: 15, lineHeight: 24, ...font(500), color: t.primary[600] },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stars: { flexDirection: 'row', gap: 1 },
  count: { fontSize: 11, lineHeight: 17.6, ...font(400), color: t.neutral[500] },
  skel: { gap: 8, padding: 12 },
  skelImg: { width: '100%', aspectRatio: 1, backgroundColor: t.neutral[200] },
  skelLine: { height: 12, borderRadius: 4, backgroundColor: t.neutral[200] },
  skelShort: { width: '60%' },
});
