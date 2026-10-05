import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRightIcon, StorefrontIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { font, t, text } from '../../theme';
import EmptyArt from '../EmptyArt';
import HomeCategoryIcon from './HomeCategoryIcon';

/*
 * The pieces of Home's sections on phones (web/src/pages/Home.jsx and the
 * ≤480px rules in Home.css).
 */

/** A section's title with the green arrow to its full list. */
export function SectionHeader({ title, arrowLabel, onArrow, style }) {
  return (
    <View style={[styles.header, style]}>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>
      {onArrow ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={arrowLabel}
          onPress={onArrow}
          hitSlop={6}
          style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
        >
          <ArrowRightIcon size={19} color={t.primary[600]} />
        </Pressable>
      ) : null}
    </View>
  );
}

export const sectionTitleStyle = { fontSize: 18, lineHeight: 22.5, ...font(500), color: text.strong };

/** Phones' illustrated empty state for a section (.home-empty). */
export function HomeEmpty({ art, title, body, action, onAction }) {
  return (
    <View style={styles.empty}>
      <EmptyArt name={art} size={120} style={styles.emptyArt} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      <Pressable
        accessibilityRole="link"
        onPress={onAction}
        style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
      >
        <Text style={styles.emptyBtnText}>{action}</Text>
      </Pressable>
    </View>
  );
}

/**
 * "Shop by Category": one sideways row of 72px tiles, the picture or (in the
 * icon style, or for a category without a picture) its gradient icon.
 */
