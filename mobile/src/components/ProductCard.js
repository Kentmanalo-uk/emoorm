import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MapPinIcon, StarIcon } from 'phosphor-react-native';
import { saleInfo } from '../lib/variantPricing';
import { font, t } from '../theme';
import ProductImage from './ProductImage';
import { ProductStats } from './ProductStats';
import { canFlyHero, launchHero, productGalleryBox } from './HeroFlight';
import { resolveImg } from '../lib/media';
import { SaleWas } from './SaleTag';
import { ProductTodayTag } from './TodayTag';
import { notTakingOrders } from '../lib/availability';
import { useProductPeek } from './peek/ProductPeek';
import { isStockless, priceUnit, startsFrom } from './orders/orderLines';

/*
 * The website's phone product tile.
 *
 *   variant="home"    Home's "Suggested for You" / "Explore Products" tile
 *                     (web/src/pages/Home.jsx HomeProductCard, ProductStats)
 *   variant="result"  the search results' tile (web/src/pages/Products.jsx
 *                     .srch-card): larger price, "★ 4.5 | 12 sold", the town
 *
 * Pass the API's `product`; the card fills the width its parent gives it
 * (the website's grids: 2 columns, 4px apart). Tapping opens the product
 * unless `onPress` is given. Phones have no add-to-cart button on the card;
 * holding it opens its preview with Add to cart (components/peek).
 *
 * Older callers still pass name / price / imageUrl / rating / reviewCount
 * with variant "grid" (48% wide) or "list" (a row).
 */
