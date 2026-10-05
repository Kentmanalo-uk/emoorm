import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import ProductImage from '../ProductImage';
import { peso } from '../SaleTag';
import { saleInfo } from '../../lib/variantPricing';
import { font, t } from '../../theme';
import { clearRecentlyViewed, onRecentChange, recentlyViewed } from './recentViews';
import { PfSection, PfTitle } from './ProfileUI';

/**
 * Profile, under My Purchase: the products opened lately on this device,
 * newest first, in one sideways row (web components/account/RecentlyViewed).
 * Nothing shows until there are some.
 */
export default function RecentlyViewed({ userId = null }) {
  const router = useRouter();
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroller}>
        {items.map((p) => (
          <Pressable key={p.id} accessibilityRole="link" onPress={() => router.push(`/product/${p.slug}`)} style={styles.card}>
            <View style={styles.img}><ProductImage src={p.images?.[0]} style={StyleSheet.absoluteFill} /></View>
            <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
            <Text style={styles.price}>{peso(saleInfo(p).price)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </PfSection>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { paddingVertical: 4, paddingLeft: 8 },
  clearText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  scroller: { marginHorizontal: -16 },
  row: { gap: 10, paddingHorizontal: 20, paddingBottom: 4 },
  card: { width: 112, gap: 4 },
  img: { width: 112, height: 112, overflow: 'hidden', borderRadius: 10, backgroundColor: t.neutral[100] },
  name: { fontSize: 13, lineHeight: 16.9, color: t.neutral[800], ...font(400) },
  price: { fontSize: 13, lineHeight: 20.8, color: t.primary[700], ...font(500) },
});
