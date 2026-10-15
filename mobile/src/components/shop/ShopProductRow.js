import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useProductPeek } from '../peek/ProductPeek';
import { PlusIcon, ShoppingCartIcon, StarIcon } from 'phosphor-react-native';
import ProductImage from '../ProductImage';
import ShopTileImage from './ShopTileImage';
import { SaleWas } from '../SaleTag';
import { ProductTodayTag } from '../TodayTag';
import { saleInfo } from '../../lib/variantPricing';
import { notTakingOrders, opensLabel } from '../../lib/availability';
import { isStockless, priceUnit, startsFrom } from '../orders/orderLines';
import { font, t } from '../../theme';

const money = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A card's price with what it is for (web product/kinds/KindPrice.jsx): "from"
 * before a paluto priced by size, " / head" or " / package" after the
 * amount, smaller (0.78em) in the price's colour.
 */
function KindPrice({ product, amount, size }) {
  const unit = priceUnit(product);
  const word = { fontSize: size * 0.78, ...font(500) };
  return (
    <>
      {startsFrom(product) ? <Text style={word}>from </Text> : null}
      {amount}
      {unit ? <Text style={word}>{unit}</Text> : null}
    </>
  );
}

/**
 * The shop page's product list on phones (web StoreDetail PhoneProductRow):
 * photo, name, rating and sales, price, then add-to-cart and Buy (off while
 * the shop is `closed`, i.e. not taking orders). Edge to edge with a
 * hairline under it, as the website's flat phone pages.
 */
export function ShopProductRow({ product, onAdd, onBuy, closed = false }) {
  const router = useRouter();
  const { price } = saleInfo(product);
  const images = Array.isArray(product.images) ? product.images : [];
  const rating = Number(product.averageRating || 0);
  const reviews = Number(product.reviewCount || 0);
  const sold = Number(product.soldCount || 0);
  // On the shop's menu, not posted now: one grey button, not "Sold out".
  const waiting = notTakingOrders(product);
  const opens = waiting ? opensLabel(product.availability) : null;
  // Paluto has no stock: it is cooked when ordered.
  const soldOut = !waiting && Number(product.stock) === 0 && !isStockless(product);
  const off = soldOut || closed;
  const open = () => router.push(`/product/${product.slug}`);
  const peek = useProductPeek()(product);
  return (
    <View style={styles.row}>
      <Pressable style={styles.img} onPress={open} {...peek} accessibilityRole="link" accessibilityLabel={product.name}>
        <ShopTileImage src={images[0] || null} />
        {soldOut ? <Text style={styles.soldout}>Sold out</Text> : null}
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2} onPress={open} onLongPress={peek.onLongPress} accessibilityRole="link">{product.name}</Text>
        <View style={styles.meta}>
          {reviews > 0 ? (
            <View style={styles.stars}>
              {[0, 1, 2, 3, 4].map((i) => (
                <StarIcon key={i} size={12} weight={i < Math.round(rating) ? 'fill' : 'regular'} color={t.warning[500]} />
              ))}
              <Text style={[styles.metaText, styles.starsNum]}>{rating.toFixed(1)}</Text>
            </View>
          ) : <Text style={[styles.metaText, styles.isNew]}>New</Text>}
          {sold > 0 ? <Text style={[styles.metaText, styles.sold]}>{sold} sold</Text> : null}
        </View>
        <View style={styles.foot}>
          <View style={styles.priceRow}>
            <Text style={styles.price}><KindPrice product={product} amount={money(price)} size={17} /></Text>
            <SaleWas product={product} compact />
          </View>
          {waiting ? (
            <View style={styles.closed} accessibilityRole="button" accessibilityState={{ disabled: true }}>
              <Text style={styles.closedText}>Not taking orders yet</Text>
            </View>
          ) : (
          <View style={styles.actions}>
            <Pressable
              style={[styles.cart, off && styles.disabled]}
              onPress={onAdd}
              disabled={off}
              accessibilityRole="button"
              accessibilityLabel={`Add ${product.name} to cart`}
            >
              <ShoppingCartIcon size={18} color={t.primary[700]} />
              <PlusIcon size={9} weight="bold" color={t.primary[700]} style={styles.plus} />
            </Pressable>
            <Pressable
              style={[styles.buy, off && styles.disabled]}
              onPress={onBuy}
              disabled={off}
              accessibilityRole="button"
              accessibilityHint={closed ? "This shop isn't taking orders yet" : undefined}
            >
              <Text style={styles.buyText}>Buy</Text>
            </Pressable>
          </View>
          )}
        </View>
        {opens ? <Text style={styles.opens}>{opens}</Text> : null}
      </View>
    </View>
  );
}

