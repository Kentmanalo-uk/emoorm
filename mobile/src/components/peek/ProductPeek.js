import { Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowSquareOutIcon, HandCoinsIcon, HeartIcon, MapPinIcon, ShareNetworkIcon, ShoppingCartIcon, SlidersHorizontalIcon,
  StorefrontIcon,
} from 'phosphor-react-native';
import { font, t } from '../../theme';
import useAuthStore from '../../store/authStore';
import useCartStore from '../../store/cartStore';
import useWishlistStore from '../../store/wishlistStore';
import { toast } from '../../lib/toast';
import { saleInfo } from '../../lib/variantPricing';
import ProductImage from '../ProductImage';
import { ProductStats } from '../ProductStats';
import { SaleWas } from '../SaleTag';
import { ProductTodayTag } from '../TodayTag';
import { notTakingOrders } from '../../lib/availability';
import { isLivestock, isStockless, minOrder, priceUnit, startsFrom } from '../orders/orderLines';
import { cartRefusal, quickCartLine } from '../product/productLib';
import { saveWishlist } from '../profile/wishlistSync';
import { PeekBody, peekProps, peekText } from '../Peek';

/*
 * A product's long-press preview: its photo, name, price, rating and shop,
 * with Add to cart (or Choose options / Make an offer), the wishlist, the
 * shop and Share under it.
 *
 *   const peekProduct = useProductPeek();
 *   <Pressable onPress={open} {...peekProduct(product, { onOpen: open, extra })}>
 *
 * `onOpen` defaults to opening the product page; `extra` adds actions after
 * the usual ones (the cart's Remove, the wishlist's Remove…); `cart: false`
 * leaves out Add to cart (a line already in the cart).
 */

const priceText = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const outOfStock = (p) => p.stock === 0 && !isStockless(p);
// An item on its shop's menu but not posted now: its own grey tag, no badge.
const outBadge = (p) => outOfStock(p) && !notTakingOrders(p);
const hasOptions = (p) => Array.isArray(p.variations) && p.variations.length > 0;

export function useProductPeek() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addItem = useCartStore((s) => s.addItem);

  return (product, { onOpen, extra = [], cart = true } = {}) => peekProps(() => {
    const p = product;
    if (!p?.slug && !onOpen) return null;
    const openPage = () => router.push(`/product/${p.slug}`);
    const open = onOpen || openPage;
    const signIn = () => router.push(`/login?redirect=${encodeURIComponent(`/product/${p.slug}`)}`);
    const wishlisted = useWishlistStore.getState().items.some((item) => item.id === p.id);

    const addToCart = () => {
      if (!isAuthenticated) { signIn(); return; }
      try {
        const line = quickCartLine(p, saleInfo(p).price);
        const refusal = cartRefusal(line);
        if (refusal) throw new Error(refusal);
        addItem(line, minOrder(p));
        toast.success('Added to cart');
      } catch (err) {
        toast.error(err.message || 'Could not add to cart');
      }
    };
    const toggleWishlist = () => {
      if (!isAuthenticated) { signIn(); return; }
      useWishlistStore.getState().toggleItem(p);
      saveWishlist();
      toast.success(wishlisted ? 'Removed from wishlist' : 'Added to wishlist');
    };
    const share = async () => {
      try {
        const url = `https://emoorm.shop/product/${p.slug}`;
        const { price } = saleInfo(p);
        await Share.share({
          title: p.name,
          message: `${p.name} — ${startsFrom(p) ? 'from ' : ''}${priceText(price)}${priceUnit(p)} on E-MOORM ${url}`,
          url,
        });
      } catch {
        // Closing the share menu needs no message.
      }
    };

    let buy = null;
    if (cart && p.slug) {
      if (isLivestock(p)) buy = { key: 'offer', label: 'Make an offer', Icon: HandCoinsIcon, onPress: openPage };
      else if (outOfStock(p)) buy = null;
      // A list that left out the options (recently viewed…): no quick add, its page has it.
      else if (!Array.isArray(p.variations)) buy = null;
      else if (hasOptions(p)) buy = { key: 'options', label: 'Choose options', Icon: SlidersHorizontalIcon, onPress: openPage };
      else buy = { key: 'cart', label: 'Add to cart', Icon: ShoppingCartIcon, onPress: addToCart };
    }

    return {
      content: <ProductPeekCard product={p} />,
      onOpen: open,
      actions: [
        { key: 'open', label: 'View product', Icon: ArrowSquareOutIcon, onPress: open },
        buy,
        p.id && p.slug ? {
          key: 'wish', label: wishlisted ? 'Remove from wishlist' : 'Add to wishlist', Icon: HeartIcon, onPress: toggleWishlist,
        } : null,
        p.store?.slug ? { key: 'shop', label: 'Visit shop', Icon: StorefrontIcon, onPress: () => router.push(`/store/${p.store.slug}`) } : null,
        p.slug ? { key: 'share', label: 'Share', Icon: ShareNetworkIcon, onPress: share } : null,
        ...extra,
      ],
    };
  });
}

/** The preview itself. */
export function ProductPeekCard({ product: p }) {
  const { height: screenH } = useWindowDimensions();
  const { price } = saleInfo(p);
  const town = p.municipality?.name || p.store?.municipality?.name;
  const unit = priceUnit(p);
  return (
    <View>
      {/* A square photo, smaller on short screens so the actions still fit. */}
      <View style={[styles.photo, { maxHeight: Math.max(180, screenH - 470) }]}>
        <ProductImage src={Array.isArray(p.images) ? p.images[0] : p.images || p.image} style={StyleSheet.absoluteFill} />
        {outBadge(p) ? <Text style={styles.badge}>{isLivestock(p) ? 'Sold out' : 'Out of stock'}</Text> : null}
      </View>
      <PeekBody>
        <Text style={peekText.title} numberOfLines={2}>
          <ProductTodayTag product={p} style={styles.tag} />
          {p.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {startsFrom(p) ? <Text style={styles.unit}>from </Text> : null}
            {priceText(price)}
            {unit ? <Text style={styles.unit}>{unit}</Text> : null}
          </Text>
          <SaleWas product={p} compact style={styles.was} />
        </View>
        <ProductStats product={p} />
        {p.store?.name || town ? (
          <View style={styles.shop}>
            {p.store?.name ? <StorefrontIcon size={14} color={t.neutral[500]} /> : <MapPinIcon size={14} color={t.neutral[500]} />}
            <Text style={peekText.sub} numberOfLines={1}>{[p.store?.name, town].filter(Boolean).join(' · ')}</Text>
          </View>
        ) : null}
      </PeekBody>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[100] },
  badge: {
    position: 'absolute', top: 10, left: 10, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, overflow: 'hidden',
    fontSize: 12, lineHeight: 15, ...font(500), color: '#fff', backgroundColor: t.danger[500], textTransform: 'uppercase',
  },
  tag: { position: 'relative', top: -1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
  price: { fontSize: 19, lineHeight: 24, ...font(500), color: t.primary[700], fontVariant: ['tabular-nums'] },
  unit: { fontSize: 15, ...font(500) },
  was: { marginLeft: 6 },
  shop: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4, minWidth: 0 },
});
