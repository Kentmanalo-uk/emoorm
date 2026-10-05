import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import apiClient from '../../api/client';
import { resolveImg } from '../../lib/media';
import { t } from '../../theme';

const BRAND_ICON = require('../../../assets/brand-icon.png');

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
 * The cart's and checkout's product pictures. On the website these boxes
 * (`.cart-m-item-img img`, `.cart-suggestion-image img`, `.co-m-item-img img`)
 * stretch every <img> to 100% with object-fit: cover, so the no-photo
 * placeholder's faint logo fills the whole tile instead of the usual 70%,
 * also when a photo fails to load.
 */
export default function CartProductImage({ src, style }) {
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
  if (uri && !failed) {
    return <Image source={{ uri }} style={[styles.image, style]} resizeMode="cover" onError={() => setFailed(true)} />;
  }
  return (
    <View style={[styles.fallback, style]} accessibilityRole="image" accessibilityLabel="Product image unavailable">
      <Image source={custom ? { uri: custom } : BRAND_ICON} style={styles.mark} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%', backgroundColor: t.neutral[100] },
  fallback: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: t.neutral[100] },
  mark: { width: '100%', height: '100%', opacity: 0.12 },
});
