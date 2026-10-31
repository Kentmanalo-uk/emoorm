import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import {
  CaretLeftIcon, CaretRightIcon, DotsThreeIcon, MagnifyingGlassIcon, MapPinIcon, PackageIcon, ShareNetworkIcon,
  ShoppingCartIcon, SquaresFourIcon, StarIcon, StorefrontIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { ShopGradient, mix } from '../../shop/shopTheme';

/** The phone width the preview is drawn at; it is then scaled to its box. */
const PHONE_WIDTH = 375;

/*
 * The shop page as buyers see it on a phone (web/src/components/seller/
 * ShopPreview.jsx + SellerApp.css .spv-*), with the same pieces as the real
 * storefront (hero, shop card, tabs, product grid), painted with a
 * template's colours and filled with the shop's own name, logo, banner and
 * live products. Drawn at phone width and scaled to fit its box: a template
 * card shows a true miniature (compact: it fills its parent's height) and
 * the preview page a full one (the box takes the scaled height).
 */
export default function ShopPreview({
  template, store, products = [], rating = null, followers = 0, productCount = null, compact = false,
}) {
  const [boxW, setBoxW] = useState(0);
  const [pageH, setPageH] = useState(0);
  const scale = boxW ? boxW / PHONE_WIDTH : 0;
  const p = template.primary;

  const name = store?.name || 'Your shop';
  const initials = name.split(' ').slice(0, 2).map((w) => w.charAt(0)).join('').toUpperCase();
  const banner = store?.bannerImage || store?.coverImage;
  const town = store?.municipality?.name || 'Oriental Mindoro';
  const count = productCount ?? products.length;
  const perks = [
    ['DELIVERY', 'BOTH'].includes(store?.fulfillmentMode) && 'Delivery',
    ['PICKUP', 'BOTH'].includes(store?.fulfillmentMode) && 'Pickup',
    store?.acceptsCod && 'COD',
  ].filter(Boolean);
  const shown = products.slice(0, 4);
  const deep = mix(p, 0.63, '#000');

  // Scale about the top-left corner (translate back what a centred scale moves).
  const transform = scale
    ? [
      { translateX: -(PHONE_WIDTH * (1 - scale)) / 2 },
      { translateY: -(pageH * (1 - scale)) / 2 },
      { scale },
    ]
    : undefined;

  return (
    <View
      pointerEvents={compact ? 'none' : 'auto'}
      importantForAccessibility={compact ? 'no-hide-descendants' : 'auto'}
      accessibilityElementsHidden={compact}
      onLayout={(e) => setBoxW(e.nativeEvent.layout.width)}
      style={[styles.box, compact ? styles.boxCompact : { height: scale && pageH ? Math.round(pageH * scale) : 0 }]}
    >
      <View
        onLayout={(e) => setPageH(e.nativeEvent.layout.height)}
        style={[styles.page, { opacity: scale ? 1 : 0, transform }]}
      >
        <View>
          <View style={styles.backdrop}>
            <ShopGradient
              angle={160}
              stops={[[mix(p, 0.52, '#000'), 0], [deep, 0.6], [mix(p, 0.4, '#000'), 1]]}
              radial={{ cx: 1, cy: 0, rx: 1.2, ry: 0.9, stops: [['#ec4899', 0, 0.18], ['#ec4899', 0.55, 0]] }}
            />
            {banner ? <Image source={{ uri: resolveImg(banner) }} style={styles.backdropImg} resizeMode="cover" /> : null}
          </View>
          <View style={styles.topbar}>
            <CaretLeftIcon size={24} weight="bold" color="#fff" />
            <View style={styles.topIcons}>
              <MagnifyingGlassIcon size={22} color="#fff" />
              <ShareNetworkIcon size={22} color="#fff" />
              <ShoppingCartIcon size={22} color="#fff" />
              <DotsThreeIcon size={22} weight="bold" color="#fff" />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.band}>
              <ShopGradient angle={90} stops={[[mix(p, 0.08, '#fff'), 0], ['#fdf2f8', 1]]} />
              <View style={styles.bandBrand}>
                <StorefrontIcon size={15} weight="fill" color={deep} />
                <Text style={[styles.bandBrandText, { color: deep }]}>Local shop</Text>
              </View>
              <View style={styles.bandPerks}>
                <Text style={styles.bandPerksText} numberOfLines={1}>{perks.length ? perks.join(' · ') : town}</Text>
                <CaretRightIcon size={13} weight="bold" color="#be185d" />
              </View>
            </View>
            <View style={styles.main}>
              <View style={styles.logo}>
                {store?.logo ? (
                  <Image source={{ uri: resolveImg(store.logo) }} style={styles.logoImg} resizeMode="cover" />
                ) : (
                  <>
                    <ShopGradient angle={135} stops={[[mix(p, 0.8, '#fff'), 0], [mix(p, 0.8, '#000'), 1]]} />
                    <Text style={styles.initials}>{initials}</Text>
                  </>
                )}
              </View>
              <View style={styles.id}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  <CaretRightIcon size={15} weight="bold" color={t.neutral[500]} />
                </View>
                <View style={styles.ratingRow}>
                  {rating > 0 ? (
                    <View style={[styles.rating, { backgroundColor: p }]}>
                      <StarIcon size={12} weight="fill" color="#fff" />
                      <Text style={styles.ratingText}>{Number(rating).toFixed(1)}</Text>
                    </View>
                  ) : (
                    <View style={[styles.rating, styles.ratingNew]}>
                      <Text style={[styles.ratingText, styles.ratingNewText]}>New</Text>
                    </View>
                  )}
                  <Text style={styles.counts}>
                    {count} {count === 1 ? 'product' : 'products'} · {followers} {followers === 1 ? 'follower' : 'followers'}
                  </Text>
                </View>
              </View>
              <View style={styles.cta}>
                <View style={[styles.ctaBtn, styles.follow]}><Text style={[styles.ctaText, styles.followText]}>Follow</Text></View>
                <View style={[styles.ctaBtn, styles.message]}><Text style={[styles.ctaText, styles.messageText]}>Message</Text></View>
              </View>
            </View>
            <View style={[styles.note, { borderColor: mix(p, 0.18, '#fff'), backgroundColor: mix(p, 0.08, '#fff') }]}>
              <View style={styles.noteText}>
                <View style={styles.noteTown}>
                  <MapPinIcon size={13} weight="fill" color={deep} />
                  <Text style={[styles.noteTownText, { color: deep }]} numberOfLines={1}>{town}</Text>
                </View>
                {store?.description ? <Text style={styles.noteDesc} numberOfLines={1}>{store.description}</Text> : null}
              </View>
              <View style={[styles.noteBtn, { backgroundColor: p }]}><Text style={styles.noteBtnText}>View</Text></View>
            </View>
          </View>
        </View>

        <View style={styles.tabs}>
          {['Products', 'Categories', 'About'].map((label, i) => (
            <View key={label} style={styles.tab}>
              <Text style={[styles.tabText, i === 0 && styles.on]}>{label}</Text>
              {i === 0 ? <View style={[styles.tabLine, { backgroundColor: p }]} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.sort}>
          {['Newest', 'Popular', 'Price'].map((label, i) => (
            <Text key={label} style={[styles.sortText, i === 0 ? styles.sortFirst : styles.sortNext, i === 0 && styles.on]}>{label}</Text>
          ))}
          <SquaresFourIcon size={20} color="#374151" style={styles.sortIcon} />
        </View>

        {shown.length > 0 ? (
          <View style={styles.grid}>
            {shown.map((prod) => {
              const img = prod.images?.[0];
              return (
                <View key={prod.id} style={styles.prod}>
                  <View style={styles.prodImg}>
                    {img ? <Image source={{ uri: resolveImg(img) }} style={styles.logoImg} resizeMode="cover" /> : <PackageIcon size={28} color={t.neutral[500]} />}
                  </View>
                  <Text style={styles.prodName} numberOfLines={2}>{prod.name}</Text>
                  <Text style={[styles.prodPrice, { color: p }]}>₱{Number(prod.price || 0).toFixed(2)}</Text>
                  <Text style={styles.prodMeta}>
                    {Number(prod.reviewCount || 0) > 0 ? `${Number(prod.averageRating || 0).toFixed(1)} ★ (${prod.reviewCount})` : 'New'}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <PackageIcon size={30} weight="fill" color={mix(p, 0.55, '#fff')} />
            <Text style={styles.emptyText}>Your live products show here</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  box: { position: 'relative', width: '100%', overflow: 'hidden' },
  boxCompact: { height: '100%' },
  page: { position: 'absolute', top: 0, left: 0, width: PHONE_WIDTH, paddingBottom: 12, backgroundColor: '#f3f4f6' },

  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 190, overflow: 'hidden' },
  backdropImg: { width: '100%', height: '100%', opacity: 0.35 },
  topbar: {
    zIndex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 54, paddingHorizontal: 16,
  },
  topIcons: { flexDirection: 'row', gap: 20 },

  card: { zIndex: 1, marginTop: 4, marginHorizontal: 12, overflow: 'hidden', borderRadius: 18, backgroundcolor: t.onBrand },
  band: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9, paddingHorizontal: 14,
  },
  bandBrand: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bandBrandText: { fontSize: 13, lineHeight: 18.2, ...font(500) },
  bandPerks: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  bandPerksText: { flexShrink: 1, fontSize: 12.5, lineHeight: 17.5, color: '#be185d', ...font(500) },

  main: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12 },
  logo: {
    flexShrink: 0,
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#f3f4f6',
    borderRadius: 31,
    backgroundcolor: t.onBrand,
  },
  logoImg: { width: '100%', height: '100%' },
  initials: { fontSize: 20, lineHeight: 28, color: t.onBrand, ...font(500) },
  id: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  name: { flexShrink: 1, fontSize: 17, lineHeight: 21.25, color: '#111827', ...font(500) },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 8, marginTop: 6 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6 },
  ratingText: { fontSize: 12.5, lineHeight: 17.5, color: t.onBrand, ...font(500) },
  ratingNew: { backgroundColor: '#f3f4f6' },
  ratingNewText: { color: '#4b5563' },
  counts: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },
  cta: { flexShrink: 0, gap: 6, width: 98 },
  ctaBtn: { height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  follow: { backgroundColor: t.accent[600] },
  message: { backgroundColor: '#f3f4f6' },
  ctaText: { fontSize: 13.5, lineHeight: 18.9, ...font(500) },
  followText: { color: t.onBrand },
  messageText: { color: '#1f2937' },

  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 10,
    paddingRight: 10,
    paddingLeft: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  noteText: { flex: 1, minWidth: 0, gap: 2 },
  noteTown: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteTownText: { flexShrink: 1, fontSize: 13.5, lineHeight: 18.9, ...font(400) },
  noteDesc: { fontSize: 12.5, lineHeight: 17.5, color: '#4b5563', ...font(400) },
  noteBtn: { flexShrink: 0, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8 },
  noteBtnText: { fontSize: 13, lineHeight: 18.2, color: t.onBrand, ...font(500) },

  tabs: { flexDirection: 'row', marginTop: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundcolor: t.onBrand },
  tab: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 15, lineHeight: 21, color: t.neutral[500], ...font(500) },
  on: { color: '#111827' },
  tabLine: { position: 'absolute', left: '22%', right: '22%', bottom: -1, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  sort: { flexDirection: 'row', alignItems: 'center', height: 44, paddingLeft: 16, paddingRight: 18, backgroundcolor: t.onBrand },
  sortText: { paddingHorizontal: 14, fontSize: 14, lineHeight: 16, color: t.neutral[500], ...font(500) },
  sortFirst: { paddingLeft: 0 },
  sortNext: { borderLeftWidth: 1, borderLeftColor: '#e5e7eb' },
  sortIcon: { marginLeft: 'auto' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 4 },
  prod: { width: (PHONE_WIDTH - 4) / 2, backgroundcolor: t.onBrand },
  prodImg: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#f3f4f6' },
  prodName: {
    minHeight: 14 * 1.35 * 2, marginTop: 8, marginHorizontal: 10, marginBottom: 4, fontSize: 14, lineHeight: 18.9, color: '#212121', ...font(400),
  },
  prodPrice: { marginHorizontal: 10, fontSize: 15, lineHeight: 21, ...font(500) },
  prodMeta: { marginTop: 4, marginHorizontal: 10, marginBottom: 10, fontSize: 12, lineHeight: 16.8, color: t.neutral[500], ...font(400) },

  empty: {
    alignItems: 'center', gap: 10, margin: 12, paddingVertical: 32, paddingHorizontal: 16, borderRadius: 16, backgroundcolor: t.onBrand,
  },
  emptyText: { fontSize: 14, lineHeight: 19.6, color: t.neutral[500], ...font(400) },
}));
