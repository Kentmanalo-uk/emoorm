import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { sizedImg } from '../../lib/media';
import useProductPlaceholder from '../../lib/productPlaceholder';
import { t, themed } from '../../theme';

const BRAND_ICON = require('../../../assets/brand-icon.png');

/**
 * A product picture in a chat: the product card in a message, the
 * "Attach a product" list and the pinned orders. On the website these boxes
 * (.msgr-bubble-product-img img, .msgr-sheet-item-img img, .msgr-pin-thumb img)
 * stretch every <img> to 100% with object-fit: cover, so the no-photo
 * placeholder's faint logo fills the whole tile instead of the usual 70%,
 * also when a photo fails to load.
 *
 * Same engine as ProductImage: expo-image for the disk cache and off-thread
 * decoding, and the server's small copy rather than the stored original.
 * A chat scrolls fast and these are small, so w320 is the right size.
 */
export default function ChatProductThumb({ src, style, width = 64 }) {
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