/**
 * The shop page's grid tile on phones (web StoreDetail ProductCard inside
 * .shop-grid, with index.css's phone rules): square corners, no add-to-cart
 * button (phones hide it; tapping opens the product), name, price in the
 * shop's colour, stars or "New".
 */
export function ShopGridCard({ product, accent, style }) {
  const router = useRouter();
  const { price } = saleInfo(product);
  const images = Array.isArray(product.images) ? product.images : [];
  const reviews = Number(product.reviewCount ?? 0);
  const stars = Math.round(Number(product.averageRating || 0));
  const peek = useProductPeek()(product);
  return (
    <Pressable style={[styles.card, style]} onPress={() => router.push(`/product/${product.slug}`)} {...peek} accessibilityRole="link">
      <View style={styles.cardImg}>
        <ProductImage src={images[0] || null} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={2}>
          <ProductTodayTag product={product} />
          {product.name}
        </Text>
        <View style={styles.cardPriceRow}>
          <Text style={[styles.cardPrice, { color: accent }]}><KindPrice product={product} amount={`₱${price.toFixed(2)}`} size={15} />{' '}</Text>
          <SaleWas product={product} compact />
        </View>
        <View style={styles.ratingRow}>
          {reviews > 0 ? (
            <>
              <View style={styles.cardStars}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <StarIcon key={i} size={11} weight={i < stars ? 'fill' : 'regular'} color={i < stars ? t.warning[500] : t.neutral[300]} />
                ))}
              </View>
              <Text style={styles.reviewCount}>({reviews})</Text>
            </>
          ) : <Text style={styles.reviewCount}>New</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', gap: 12, padding: 10, marginHorizontal: -12,
    backgroundColor: t.neutral[0], borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  img: { position: 'relative', width: 112, height: 112, overflow: 'hidden', borderRadius: 10, backgroundColor: t.neutral[100] },
  soldout: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4, backgroundColor: 'rgba(17, 24, 39, 0.65)',
    color: '#fff', fontSize: 11.5, lineHeight: 18.4, ...font(500), textAlign: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 14.5, lineHeight: 19.575, ...font(500), color: t.neutral[900] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5 },
  metaText: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  starsNum: { marginLeft: 4 },
  isNew: { color: t.primary[700], ...font(500) },
  sold: { paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: t.neutral[200] },
  foot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 'auto', paddingTop: 8 },
  // As the website's nowrap price: it never shrinks, so a long sale price pushes the buttons out.
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 0 },
  price: { fontSize: 17, lineHeight: 27.2, ...font(500), color: t.primary[700], marginRight: 4 },
  actions: { flexDirection: 'row', flexShrink: 0 },
  cart: {
    position: 'relative', width: 38, height: 34, alignItems: 'center', justifyContent: 'center',
    borderTopLeftRadius: 8, borderBottomLeftRadius: 8, backgroundColor: t.primary[50],
  },
  plus: { position: 'absolute', top: 6, right: 7 },
  buy: {
    height: 34, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center',
    borderTopRightRadius: 8, borderBottomRightRadius: 8, backgroundColor: t.primary[600],
  },
  buyText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: '#fff' },
  disabled: { opacity: 0.45 },
  // .shop-m-row-closed, .shop-m-row-opens
  closed: {
    flexShrink: 0, height: 34, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    borderRadius: 8, backgroundColor: t.neutral[200],
  },
  closedText: { fontSize: 13, lineHeight: 16, ...font(600), color: t.neutral[600] },
  opens: { marginTop: 4, fontSize: 12.5, lineHeight: 17, ...font(400), color: t.neutral[500], textAlign: 'right' },

  card: { minWidth: 0, overflow: 'hidden', borderRadius: 0, backgroundColor: t.neutral[0] },
  cardImg: { position: 'relative', width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[100] },
  cardInfo: { flex: 1, gap: 4, paddingTop: 8, paddingHorizontal: 10, paddingBottom: 10 },
  cardName: { fontSize: 16, lineHeight: 21.6, minHeight: 43.2, ...font(400), color: t.secondary[950] },
  cardPriceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  cardPrice: { fontSize: 15, lineHeight: 18, ...font(500) },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cardStars: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  reviewCount: { fontSize: 11, lineHeight: 11, ...font(400), color: t.neutral[500] },
});
