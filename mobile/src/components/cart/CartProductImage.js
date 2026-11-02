import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { sizedImg } from '../../lib/media';
import useProductPlaceholder from '../../lib/productPlaceholder';
import { t, themed } from '../../theme';

const BRAND_ICON = require('../../../assets/brand-icon.png');

/**
 * The cart's and checkout's product pictures. On the website these boxes
 * (`.cart-m-item-img img`, `.cart-suggestion-image img`, `.co-m-item-img img`)
 * stretch every <img> to 100% with object-fit: cover, so the no-photo
 * placeholder's faint logo fills the whole tile instead of the usual 70%,
 * also when a photo fails to load.
 *
 * Same engine as ProductImage: expo-image for the disk cache and off-thread
 * decoding, and the server's small copy rather than the stored original.
 * These are thumbnails roughly 72 wide, so w320 covers them on any screen.
 */
export default function CartProductImage({ src, style, width = 72 }) {
  const uri = src ? sizedImg(src, width) : null;
  const [failed, setFailed] = useState(false);
  const custom = useProductPlaceholder(!uri || failed);
  useEffect(() => { setFailed(false); }, [uri]);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[styles.image, style]}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={uri}
        transition={120}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.fallback, style]} accessibilityRole="image" accessibilityLabel="Product image unavailable">
      <Image source={custom ? { uri: custom } : BRAND_ICON} style={styles.mark} contentFit="cover" />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  image: { width: '100%', height: '100%', backgroundColor: t.neutral[100] },
  fallback: { width: '100%', height: '100%', overflow: 'hidden', backgroundColor: t.neutral[100] },
  mark: { width: '100%', height: '100%', opacity: 0.12 },
}));
