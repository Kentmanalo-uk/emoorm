import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRightIcon, PlusIcon } from 'phosphor-react-native';
import ProductImage from '../ProductImage';
import { ProductStats } from '../ProductCard';
import { SaleWas } from '../SaleTag';
import { ProductTodayTag } from '../TodayTag';
import { saleInfo } from '../../lib/variantPricing';
import { resolveImg } from '../../lib/media';
import { font, t } from '../../theme';
import { parseImages, peso } from './productLib';

/**
 * Under the shop card on phones: the same shop's products, or similar ones,
 * in a row with a quick add (web .pdp-m-shelf).
 */
export function ShopShelf({ sameShop, related, onQuickAdd }) {
  const router = useRouter();
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {list.slice(0, 12).map((p) => (
          <View key={p.id} style={styles.card}>
            <Pressable style={styles.img} onPress={() => router.push(`/product/${p.slug}`)} accessibilityLabel={p.name}>
              <ShelfImage src={parseImages(p.images)[0]} />
            </Pressable>
            <Text style={styles.name} numberOfLines={2} onPress={() => router.push(`/product/${p.slug}`)}>{p.name}</Text>
            <View style={styles.foot}>
              <Text style={styles.price} numberOfLines={1}>{peso(saleInfo(p).price)}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add ${p.name} to cart`}
                onPress={() => onQuickAdd(p)}
                style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
              >
                <PlusIcon size={14} weight="bold" color={t.primary[700]} />
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The shelf photo; without one (or when it fails) the placeholder logo is
 * stretched over the whole tile, as .pdp-m-shelf-img img does on the website.
 */
function ShelfImage({ src }) {
  const uri = src ? resolveImg(src) : null;
  const [failed, setFailed] = useState(false);
  if (!uri || failed) return <View style={styles.imgMark}><ProductImage /></View>;
  return <Image source={{ uri }} style={styles.imgPhoto} resizeMode="cover" onError={() => setFailed(true)} />;
}

/** "You may also like": a heading on the grey, white cards in two columns. */
export function RelatedGrid({ products, categoryId, sectionRef }) {
  const router = useRouter();
  const [w, setW] = useState(0);
  if (!products.length) return null;
  const card = w ? (w - 8) / 2 : 0;
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
          <Pressable key={p.id} style={[styles.gCard, { width: card }]} onPress={() => router.push(`/product/${p.slug}`)} accessibilityRole="button" accessibilityLabel={p.name}>
            <View style={[styles.gImage, { height: card }]}>
              <ProductImage src={parseImages(p.images)[0]} />
            </View>
            <View style={styles.gInfo}>
              <Text style={styles.gName} numberOfLines={2}>
                <ProductTodayTag product={p} style={styles.gTag} />
                {p.name}
              </Text>
              <View style={styles.gPriceRow}>
                <Text style={styles.gPrice}>{peso(saleInfo(p).price)}</Text>
                <SaleWas product={p} compact style={styles.gWas} />
              </View>
              <ProductStats product={{ ...p, soldCount: 0 }} />
            </View>
          </Pressable>
        )) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shelf: { paddingTop: 6, paddingBottom: 14, backgroundColor: '#fff' },
  tabs: { flexDirection: 'row', gap: 18, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.neutral[150] },
  tab: { paddingTop: 8, paddingBottom: 10 },
  tabText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[500] },
  tabTextOn: { color: t.neutral[900] },
  tabLine: { position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, borderRadius: 2, backgroundColor: t.primary[600] },
  row: { gap: 10, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 2 },
  card: { width: 116, gap: 6 },
  img: { width: 116, height: 116, borderRadius: 10, overflow: 'hidden', backgroundColor: t.neutral[100] },
  // The shelf stretches the placeholder logo over the whole tile (.pdp-m-shelf-img img).
  imgPhoto: { width: '100%', height: '100%' },
  imgMark: { width: '100%', height: '100%', transform: [{ scale: 1 / 0.7 }] },
  name: { fontSize: 13, lineHeight: 16.9, ...font(400), color: t.neutral[800] },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' },
  price: { flexShrink: 1, minWidth: 0, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.primary[700] },
  add: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: t.primary[600], backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  addPressed: { backgroundColor: t.primary[50] },

  related: { marginTop: 8, paddingTop: 14, paddingHorizontal: 10, paddingBottom: 8 },
  relatedHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, height: 32, marginBottom: 10, paddingHorizontal: 4 },
  relatedTitle: { fontSize: 16, lineHeight: 18.4, ...font(500), color: t.neutral[900] },
  more: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 32 },
  moreText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.primary[700] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gCard: { overflow: 'hidden', backgroundColor: '#fff' },
  gImage: { width: '100%', backgroundColor: '#fff', overflow: 'hidden' },
  gInfo: { paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10, gap: 3 },
  gName: { minHeight: 37.8, fontSize: 16, lineHeight: 21.6, ...font(400), color: t.secondary[950] },
  gTag: { position: 'relative', top: -1 },
  gPriceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  gPrice: { fontSize: 15, lineHeight: 18, ...font(500), color: t.primary[600] },
  gWas: { marginLeft: 4 },
});
