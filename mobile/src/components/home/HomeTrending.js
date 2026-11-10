import { memo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import ProductCard from '../ProductCard';
import { GRID_EDGE, GRID_GAP, SECTION_EDGE } from '../../lib/productGrid';
import { themed } from '../../theme';
import { SectionHeader } from './HomeSections';

/*
 * Home's "Trending now" (the ML engine's GET /ml/recommendations/trending):
 * what buyers are adding and viewing more than usual this week, in one row
 * of Home's product cards that scrolls sideways. Nothing at all when the
 * engine has nothing (or is off). Memo'd: Home redraws its header whenever
 * any section's answer comes in, and this row only changes with its list.
 */
const Card = memo(ProductCard);

function HomeTrending({ products }) {
  if (!products?.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title="Trending now" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        style={styles.rail}
        contentContainerStyle={styles.row}
      >
        {products.map((product) => (
          <Card key={product.id} product={product} variant="home" style={styles.card} />
        ))}
      </ScrollView>
    </View>
  );
}

export default memo(HomeTrending);

const styles = themed(() => StyleSheet.create({
  // Home's listSection (Suggested, Stores): on the page's grey.
  section: { paddingTop: 16, paddingBottom: 4, paddingHorizontal: SECTION_EDGE },
  // Out to the screen's sides, the first card at the grid's edge.
  rail: { marginHorizontal: -SECTION_EDGE },
  row: { gap: GRID_GAP, paddingHorizontal: GRID_EDGE },
  card: { width: 150 },
}));
