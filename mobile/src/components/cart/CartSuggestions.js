import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import ProductCard from '../ProductCard';
import { GRID_BLEED, GRID_GAP, gridCellWidth } from '../../lib/productGrid';
import { font, t, themed } from '../../theme';

/*
 * "You may also like" under the cart: a title with See more, then the same
 * two-up product cards as Home. While loading: four grey skeleton cards.
 */
export default function CartSuggestions({ suggestions, loading, style }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardW = gridCellWidth(Math.min(width, 768));
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
            <View key={i} style={[styles.skel, { width: cardW }]}>
              <View style={styles.skelImg} />
              <View style={styles.skelLine} />
              <View style={[styles.skelLine, styles.skelShort]} />
            </View>
          ))
          : suggestions.map((product) => (
            <ProductCard key={product.id} product={product} variant="home" style={{ width: cardW }} />
          ))}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // Pulled out over the cart's gutter: Home's white cards on Home's grey.
  section: { marginTop: 20, marginHorizontal: -12, padding: 12, backgroundColor: t.neutral[100] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  title: { flexShrink: 1, fontSize: 18, lineHeight: 20.7, ...font(500), color: t.neutral[900] },
  more: { minHeight: 32, justifyContent: 'center' },
  moreText: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.primary[600] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, marginHorizontal: GRID_BLEED },
  skel: { gap: 8, paddingBottom: 12, backgroundColor: t.neutral[0] },
  skelImg: { width: '100%', aspectRatio: 1, backgroundColor: t.neutral[200] },
  skelLine: { height: 12, marginHorizontal: 10, borderRadius: 4, backgroundColor: t.neutral[200] },
  skelShort: { width: '60%' },
}));
