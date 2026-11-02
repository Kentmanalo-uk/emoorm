import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ProductCard from '../ProductCard';
import { GRID_EDGE, GRID_GAP } from '../../lib/productGrid';
import { font, t, themed } from '../../theme';
import { clearRecentlyViewed, onRecentChange, recentlyViewed } from './recentViews';
import { PfSection, PfTitle } from './ProfileUI';

/**
 * Profile, under My Purchase: the products opened lately on this device,
 * newest first, in one sideways row (web components/account/RecentlyViewed).
 * Nothing shows until there are some.
 */
export default function RecentlyViewed({ userId = null }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let live = true;
    const load = () => recentlyViewed(userId).then((list) => { if (live) setItems(list.slice(0, 12)); });
    load();
    const off = onRecentChange(load);
    return () => { live = false; off(); };
  }, [userId]);

  if (!items.length) return null;

  return (
    <PfSection>
      <View style={styles.head}>
        <PfTitle>Recently Viewed</PfTitle>
        <Pressable accessibilityRole="button" onPress={() => clearRecentlyViewed(userId)} style={styles.clear}>
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={styles.scroller} contentContainerStyle={styles.row}>
        {items.map((p) => <ProductCard key={p.id} product={p} variant="home" style={styles.card} />)}
      </ScrollView>
    </PfSection>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { paddingVertical: 4, paddingLeft: 8 },
  clearText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  scroller: { marginHorizontal: -16, backgroundColor: t.neutral[100] },
  row: { gap: GRID_GAP, padding: GRID_EDGE },
  card: { width: 150 },
}));
