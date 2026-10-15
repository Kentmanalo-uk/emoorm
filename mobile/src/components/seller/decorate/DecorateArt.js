import { Image, StyleSheet, Text, View } from 'react-native';
import { ChatTextIcon, ImageSquareIcon, StarIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { resolveImg } from '../../../lib/media';
import { ShopGradient } from '../../shop/shopTheme';
import { paintColor } from '../store/storeLib';

/*
 * The small pictures beside each block of "Decorate my shop"
 * (web/src/pages/SellerDecorate.jsx + SellerApp.css .sdc-*-art).
 */

/** Shop home: a banner, a row of spotlight picks and a message (.sdc-home-art). */
export function HomeArt() {
  return (
    <View style={styles.home} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.homeBanner}>
        <ShopGradient angle={135} stops={[['#38bdf8', 0], ['#2563eb', 1]]} />
        {/* In a View, so it paints over the gradient on the web build too. */}
        <View><ImageSquareIcon size={22} weight="fill" color="#fff" /></View>
      </View>
      <View style={styles.homeRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.homeStar}>
            <ShopGradient angle={135} stops={[['#fde68a', 0], ['#f59e0b', 1]]} />
            <View><StarIcon size={14} weight="fill" color="#fff" /></View>
          </View>
        ))}
      </View>
      <View style={styles.homeMsg}>
        <ChatTextIcon size={14} weight="fill" color="#047857" />
        <Text style={styles.homeMsgText}>Hello, buyers!</Text>
      </View>
    </View>
  );
}

/** Logo & banner: the shop's banner with its logo over the corner (.sdc-brand-art). */
export function BrandArt({ store }) {
  const banner = store?.bannerImage || store?.coverImage;
  return (
    <View style={styles.brand}>
      <View style={styles.brandBanner}>
        {banner ? (
          <Image source={{ uri: resolveImg(banner) }} style={styles.img} resizeMode="cover" />
        ) : (
          <ShopGradient
            angle={160}
            stops={[[t.primary[800], 0], [t.primary[900], 1]]}
            radial={{ cx: 1, cy: 0, rx: 1.2, ry: 0.9, stops: [['#ec4899', 0, 0.18], ['#ec4899', 0.55, 0]] }}
          />
        )}
      </View>
      <View style={styles.brandLogo}>
        {store?.logo ? (
          <Image source={{ uri: resolveImg(store.logo) }} style={styles.img} resizeMode="cover" />
        ) : (
          <Text style={styles.brandInitial}>{(store?.name || 'S').charAt(0).toUpperCase()}</Text>
        )}
      </View>
    </View>
  );
}

/** Your own colours: the shop's two colours as overlapping circles (.sdc-swatches). */
export function SwatchArt({ store }) {
  const colors = [paintColor(store?.primaryColor, '#047857'), paintColor(store?.secondaryColor, '#F59E0B')];
  return (
    <View style={styles.swatches}>
      {colors.map((c, i) => (
        // outline: 1px around a 64px circle with a 4px white border.
        <View key={i} style={[styles.swatchRing, i > 0 && styles.swatchNext]}>
          <View style={[styles.swatch, { backgroundColor: c }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  home: { height: 120, gap: 6, padding: 8, borderRadius: 14, backgroundColor: '#f8fafc' },
  homeBanner: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 10 },
  homeRow: { flexDirection: 'row', gap: 5 },
  homeStar: { flex: 1, height: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 7 },
  homeMsg: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: '#ecfdf5' },
  homeMsgText: { flexShrink: 1, fontSize: 11, lineHeight: 17.6, color: '#047857', ...font(600) },

  brand: { position: 'relative', height: 120 },
  brandBanner: { height: 86, overflow: 'hidden', borderRadius: 12 },
  img: { width: '100%', height: '100%' },
  brandLogo: {
    position: 'absolute',
    left: 12,
    bottom: 0,
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 29,
    backgroundColor: t.primary[50],
  },
  brandInitial: { fontSize: 22, lineHeight: 30, color: t.primary[700], ...font(500) },

  swatches: { flexDirection: 'row', justifyContent: 'center' },
  swatchRing: { width: 66, height: 66, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 33 },
  swatchNext: { marginLeft: -18 },
  swatch: { flex: 1, borderWidth: 4, borderColor: '#fff', borderRadius: 32 },
});
