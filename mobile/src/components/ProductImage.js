import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import apiClient from '../api/client';
import { resolveImg } from '../lib/media';
import { t } from '../theme';

const BRAND_ICON = require('../../assets/brand-icon.png');

// The admin can set the picture shown for products without one
// (App settings → productPlaceholder); asked for once per app run.
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
 * A product photo filling its box (web/src/components/ProductImage.jsx).
 * Without a photo, or when it fails to load: the light grey tile with the
 * faint brand logo at 70% (the website's phone placeholder).
 * `src` may be a stored path or a full URL.
 */
export default function ProductImage({ src, style, resizeMode = 'cover' }) {
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
      <View style={[styles.fallback, style]} accessibilityRole="image" accessibilityLabel="Product image unavailable">
        <Image source={custom ? { uri: custom } : BRAND_ICON} style={styles.mark} resizeMode="contain" />
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.image, style]} resizeMode={resizeMode} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%', backgroundColor: t.neutral[100] },
  fallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: t.neutral[100] },
  mark: { width: '70%', height: '70%', opacity: 0.12 },
});
