import { useMemo } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from '../../../lib/icons';
import ShopHome from '../../shop/ShopHome';
import { resolveImg } from '../../../lib/media';
import { font, ink, t, themed } from '../../../theme';
import { sectionReady } from './shopHome';

/*
 * "What buyers see" (web SellerShopHome.jsx preview + .shb-phone / .shb-sheet,
 * phones): the shop's Home tab drawn by the buyer storefront's own ShopHome
 * inside a little phone, opened full screen from the save bar's Preview.
 *
 * The website hands ShopHome the products by id (`lookup`) and turns links
 * off (`preview`); the app's ShopHome reads `section.products` and links by
 * slug, so here the sections get their products filled in and the slugs
 * left out, which keeps every tap inside the preview.
 */

const previewSections = (sections, lookup) => sections.filter(sectionReady).map((s) => {
  if (s.type === 'spotlight') {
    return {
      ...s,
      products: (s.productIds || []).map((id) => lookup.get(id)).filter(Boolean).map((p) => ({ ...p, slug: null })),
    };
  }
  if (s.type === 'banner') return { ...s, images: (s.images || []).map((img) => ({ ...img, productSlug: null })) };
  return s;
});

export function PreviewPhone({ store, sections, lookup }) {
  const accent = store?.primaryColor || t.primary[600];
  const ready = useMemo(() => previewSections(sections, lookup), [sections, lookup]);
  return (
    <View style={styles.phone}>
      <View style={[styles.head, { backgroundColor: accent }]}>
        <View style={styles.logo}>
          {store?.logo
            ? <Image source={{ uri: resolveImg(store.logo) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <Text style={[styles.logoText, { color: accent }]}>{(store?.name || 'S').charAt(0).toUpperCase()}</Text>}
        </View>
        <Text style={styles.name} numberOfLines={1}>{store?.name || 'Your shop'}</Text>
      </View>
      <View style={styles.tabs} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={[styles.tab, styles.tabOn, { color: accent, borderBottomColor: accent }]}>Home</Text>
        <Text style={styles.tab}>Products</Text>
        <Text style={styles.tab}>Categories</Text>
        <Text style={styles.tab}>About</Text>
      </View>
      <View style={styles.body}>
        {ready.length
          ? <ShopHome sections={ready} accent={accent} />
          : <Text style={styles.empty}>Add a section to see your Home here.</Text>}
      </View>
    </View>
  );
}

/** .shb-sheet: the preview over the whole screen, a white head with a close button. */
export default function ShopHomePreviewSheet({ open, onClose, store, sections, lookup }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.sheet}>
        <View style={[styles.sheetHead, { paddingTop: 12 + insets.top }]}>
          <Text style={styles.sheetTitle} accessibilityRole="header">What buyers see</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close preview" onPress={onClose} style={styles.close} hitSlop={6}>
            <XIcon size={18} color={t.neutral[600]} />
          </Pressable>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.flex} contentContainerStyle={[styles.sheetBody, { paddingBottom: 14 + insets.bottom }]}>
          {open ? <PreviewPhone store={store} sections={sections} lookup={lookup} /> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  // .shb-phone inside the sheet (border 6px, no height limit)
  phone: {
    overflow: 'hidden', borderWidth: 6, borderColor: t.neutral[900], borderRadius: 34, backgroundColor: t.neutral[50],
    boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 40, color: ink(0.18) }],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 10 },
  logo: {
    width: 34, height: 34, overflow: 'hidden', borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundcolor: t.onBrand,
  },
  logoText: { fontSize: 15, lineHeight: 20, ...font(700) },
  name: { flexShrink: 1, fontSize: 14, lineHeight: 19, ...font(700), color: t.onBrand },
  tabs: {
    flexDirection: 'row', gap: 14, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: t.neutral[200], backgroundcolor: t.onBrand,
  },
  tab: { paddingVertical: 9, fontSize: 12.5, lineHeight: 17, ...font(400), color: t.neutral[500] },
  tabOn: { paddingBottom: 7, borderBottomWidth: 2, ...font(700) },
  body: { minHeight: 360, padding: 12 },
  empty: { marginVertical: 40, marginHorizontal: 10, fontSize: 13, lineHeight: 20, ...font(400), color: t.neutral[500], textAlign: 'center' },

  sheet: { flex: 1, backgroundColor: t.neutral[100] },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingBottom: 12, backgroundcolor: t.onBrand, borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  sheetTitle: { fontSize: 16, lineHeight: 22, ...font(700), color: t.neutral[900] },
  close: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sheetBody: { padding: 14 },
}));
