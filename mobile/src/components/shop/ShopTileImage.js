import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import apiClient from '../../api/client';
import { resolveImg } from '../../lib/media';
import { t } from '../../theme';

const BRAND_ICON = require('../../../assets/brand-icon.png');

// The admin's picture for products without one (App settings →
// productPlaceholder), asked for once per app run.
let placeholder = null;
let asked = null;
const loadPlaceholder = () => {
  asked = asked || apiClient.get('/app-settings')
    .then((res) => {
      const value = res?.data?.productPlaceholder;
      placeholder = value && value !== '/brand-icon.png' ? resolveImg(value) : null;
    })
    .catch(() => {});
  return asked;
};

/**
 * A product photo in the shop page's tiles. As ProductImage, but the shop's
 * tile rules (`.shop-m-row-img img`, `.product-image img`) also stretch the
 * placeholder logo over the whole tile (cover), still at 12% opacity.
 */
export default function ShopTileImage({ src }) {
  const uri = src ? resolveImg(src) : null;
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState(placeholder);

  useEffect(() => { setFailed(false); }, [uri]);
  useEffect(() => {
    if (uri && !failed) return undefined;
    let live = true;
    loadPlaceholder().then(() => { if (live) setCustom(placeholder); });
    return () => { live = false; };
  }, [uri, failed]);

  if (!uri || failed) {
    return (
      <View style={styles.fallback} accessibilityRole="image" accessibilityLabel="Product image unavailable">
        <Image source={custom ? { uri: custom } : BRAND_ICON} style={styles.mark} resizeMode="cover" />
      </View>
    );
  }
  return <Image source={{ uri }} style={styles.image} resizeMode="cover" onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%', backgroundColor: t.neutral[100] },
  fallback: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: t.neutral[100] },
  mark: { width: '100%', height: '100%', opacity: 0.12 },
});