export function CategoryStrip({ categories, icons }) {
  const router = useRouter();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
      {categories.map((cat) => (
        <Pressable
          key={cat.id}
          accessibilityRole="link"
          accessibilityLabel={cat.name}
          onPress={() => router.push({ pathname: '/products', params: { category: cat.id } })}
          style={styles.catCard}
        >
          {icons || !cat.image ? (
            <View style={[styles.catImage, styles.catImageIcon]}>
              <HomeCategoryIcon category={cat} size={33} />
            </View>
          ) : (
            <View style={styles.catImage}>
              <Image source={{ uri: resolveImg(cat.image) }} style={styles.catPicture} resizeMode="cover" />
            </View>
          )}
          <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** "Stores Near You" card: logo + name + place, then product thumbs + link. */
export function HomeStoreCard({ store }) {
  const router = useRouter();
  const open = () => router.push(`/store/${store.slug}`);
  const initials = store.name?.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
  const images = (store.products || [])
    .map((product) => {
      const image = Array.isArray(product.images) ? product.images[0] : product.images;
      return image ? { id: product.id, src: resolveImg(image) || image } : null;
    })
    .filter(Boolean);
  const place = [store.pickupAddress, store.municipality?.name].filter(Boolean).join(', ') || 'Oriental Mindoro';

  return (
    <View style={styles.storeCard}>
      <Pressable accessibilityRole="link" accessibilityLabel={store.name} onPress={open} style={styles.storeMain}>
        <View style={styles.storeLogo}>
          {store.logo ? (
            <Image source={{ uri: resolveImg(store.logo) || store.logo }} style={styles.fill} resizeMode="cover" />
          ) : (
            <Text style={styles.storeInitials}>{initials}</Text>
          )}
        </View>
        <View style={styles.storeCopy}>
          <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
          <Text style={styles.storePlace} numberOfLines={2}>{place}</Text>
        </View>
      </Pressable>
      <View style={styles.storeProducts}>
        <View style={styles.stack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {images.length > 0 ? images.map((image, i) => (
            <StackThumb key={image.id} src={image.src} first={i === 0} />
          )) : (
            <View style={[styles.thumb, styles.thumbFirst]}>
              <StorefrontIcon size={18} color={t.neutral[500]} />
            </View>
          )}
        </View>
        <Pressable accessibilityRole="link" onPress={open} style={styles.viewProducts}>
          <Text style={styles.viewProductsText}>View products</Text>
          <ArrowRightIcon size={15} color={t.primary[700]} />
        </Pressable>
      </View>
    </View>
  );
}

// A product thumb in the store card's overlapping row (the placeholder
// picture when it fails to load).
function StackThumb({ src, first }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.thumb, first && styles.thumbFirst]}>
      <Image
        source={failed ? require('../../../assets/brand-icon.png') : { uri: src }}
        style={failed ? styles.thumbFallback : styles.fill}
        resizeMode={failed ? 'contain' : 'cover'}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

/** "Explore Municipals": a sideways row of round town logos. */
export function MunicipalityRail({ municipalities }) {
  const router = useRouter();
  if (!municipalities.length) {
    return (
      <View style={styles.muniEmpty}>
        <EmptyArt name="places" size={80} />
        <Text style={styles.muniEmptyText}>Municipality showcases are coming soon.</Text>
      </View>
    );
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.muniRow}>
      {municipalities.map((m) => (
        <Pressable
          key={m.id}
          accessibilityRole="link"
          accessibilityLabel={m.name}
          onPress={() => router.push(`/municipality/${m.id}`)}
          style={styles.muniTile}
        >
          <View style={styles.muniLogo}>
            {m.logo ? (
              <Image source={{ uri: resolveImg(m.logo) }} style={styles.fill} resizeMode="cover" accessibilityLabel={`${m.name} logo`} />
            ) : (
              <Text style={styles.muniInitial}>{m.name?.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          <Text style={styles.muniName} numberOfLines={1}>{m.name}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { flex: 1, minWidth: 0, ...sectionTitleStyle },
  arrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  arrowPressed: { transform: [{ translateX: 2 }] },

  empty: { alignItems: 'center', paddingTop: 24, paddingHorizontal: 20, paddingBottom: 28 },
  emptyArt: { marginBottom: 16 },
  emptyTitle: { marginBottom: 6, fontSize: 16, lineHeight: 24, ...font(500), color: t.neutral[900], textAlign: 'center' },
  emptyBody: { maxWidth: 280, marginBottom: 18, fontSize: 13.5, lineHeight: 20.25, ...font(400), color: t.neutral[500], textAlign: 'center' },
  emptyBtn: {
    height: 40, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: t.primary[600],
    alignItems: 'center', justifyContent: 'center',
  },
  emptyBtnPressed: { backgroundColor: t.primary[50] },
  emptyBtnText: { fontSize: 14, lineHeight: 20, ...font(500), color: t.primary[700] },

  catRow: { gap: 10, paddingRight: 12, paddingBottom: 2 },
  catCard: { width: 72 },
  catImage: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[100], alignItems: 'center', justifyContent: 'center' },
  catImageIcon: { backgroundColor: t.neutral[50] },
  catPicture: { width: '100%', height: '100%' },
  catName: { marginTop: 6, fontSize: 12, lineHeight: 14.4, ...font(500), color: t.neutral[700], textAlign: 'center' },

  storeCard: { borderRadius: 12, backgroundColor: t.neutral[0], overflow: 'hidden' },
  storeMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 6 },
  storeLogo: {
    width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: t.primary[50],
    alignItems: 'center', justifyContent: 'center',
  },
  storeInitials: { fontSize: 16, lineHeight: 20, ...font(500), color: t.primary[600] },
  storeCopy: { flex: 1, minWidth: 0 },
  storeName: { fontSize: 16, lineHeight: 19.2, ...font(500), color: t.secondary[950] },
  storePlace: { marginTop: 3, fontSize: 12.5, lineHeight: 16.875, ...font(400), color: t.neutral[500] },
  storeProducts: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingTop: 6, paddingHorizontal: 14, paddingBottom: 14,
  },
  stack: { flexDirection: 'row', flexShrink: 1, minWidth: 0, minHeight: 36, paddingLeft: 10, overflow: 'hidden' },
  thumb: {
    width: 36, height: 36, marginLeft: -10, borderRadius: 18, borderWidth: 2, borderColor: t.neutral[0],
    backgroundColor: t.neutral[100], overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(15, 23, 42, 0.1)' }],
  },
  thumbFirst: { marginLeft: 0 },
  thumbFallback: { width: '70%', height: '70%', opacity: 0.12 },
  viewProducts: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36 },
  viewProductsText: { fontSize: 12, lineHeight: 16, ...font(500), color: t.primary[700] },

  muniRow: { gap: 12, paddingTop: 2, paddingBottom: 4, paddingRight: 12 },
  muniTile: { width: 88, alignItems: 'center', gap: 8 },
  muniLogo: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: t.primary[100], backgroundColor: t.primary[50],
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  muniInitial: { fontSize: 24, lineHeight: 30, ...font(500), color: t.primary[700] },
  muniName: { width: '100%', fontSize: 12, lineHeight: 19.2, ...font(500), color: t.neutral[800], textAlign: 'center' },
  muniEmpty: { alignItems: 'center', padding: 20 },
  muniEmptyText: { fontSize: 14, lineHeight: 22, ...font(400), color: t.neutral[500], textAlign: 'center' },
});
