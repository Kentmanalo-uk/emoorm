import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { sizedImg } from '../lib/media';
import useProductPlaceholder from '../lib/productPlaceholder';
import { t, themed } from '../theme';

const BRAND_ICON = require('../../assets/brand-icon.png');

/**
 * A product photo filling its box (web/src/components/ProductImage.jsx).
 * Without a photo, or when it fails to load: the light grey tile with the
 * faint brand logo at 70% (the website's phone placeholder).
 * `src` may be a stored path or a full URL.
 *
 * Drawn by expo-image rather than React Native's own Image, because every
 * product photo in the app comes through here and a shop's page is forty
 * of them at once. What that buys on a cheap phone:
 *
 *  - a disk cache as well as a memory one, so scrolling back up, or
 *    coming back to a page, costs nothing and no network;
 *  - decoding off the main thread, which is what actually drops frames
 *    while a grid is being flung;
 *  - recyclingKey, so a view reused for another product blanks instead of
 *    showing the last one's photo for a frame;
 *  - a short fade, which reads as deliberate where a hard pop reads as a
 *    stutter.
 *
 * resizeMode is kept as the prop name (expo-image calls it contentFit) so
 * the twenty-odd places that pass it did not all have to change.
 */
export default function ProductImage({
  src, style, resizeMode = 'cover', onLoad, priority = 'normal', width,
}) {
  // `width` is the box this is drawn in, in layout units. With it, the
  // server's smaller copy of the photo is fetched instead of the stored
  // original -- about 34x fewer bytes for a grid tile, and far less
  // memory once decoded (lib/media sizedImg). Without it nothing changes.
  const uri = src ? sizedImg(src, width) : null;
  const [failed, setFailed] = useState(false);
  const custom = useProductPlaceholder(!uri || failed);

  useEffect(() => { setFailed(false); }, [uri]);

  if (!uri || failed) {
    return (
      <View style={[styles.fallback, style]} accessibilityRole="image" accessibilityLabel="Product image unavailable">
        <Image source={custom ? { uri: custom } : BRAND_ICON} style={styles.mark} contentFit="contain" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={[styles.image, style]}
      contentFit={resizeMode}
      // Kept on disk between runs: the same shop browsed twice in a day
      // fetches its photos once.
      cachePolicy="memory-disk"
      // The view may be reused for another product as a list recycles.
      recyclingKey={uri}
      transition={150}
      priority={priority}
      onLoad={onLoad}
      onError={() => setFailed(true)}
    />
  );
}

const styles = themed(() => StyleSheet.create({
  image: { width: '100%', height: '100%', backgroundColor: t.neutral[100] },
  fallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: t.neutral[100] },
  mark: { width: '70%', height: '70%', opacity: 0.12 },
}));
