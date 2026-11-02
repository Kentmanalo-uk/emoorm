import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRightIcon } from '../../lib/icons';
import { useStorePeek } from '../peek/StorePeek';
import { resolveImg } from '../../lib/media';
import { font, t, text, themed } from '../../theme';

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

/** .municipality-store-card on phones: an edge-to-edge row with a hairline under it. */
export function MunicipalityStoreRow({ store, fallbackPlace }) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const logo = store.logo ? resolveImg(store.logo) : null;
  const peek = useStorePeek()(store);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/store/${store.slug}`)}
      {...peek}
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

const styles = themed(() => StyleSheet.create({
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
}));