export default function ProductCard({
  product,
  variant,
  onPress,
  style,
  name,
  price,
  imageUrl,
  rating = 0,
  reviewCount = 0,
}) {
  const router = useRouter();
  const p = product || { name, price, averageRating: rating, reviewCount, images: imageUrl ? [imageUrl] : [] };
  const look = variant || (product ? 'home' : 'grid');
  const result = look === 'result';
  const list = look === 'list';
  const photoRef = useRef(null);
  const photoAspect = useRef(0);
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  // Opening the product: the photo flies from the card to the page's gallery.
  const openProduct = () => {
    const uri = p.images?.[0] ? resolveImg(p.images[0]) : null;
    if (!uri || !canFlyHero() || !photoRef.current) {
      router.push(`/product/${p.slug}`);
      return;
    }
    photoRef.current.measureInWindow((x, y, width, height) => {
      const flying = launchHero({
        slug: p.slug, uri, from: { x, y, width, height }, to: productGalleryBox(insets, screenW), aspect: photoAspect.current,
      });
      if (!flying) { router.push(`/product/${p.slug}`); return; }
      // The flight is on screen and moving (native) before the page is built.
      requestAnimationFrame(() => router.push({ pathname: '/product/[slug]', params: { slug: p.slug, via: 'card' } }));
    });
  };
  const open = onPress || (p.slug ? openProduct : undefined);
  const peekProduct = useProductPeek();
  const { price: now } = saleInfo(p);
  const town = p.municipality?.name || p.store?.municipality?.name;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={p.name}
      onPress={open}
      {...(product ? peekProduct(p, { onOpen: open }) : null)}
      style={[styles.card, look === 'grid' && styles.cardGrid, list && styles.cardList, style]}
    >
      <View ref={photoRef} collapsable={false} style={[styles.image, list && styles.imageList]}>
        <ProductImage
          src={p.images?.[0]}
          style={StyleSheet.absoluteFill}
          onLoad={(e) => {
            const { width: w, height: h } = e?.nativeEvent?.source || {};
            if (w && h) photoAspect.current = w / h;
          }}
        />
        {result && p.stock === 0 && !isStockless(p) && !notTakingOrders(p) ? <Text style={[styles.badge, styles.badgeOut]}>Out of Stock</Text> : null}
        {result && p.isFeatured ? <Text style={[styles.badge, styles.badgeFeatured]}>Featured</Text> : null}
      </View>

      <View style={[styles.info, list && styles.infoList]}>
        <Text style={[styles.name, result && styles.nameResult]} numberOfLines={2}>
          <ProductTodayTag product={p} style={styles.tag} />
          {p.name}
        </Text>

        {result ? (
          <>
            <View style={styles.priceRow}>
              <Text style={styles.priceResult}>
                <KindFrom product={p} base={styles.priceResult} />
                ₱{now.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <KindUnit product={p} base={styles.priceResult} />
              </Text>
              <SaleWas product={p} compact style={styles.was} />
            </View>
            <ResultMeta product={p} />
            {town ? (
              <View style={styles.place}>
                <MapPinIcon size={13} color={t.neutral[500]} />
                <Text style={styles.placeText} numberOfLines={1}>{town}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={[styles.priceRow, styles.priceRowHome]}>
              <Text style={styles.price}>
                <KindFrom product={p} base={styles.price} />
                ₱{now.toFixed(2)}
                <KindUnit product={p} base={styles.price} />
              </Text>
              <SaleWas product={p} compact style={styles.was} />
            </View>
            <ProductStats product={p} />
          </>
        )}
      </View>
    </Pressable>
  );
}

// What the price is for (web KindPrice): "from" before a paluto priced by
// size, " / head" or " / package" after the amount, at 0.78 of its size.
const kindSize = (base) => ({ fontSize: Math.round((StyleSheet.flatten(base)?.fontSize || 16) * 0.78), ...font(500) });
function KindFrom({ product, base }) {
  return startsFrom(product) ? <Text style={kindSize(base)}>from </Text> : null;
}
function KindUnit({ product, base }) {
  const unit = priceUnit(product);
  return unit ? <Text style={kindSize(base)}>{unit}</Text> : null;
}

// Still exported from here for older imports.
export { ProductStars, ProductStats } from './ProductStats';

/** The result tile's "★ 4.5 | 12 sold" (or "New"), divided by thin rules. */
function ResultMeta({ product }) {
  const reviews = Number(product.reviewCount || 0);
  const sold = Number(product.soldCount || 0);
  const parts = [];
  if (reviews > 0) {
    parts.push(
      <View key="rating" style={styles.rating}>
        <StarIcon size={13} weight="fill" color={t.warning[500]} />
        <Text style={[styles.metaText, styles.ratingText]}>{Number(product.averageRating || 0).toFixed(1)}</Text>
      </View>,
    );
  }
  if (sold > 0) parts.push(<Text key="sold" style={styles.metaText}>{sold} sold</Text>);
  if (!parts.length) parts.push(<Text key="new" style={[styles.metaText, styles.newText]}>New</Text>);
  return (
    <View style={styles.meta}>
      {parts.map((part, i) => (i ? <View key={part.key} style={styles.metaRule}>{part}</View> : part))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Phones: square corners, white tile (index.css .layout-main .product-card).
  card: { minWidth: 0, overflow: 'hidden', backgroundColor: t.neutral[0] },
  cardGrid: { width: '48%' },
  cardList: { width: '100%', flexDirection: 'row' },
  image: { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[100] },
  imageList: { width: 96, height: 96, aspectRatio: undefined },

  info: { paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10, gap: 3 },
  infoList: { flex: 1, justifyContent: 'center' },
  name: { minHeight: 43.2, fontSize: 16, lineHeight: 21.6, ...font(400), color: t.neutral[800] },
  nameResult: { color: t.secondary[950] },
  // vertical-align: 1px on the website.
  tag: { position: 'relative', top: -1 },

  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  priceRowHome: { marginTop: 2 },
  price: { fontSize: 15, lineHeight: 18, ...font(500), color: t.primary[600] },
  priceResult: { fontSize: 17, lineHeight: 27.2, ...font(500), color: t.primary[700], fontVariant: ['tabular-nums'] },
  // The space between the price and the old price.
  was: { marginLeft: 4 },


  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  metaRule: { paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: t.neutral[200] },
  metaText: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingText: { color: t.neutral[700] },
  newText: { color: t.primary[700] },

  place: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0 },
  placeText: { flexShrink: 1, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },

  badge: {
    position: 'absolute', top: 6, left: 6, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden',
    fontSize: 11, lineHeight: 14, ...font(500), color: '#fff', textTransform: 'uppercase',
  },
  badgeOut: { backgroundColor: t.danger[500] },
  badgeFeatured: { backgroundColor: t.warning[500] },
});
