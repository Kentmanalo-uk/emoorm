import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRightIcon, StarIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import { resolveImg } from '../../lib/media';
import { font, t, text } from '../../theme';

/*
 * Pieces of the municipality showcase and gallery (web/src/pages/
 * MunicipalityShowcase.jsx, MunicipalityGallery.jsx and their CSS at phone
 * width).
 */

/** The town seal in a white-ringed circle on the green band, or its initial. */
export function MunicipalitySeal({ municipality, size, ring = 0.82, letterSize }) {
  const [failed, setFailed] = useState(false);
  const uri = municipality?.logo ? resolveImg(municipality.logo) : null;
  return (
    <View
      style={[
        styles.seal,
        { width: size, height: size, borderRadius: size / 2, borderColor: `rgba(255, 255, 255, ${ring})` },
      ]}
    >
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={styles.fill}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityLabel={`${municipality?.name || 'Municipality'} logo`}
        />
      ) : (
        <Text style={[styles.sealLetter, { fontSize: letterSize, lineHeight: letterSize * 1.6 }]}>
          {municipality?.name?.charAt(0) || '?'}
        </Text>
      )}
    </View>
  );
}

/** "Top Products" / "Stores in …" with the round arrow link at the end. */
export function MunicipalitySectionHead({ title, label, to }) {
  const router = useRouter();
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text>
      <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => router.push(to)} style={styles.sectionArrow} hitSlop={6}>
        <ArrowRightIcon size={19} color={t.primary[600]} />
      </Pressable>
    </View>
  );
}

const BRAND_ICON = require('../../../assets/brand-icon.png');

// The admin's product placeholder (App settings → productPlaceholder), asked once.
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

/*
 * The card's photo. Without one the website's placeholder <img> takes the
 * card's "object-fit: cover; 100%" rule, so the faint logo fills the whole
 * tile (not the 70% mark of the shared ProductImage).
 */
function CardPhoto({ src }) {
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
    return <Image source={custom ? { uri: custom } : BRAND_ICON} style={[styles.fill, styles.placeholder]} resizeMode="cover" />;
  }
  return <Image source={{ uri }} style={styles.fill} resizeMode="cover" onError={() => setFailed(true)} />;
}

const STACK_W = 281; // 78% of the 360px card
const STACK_H = 180;

