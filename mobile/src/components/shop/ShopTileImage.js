import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { sizedImg } from '../../lib/media';
import useProductPlaceholder from '../../lib/productPlaceholder';
import { t, themed } from '../../theme';

const BRAND_ICON = require('../../../assets/brand-icon.png');

/**
 * A product photo in the shop page's tiles. As ProductImage, but the shop's
 * tile rules (`.shop-m-row-img img`, `.product-image img`) also stretch the
 * placeholder logo over the whole tile (cover), still at 12% opacity.
 *
 * Same engine as ProductImage: expo-image for the disk cache and off-thread
 * decoding, and the server's small copy rather than the stored original. A
 * shop page is the longest grid in the app, so this is the screen the
 * sizing matters most on.
 */
export default function ShopTileImage({ src, width = 180 }) {
  const uri = src ? sizedImg(src, width) : null;
  const [failed, setFailed] = useState(false);
  const custom = useProductPlaceholder(!uri || failed);

  useEffect(() => { setFailed(false); }, [uri]);

  if (!uri || failed) {
    return (
      <View style={styles.fallback} accessibilityRole="image" accessibilityLabel="Product image unavailable">
        <Image source={custom ? { uri: custom } : BRAND_ICON} style={styles.mark} contentFit="cover" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.image}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={uri}
      transition={120}
      onError={() => setFailed(true)}
    />
  );
}

const styles = themed(() => StyleSheet.create({
  image: { width: '100%', height: '100%', backgroundColor: t.neutral[100] },
  fallback: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: t.neutral[100] },
  mark: { width: '100%', height: '100%', opacity: 0.12 },
}));
