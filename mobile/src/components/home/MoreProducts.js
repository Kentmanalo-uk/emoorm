import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { fetchForYou } from '../../lib/forYou';
import { GRID_EDGE, GRID_GAP, gridCellWidth } from '../../lib/productGrid';
import useAuthStore from '../../store/authStore';
import { t, themed } from '../../theme';
import ProductCard from '../ProductCard';

const COUNT = 20;

// The last answer and whose it was, so coming back to a tab shows cards at once.
let saved = { owner: null, products: [] };

/**
 * More to look at, under the end of a page that has run out of its own
 * content (Messages, Notifications, Profile): the same cards as Home, picked
 * for this person (lib/forYou), with no heading. Nothing shows until there
 * are products to show, and a failed request leaves the page as it was.
 *
 * refreshKey: changing it asks again (a pull on the page above).
 */
export default function MoreProducts({ refreshKey = 0, style }) {
  const { width } = useWindowDimensions();
  const userId = useAuthStore((s) => s.user?.id) || null;
  const [products, setProducts] = useState(() => (saved.owner === userId ? saved.products : []));

  useEffect(() => {
    let live = true;
    fetchForYou(userId, { pageSize: COUNT })
      .then((res) => {
        if (!live || !res.data?.length) return;
        saved = { owner: userId, products: res.data };
        setProducts(res.data);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [refreshKey, userId]);

  if (!products.length) return null;
  const cardW = gridCellWidth(width);
  return (
    <View style={[styles.grid, style]}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} variant="home" style={{ width: cardW }} />
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    padding: GRID_EDGE,
    backgroundColor: t.neutral[100],
  },
}));
