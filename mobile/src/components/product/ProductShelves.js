import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon, PlusIcon } from '../../lib/icons';
import ProductCard, { CardPhotoButton } from '../ProductCard';
import { GRID_EDGE, GRID_GAP } from '../../lib/productGrid';
import { font, t, themed } from '../../theme';

/**
 * Under the shop card on phones: the same shop's products, or similar ones,
 * in a row with a quick add (web .pdp-m-shelf).
 */
export const ShopShelf = memo(({ sameShop, related, onQuickAdd }) => {
  const [tab, setTab] = useState('same');
  if (!sameShop.length && !related.length) return null;
  const tabs = [['same', 'Same store', sameShop], ['similar', 'Similar items', related]].filter(([, , list]) => list.length > 0);
  const list = (tab === 'similar' && related.length) || !sameShop.length ? related : sameShop;
  return (
    <View style={styles.shelf}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map(([key, label], i, all) => {
          const active = tab === key || all.length === 1 || (!all.some(([k]) => k === tab) && i === 0);
          return (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => setTab(key)} style={styles.tab}>
              <Text style={[styles.tabText, active && styles.tabTextOn]}>{label}</Text>
              {active ? <View style={styles.tabLine} /> : null}
            </Pressable>
          );
        })}
      </View>
      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.row}>
        {list.slice(0, 12).map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            variant="home"
            style={styles.card}
            photoExtra={(
              <CardPhotoButton label={`Add ${p.name} to cart`} onPress={() => onQuickAdd(p)}>
                <PlusIcon size={15} weight="bold" color={t.onBrand} />
              </CardPhotoButton>
            )}
          />
        ))}
      </ScrollView>
    </View>
  );
});

/** "You may also like": a heading on the grey, white cards in two columns. */
export const RelatedGrid = memo(({ products, categoryId, sectionRef }) => {
  const router = useRouter();
  const [w, setW] = useState(0);
  if (!products.length) return null;
  const card = w ? Math.floor(((w - GRID_GAP) / 2) * 100) / 100 : 0;
  return (
    <View ref={sectionRef} collapsable={false} style={styles.related}>
      <View style={styles.relatedHead}>
        <Text style={styles.relatedTitle} accessibilityRole="header">You may also like</Text>
        <Pressable style={styles.more} onPress={() => router.push(`/products?category=${categoryId}`)}>
          <Text style={styles.moreText}>See more</Text>
          <CaretRightIcon size={14} color={t.primary[700]} />
        </Pressable>
      </View>
      <View style={styles.grid} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {card ? products.map((p) => (
          <ProductCard key={p.id} product={p} variant="home" style={{ width: card }} />
        )) : null}
      </View>
    </View>
  );
});

const styles = themed(() => StyleSheet.create({
  shelf: { paddingTop: 6, paddingBottom: 14, backgroundColor: t.neutral[0] },
  tabs: { flexDirection: 'row', gap: 18, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.neutral[150] },
  tab: { paddingTop: 8, paddingBottom: 10 },
  tabText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[500] },
  tabTextOn: { color: t.neutral[900] },
  tabLine: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 2, backgroundColor: t.primary[600] },
  rail: { backgroundColor: t.neutral[100] },
  row: { gap: GRID_GAP, padding: GRID_EDGE },
  card: { width: 150 },

  related: { marginTop: 8, paddingTop: 14, paddingHorizontal: GRID_EDGE, paddingBottom: 8 },
  relatedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, height: 32, marginBottom: 10, paddingHorizontal: 10 },
  relatedTitle: { fontSize: 16, lineHeight: 18.4, ...font(500), color: t.neutral[900] },
  more: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 32 },
  moreText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.primary[700] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
}));
