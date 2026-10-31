import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRightIcon, StorefrontIcon } from '../../lib/icons';
import { resolveImg } from '../../lib/media';
import { font, t, text, themed } from '../../theme';
import EmptyState from '../EmptyState';
import HomeCategoryIcon from './HomeCategoryIcon';
import { useStorePeek } from '../peek/StorePeek';

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

// The colour is read on use, not when this module loads, so a section's
// heading does not stay the near-black of light mode on a dark page.
export const sectionTitleStyle = {
  fontSize: 18, lineHeight: 22.5, ...font(500), get color() { return text.strong; },
};

/** Phones' illustrated empty state for a section (.home-empty). */
export function HomeEmpty({ art, title, body, action, onAction }) {
  return (
    <EmptyState
      compact
      art={art}
      title={title}
      text={body}
      actions={action ? [{ label: action, onPress: onAction }] : null}
    />
  );
}

/**
 * "Shop by Category": one sideways row of 72px tiles, the picture or (in the
 * icon style, or for a category without a picture) its gradient icon.
 */
export function CategoryStrip({ categories, icons }) {
  const router = useRouter();
  return (
    <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
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

/** "Stores Near You": the shop cards in one row that scrolls sideways, the next card peeking in. */
export function HomeStoreRow({ stores }) {
  const { width } = useWindowDimensions();
  // 78% of the section's width (the screen less its 12px sides), as on the web.
  const cardWidth = Math.round((width - 24) * 0.78);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={cardWidth + 12}
      snapToAlignment="start"
      style={styles.storeRow}
      contentContainerStyle={styles.storeRowContent}
    >
      {stores.map((store) => <HomeStoreCard key={store.id} store={store} width={cardWidth} />)}
    </ScrollView>
  );
}

/**
 * A shop window: a strip of the shop's product photos (one large and two
 * small, or its cover, or its logo softened when it has neither), the logo
 * overlapping the strip's edge, the name and place, then the product count
 * and the link.
 */
export function HomeStoreCard({ store, width }) {
  const router = useRouter();
  const open = () => router.push(`/store/${store.slug}`);
  const peek = useStorePeek()(store, { onOpen: open });
  const initials = store.name?.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
  const images = (store.products || [])
    .map((product) => {
      const image = Array.isArray(product.images) ? product.images[0] : product.images;
      return image ? { id: product.id, src: resolveImg(image) || image } : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  const cover = store.coverImage || store.bannerImage;
  const town = store.municipality?.name;
  const address = store.pickupAddress || '';
  // The town once, even when the address already ends with it.
  const place = (town && address.toLowerCase().includes(town.toLowerCase())
    ? address
    : [address, town].filter(Boolean).join(', ')) || 'Oriental Mindoro';
  const count = store._count?.products || 0;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={store.name}
      onPress={open}
      {...peek}
      style={[styles.storeCard, width ? { width } : null]}
    >
      <View style={styles.storeMedia} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {images.length === 3 ? (
          <>
            <StoreThumb src={images[0].src} style={styles.mediaBig} />
            <View style={styles.mediaSide}>
              <StoreThumb src={images[1].src} style={styles.mediaFlex} />
              <StoreThumb src={images[2].src} style={styles.mediaFlex} />
            </View>
          </>
        ) : images.length > 0 ? images.map((image) => (
          <StoreThumb key={image.id} src={image.src} style={styles.mediaFlex} />
        )) : cover ? (
          <StoreThumb src={resolveImg(cover) || cover} style={styles.mediaFlex} />
        ) : store.logo ? (
          <Image source={{ uri: resolveImg(store.logo) || store.logo }} style={styles.mediaBlur} blurRadius={22} resizeMode="cover" />
        ) : (
          <View style={styles.mediaEmpty}><StorefrontIcon size={28} color={t.primary[300]} /></View>
        )}
      </View>
      <View style={styles.storeMain}>
        <View style={styles.storeLogo}>
          {store.logo ? (
            <Image source={{ uri: resolveImg(store.logo) || store.logo }} style={styles.fill} resizeMode="cover" />
          ) : (
            <Text style={styles.storeInitials}>{initials}</Text>
          )}
        </View>
        <View style={styles.storeCopy}>
          <Text style={styles.storeName} numberOfLines={1}>{store.name}</Text>
          <Text style={styles.storePlace} numberOfLines={1}>{place}</Text>
        </View>
      </View>
      <View style={styles.storeFoot}>
        <Text style={styles.storeCount}>{count === 0 ? 'No products yet' : count === 1 ? '1 product' : `${count} products`}</Text>
        <View style={styles.viewProducts}>
          <Text style={styles.viewProductsText}>View products</Text>
          <ArrowRightIcon size={15} color={t.primary[700]} />
        </View>
      </View>
    </Pressable>
  );
}

// A photo in the card's strip (the placeholder picture when it fails to load).
function StoreThumb({ src, style }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.thumb, style]}>
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
      <EmptyState compact art="places" text="Municipality showcases are coming soon." />
    );
  }
  return (
    <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.muniRow}>
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