function StackImage({ uri, index, label }) {
  // municipality-stack-reveal: rises, turns and grows into place, 110ms apart.
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(reveal, {
      toValue: 1, duration: 650, delay: index * 110, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [index, reveal]);
  const angle = (index - 1) * 7;
  return (
    <Animated.View
      style={[
        styles.stackImg,
        {
          zIndex: 3 - index,
          opacity: reveal,
          transform: [
            { rotate: reveal.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${angle}deg`] }) },
            { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [28, index * 10] }) },
            { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}
    >
      <Image source={{ uri }} accessibilityLabel={label} resizeMode="cover" style={styles.stackPhoto} />
    </Animated.View>
  );
}

/** Up to three gallery photos fanned out, with "View gallery" under them. */
export function MunicipalityGalleryStack({ municipality, id }) {
  const router = useRouter();
  const open = () => router.push(`/municipality/${id}/gallery`);
  const images = Array.isArray(municipality?.gallery) ? municipality.gallery.slice(0, 3) : [];

  if (images.length === 0) {
    return (
      <Pressable accessibilityRole="link" onPress={open} style={styles.stackEmpty}>
        <Text style={styles.stackLinkText}>View gallery</Text>
        <ArrowRightIcon size={16} color={t.primary[700]} />
      </Pressable>
    );
  }

  return (
    <View style={styles.stackCard}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`View ${municipality.name} gallery`}
        onPress={open}
        style={styles.stack}
      >
        {images.map((image, index) => (
          <StackImage
            // eslint-disable-next-line react/no-array-index-key
            key={`${image}-${index}`}
            uri={resolveImg(image)}
            index={index}
            label={`${municipality.name} gallery ${index + 1}`}
          />
        ))}
      </Pressable>
      <Pressable accessibilityRole="link" onPress={open} style={styles.stackLink}>
        <Text style={styles.stackLinkText}>View gallery</Text>
        <ArrowRightIcon size={15} color={t.primary[700]} />
      </Pressable>
    </View>
  );
}

/** .municipality-product-card: photo, two-line name, price, five stars and the review count. */
export function MunicipalityProductCard({ product, style }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={product.name}
      onPress={() => router.push(`/product/${product.slug}`)}
      style={[styles.productCard, style]}
    >
      <View style={styles.productImage}>
        <CardPhoto src={product.images?.[0]} />
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.productPrice}>₱{Number(product.price || 0).toFixed(2)}</Text>
        <View style={styles.rating}>
          <View style={styles.stars}>
            {[0, 1, 2, 3, 4].map((star) => <StarIcon key={star} size={11} weight="fill" color={t.warning[500]} />)}
          </View>
          <Text style={styles.ratingCount}>({product.reviewCount ?? 0})</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** .municipality-store-card on phones: an edge-to-edge row with a hairline under it. */
export function MunicipalityStoreRow({ store, fallbackPlace }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const logo = store.logo ? resolveImg(store.logo) : null;
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/store/${store.slug}`)}
      style={({ pressed }) => [styles.storeRow, pressed && styles.storeRowPressed]}
    >
      <View style={styles.storeLogo}>
        {logo && !failed ? (
          <Image source={{ uri: logo }} style={styles.fill} resizeMode="cover" onError={() => setFailed(true)} accessibilityLabel={`${store.name} logo`} />
        ) : (
          // The row's small grey line style reaches this letter on the website too.
          <Text style={styles.storeLetter}>{store.name?.charAt(0)}</Text>
        )}
      </View>
      <View style={styles.storeBody}>
        <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
        <Text style={styles.storePlace} numberOfLines={1}>{store.pickupAddress || fallbackPlace}</Text>
      </View>
      <ArrowRightIcon size={16} color={t.primary[600]} style={styles.storeArrow} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  placeholder: { opacity: 0.12 },

  seal: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  sealLetter: { color: t.neutral[0], ...font(500) },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, minHeight: 32 },
  sectionTitle: { flex: 1, minWidth: 0, fontSize: 18, lineHeight: 22.5, color: t.neutral[900], ...font(500) },
  sectionArrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  stackCard: { width: '100%', maxWidth: 360, alignItems: 'center' },
  stack: { width: '100%', height: 210 },
  stackImg: {
    position: 'absolute',
    top: 0,
    left: '50%',
    marginLeft: -STACK_W / 2,
    width: STACK_W,
    height: STACK_H,
    borderWidth: 4,
    borderColor: t.neutral[0],
    borderRadius: 10,
    backgroundColor: t.neutral[0],
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 6,
  },
  stackPhoto: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: t.neutral[100] },
  stackLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, marginTop: 4 },
  stackLinkText: { fontSize: 13, lineHeight: 20.8, color: t.primary[700], ...font(500) },
  stackEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 6,
    minHeight: 48,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: t.secondary[200],
    borderRadius: 8,
  },

  productCard: { overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[0] },
  productImage: { aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[100] },
  productInfo: { flex: 1, gap: 4, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 },
  productName: { minHeight: 43.2, fontSize: 16, lineHeight: 21.6, color: t.secondary[950], ...font(500) },
  productPrice: { marginTop: 2, fontSize: 15, lineHeight: 18, color: t.primary[600], ...font(500) },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  ratingCount: { fontSize: 11, lineHeight: 11, color: text.muted, ...font(400) },

  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 73,
    marginHorizontal: -12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.neutral[200],
    backgroundColor: t.neutral[0],
  },
  storeRowPressed: { backgroundColor: t.neutral[50] },
  storeLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[100],
  },
  storeLetter: { marginTop: 4, fontSize: 12, lineHeight: 19.2, color: text.muted, ...font(500) },
  storeBody: { flex: 1, minWidth: 0 },
  storeName: { fontSize: 15, lineHeight: 24, color: t.secondary[950], ...font(500) },
  storePlace: { marginTop: 4, fontSize: 12, lineHeight: 19.2, color: text.muted, ...font(400) },
  storeArrow: { flexShrink: 0 },
});
