import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ProductImage from '../ProductImage';
import useOpenProduct from '../useOpenProduct';
import { parseImages, peso } from '../product/productLib';
import { saleInfo } from '../../lib/variantPricing';
import { sizedImg } from '../../lib/media';
import { font, t, themed } from '../../theme';
import { clearRecentlyViewed, onRecentChange, recentlyViewed } from './recentViews';
import { PfSection, PfTitle } from './ProfileUI';

// The picture's side (web RecentlyViewed.css .pvw-pic).
const PIC = 96;

/**
 * Profile, under My Purchase: the products opened lately on this device,
 * newest first (web components/account/RecentlyViewed, phone variant).
 * Kept light: a row of small pictures, each with its name and price under
 * it, on white -- a reminder, not a shop window. Nothing shows until there
 * are some.
 */
export default function RecentlyViewed({ userId = null }) {
  const [items, setItems] = useState([]);
  const openProduct = useOpenProduct();

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        style={styles.scroller}
        contentContainerStyle={styles.strip}
      >
        {items.map((p) => {
          const photo = parseImages(p.images)[0];
          return (
            <Pressable
              key={p.id}
              accessibilityRole="link"
              accessibilityLabel={p.name}
              onPress={p.slug ? () => openProduct({ slug: p.slug, photo, shown: photo ? sizedImg(photo, PIC) : null }) : undefined}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <View style={styles.pic}>
                <ProductImage src={photo} width={PIC} style={styles.picImg} />
              </View>
              <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
              <Text style={styles.price} numberOfLines={1}>{peso(saleInfo(p).price)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </PfSection>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clear: { paddingVertical: 4, paddingLeft: 8 },
  clearText: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  scroller: { marginTop: 12, marginHorizontal: -16 },
  strip: { gap: 12, paddingHorizontal: 16, paddingBottom: 2 },
  item: { width: PIC, gap: 4 },
  pressed: { opacity: 0.7 },
  pic: { width: PIC, height: PIC, borderRadius: 10, overflow: 'hidden' },
  picImg: { width: PIC, height: PIC },
  name: { fontSize: 12.5, lineHeight: 16, color: t.neutral[800], ...font(400) },
  // 600 on the website, which its phones draw at 500.
  price: { fontSize: 13, lineHeight: 20.8, color: t.neutral[900], ...font(500) },
}));