const styles = themed(() => StyleSheet.create({
  fill: { width: '100%', height: '100%' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { flex: 1, minWidth: 0, ...sectionTitleStyle },
  arrow: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  arrowPressed: { transform: [{ translateX: 2 }] },

  catRow: { gap: 10, paddingRight: 12, paddingBottom: 2 },
  catCard: { width: 72 },
  catImage: { width: 72, height: 72, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[100], alignItems: 'center', justifyContent: 'center' },
  catImageIcon: { backgroundColor: t.neutral[50] },
  catPicture: { width: '100%', height: '100%' },
  catName: { marginTop: 6, fontSize: 12, lineHeight: 14.4, ...font(500), color: t.neutral[700], textAlign: 'center' },

  storeRow: { marginHorizontal: -12 },
  storeRowContent: { gap: 12, paddingHorizontal: 12, paddingBottom: 4 },
  storeCard: { borderRadius: 12, backgroundColor: t.neutral[0], overflow: 'hidden' },
  storeMedia: { flexDirection: 'row', gap: 2, height: 128, backgroundColor: t.primary[50], overflow: 'hidden' },
  mediaBig: { flex: 2 },
  mediaSide: { flex: 1, gap: 2 },
  mediaFlex: { flex: 1 },
  mediaBlur: { width: '100%', height: '100%', opacity: 0.85, transform: [{ scale: 1.35 }] },
  mediaEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumb: { backgroundColor: t.neutral[100], overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbFallback: { width: '50%', height: '50%', opacity: 0.12 },
  storeMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14 },
  storeLogo: {
    width: 52, height: 52, marginTop: -26, borderRadius: 26, borderWidth: 3, borderColor: t.neutral[0],
    overflow: 'hidden', backgroundColor: t.primary[50], alignItems: 'center', justifyContent: 'center',
  },
  storeInitials: { fontSize: 15, lineHeight: 19, ...font(500), color: t.primary[600] },
  storeCopy: { flex: 1, minWidth: 0, paddingTop: 8 },
  storeName: { fontSize: 16, lineHeight: 20, ...font(500), color: t.secondary[950] },
  storePlace: { marginTop: 2, fontSize: 12.5, lineHeight: 16.875, ...font(400), color: t.neutral[500] },
  storeFoot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14,
  },
  storeCount: { fontSize: 12.5, lineHeight: 16, ...font(400), color: t.neutral[500] },
  viewProducts: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32 },
  viewProductsText: { fontSize: 12.5, lineHeight: 16, ...font(500), color: t.primary[700] },
  muniRow: { gap: 12, paddingTop: 2, paddingBottom: 4, paddingRight: 12 },
  muniTile: { width: 88, alignItems: 'center', gap: 8 },
  muniLogo: {
    width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: t.primary[100], backgroundColor: t.primary[50],
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  muniInitial: { fontSize: 24, lineHeight: 30, ...font(500), color: t.primary[700] },
  muniName: { width: '100%', fontSize: 12, lineHeight: 19.2, ...font(500), color: t.neutral[800], textAlign: 'center' },
}));
