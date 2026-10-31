import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { font, t, themed } from '../../theme';

/*
 * The website's map markers as native views, for the Apple Maps versions of
 * the maps (LeafletMap.ios.js, AddressPinMap.ios.js); the Leaflet page draws
 * the same ones in CSS (leafletHtml.js):
 *   PinDrop        .store-map-marker   the green drop with a white dot (a pin you place)
 *   ShopRoutePin   .pr-shop-pin        the shop's logo in a green ring, standing on a tip
 *   MeDot          .pr-me              the blue "you are here" dot
 * Each is drawn with its point at the bottom middle (MeDot: its centre).
 */

export const PIN_DROP_SIZE = { width: 28, height: 36 };
export const SHOP_PIN_SIZE = { width: 44, height: 54 };

export function PinDrop() {
  return (
    <View style={styles.drop}>
      <View style={styles.dropHead}><View style={styles.dropDot} /></View>
    </View>
  );
}

export function ShopRoutePin({ name, logo }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.shop}>
      <View style={styles.shopTip} />
      <View style={styles.shopFace}>
        <Text style={styles.shopInitial}>{(name || '?').charAt(0).toUpperCase()}</Text>
        {logo && !failed ? <Image source={{ uri: logo }} style={styles.shopLogo} onError={() => setFailed(true)} /> : null}
      </View>
    </View>
  );
}

export function MeDot() {
  return (
    <View style={styles.me}>
      <View style={styles.meDot} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  drop: { ...PIN_DROP_SIZE, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 1 },
  dropHead: {
    width: 26, height: 26, borderWidth: 3, bordercolor: t.onBrand, backgroundColor: t.primary[600],
    borderTopLeftRadius: 13, borderTopRightRadius: 13, borderBottomRightRadius: 13, borderBottomLeftRadius: 0,
    transform: [{ rotate: '-45deg' }], boxShadow: '0px 3px 9px rgba(15, 23, 42, 0.3)',
  },
  dropDot: { position: 'absolute', top: 7, left: 7, width: 6, height: 6, borderRadius: 3, backgroundcolor: t.onBrand },

  shop: { ...SHOP_PIN_SIZE },
  shopTip: {
    position: 'absolute', left: 16, bottom: 2, width: 12, height: 12, borderRadius: 2, backgroundColor: t.primary[600],
    transform: [{ rotate: '45deg' }],
  },
  shopFace: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: t.primary[600], backgroundColor: t.primary[50],
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 14, color: 'rgba(15, 35, 25, 0.25)' }],
  },
  shopInitial: { fontSize: 16, lineHeight: 20, ...font(600), color: t.primary[700] },
  shopLogo: { ...StyleSheet.absoluteFill },

  me: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(37, 99, 235, 0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  meDot: {
    width: 12, height: 12, borderRadius: 6, borderWidth: 2, bordercolor: t.onBrand, backgroundColor: '#2563eb',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.3)',
  },
}));
