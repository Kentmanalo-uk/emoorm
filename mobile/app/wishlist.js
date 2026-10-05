import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { PackageIcon, ShoppingCartIcon, TrashIcon } from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import CartConfirmDialog from '../src/components/cart/CartConfirmDialog';
import { ProfileEmpty } from '../src/components/profile/ProfileUI';
import { saveWishlist, syncWishlist } from '../src/components/profile/wishlistSync';
import useWishlistStore from '../src/store/wishlistStore';
import useCartStore from '../src/store/cartStore';
import useAuthStore from '../src/store/authStore';
import { resolveImg } from '../src/lib/media';
import { saleInfo } from '../src/lib/variantPricing';
import { toast } from '../src/lib/toast';
import { font, t } from '../src/theme';

/**
 * /profile/wishlist and /wishlist (web/src/pages/Wishlist.jsx, WishlistContent
 * in the profile layout): "Clear all", then the saved products two to a row,
 * each with Remove and Add to cart.
 */
export default function Wishlist() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const items = useWishlistStore((s) => s.items);
  const removeItem = useWishlistStore((s) => s.removeItem);
  const clear = useWishlistStore((s) => s.clear);
  const addItem = useCartStore((s) => s.addItem);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { width } = useWindowDimensions();
  const cardWidth = Math.floor(((width - 24 - 10) / 2) * 100) / 100;

  // The account's saved list (the website's store loads it on sign-in).
  useEffect(() => { if (isAuthenticated) syncWishlist(); }, [isAuthenticated]);

  const handleAddToCart = (product) => {
    if (!isAuthenticated) { router.push('/login'); return; }
    try {
      addItem({ ...product, quantity: 1 }, 1);
      toast.success(`${product.name} added to cart`);
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
    }
  };

  const handleRemove = (product) => {
    removeItem(product.id);
    if (isAuthenticated) saveWishlist();
    toast.success('Removed from wishlist');
  };

  const handleClearAll = () => {
    setConfirmOpen(false);
    clear();
    if (isAuthenticated) saveWishlist([]);
    toast.success('Wishlist cleared');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="My Wishlist" backTo="/profile" />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        {items.length > 0 ? (
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmOpen(true)}
              style={({ pressed }) => [styles.clear, pressed && styles.clearPressed]}
            >
              {({ pressed }) => (
                <>
                  <TrashIcon size={14} color={pressed ? t.danger[500] : t.neutral[500]} />
                  <Text style={[styles.clearText, pressed && { color: t.danger[500] }]}>Clear all</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : null}

        {items.length === 0 ? (
          <ProfileEmpty
            section
            art="wishlist"
            title="Your wishlist is empty"
            hint="Save products you love and come back to them anytime."
            action="Browse Products"
            onAction={() => router.push('/products')}
          />
        ) : (
          <View style={styles.grid}>
            {items.map((product) => (
              <WishlistCard
                key={product.id}
                width={cardWidth}
                product={product}
                onOpen={() => router.push(`/product/${product.slug}`)}
                onStore={() => product.store?.slug && router.push(`/store/${product.store.slug}`)}
                onAddToCart={handleAddToCart}
                onRemove={handleRemove}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <CartConfirmDialog
        open={confirmOpen}
        title="Remove everything from your wishlist?"
        confirmLabel="Remove all"
        danger
        onConfirm={handleClearAll}
        onCancel={() => setConfirmOpen(false)}
      />
    </View>
  );
}

function WishlistCard({ width, product, onOpen, onStore, onAddToCart, onRemove }) {
  const sale = saleInfo(product);
  const price = sale.price;
  const compareAt = sale.regular ?? (product.compareAtPrice ? Number(product.compareAtPrice) : null);
  const discount = compareAt && compareAt > price
    ? Math.round(((compareAt - price) / compareAt) * 100)
    : null;
  const images = Array.isArray(product.images) ? product.images : [];
  const out = product.stock === 0;

  return (
    <View style={[styles.card, { width }]}>
      <Pressable accessibilityRole="link" accessibilityLabel={product.name} onPress={onOpen} style={styles.imgWrap}>
        {images[0]
          ? <Image source={{ uri: resolveImg(images[0]) || images[0] }} style={styles.img} resizeMode="cover" />
          : <View style={styles.noImg}><PackageIcon size={28} color={t.neutral[300]} /></View>}
        {discount ? <Text style={styles.discount}>-{discount}%</Text> : null}
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityLabel="Remove" onPress={() => onRemove(product)} style={styles.remove}>
        <TrashIcon size={14} color={t.neutral[500]} />
      </Pressable>

      <View style={styles.body}>
        <Pressable accessibilityRole="link" onPress={onOpen}>
          <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        </Pressable>

        {product.store?.name ? (
          <Pressable accessibilityRole="link" onPress={onStore}>
            <Text style={styles.store} numberOfLines={1}>{product.store.name}</Text>
          </Pressable>
        ) : null}

        <View style={styles.priceRow}>
          <Text style={styles.price}>₱{price.toFixed(2)}</Text>
          {compareAt ? <Text style={styles.compare}>₱{compareAt.toFixed(2)}</Text> : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: out }}
          disabled={out}
          onPress={() => onAddToCart(product)}
          style={({ pressed }) => [styles.cartBtn, pressed && { backgroundColor: t.primary[700] }, out && styles.cartBtnOff]}
        >
          <ShoppingCartIcon size={14} color="#fff" />
          <Text style={styles.cartText}>{out ? 'Out of stock' : 'Add to cart'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: -12 },
  clear: {
    flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 14,
    borderRadius: 8, backgroundColor: t.neutral[0],
  },
  clearPressed: { backgroundColor: t.danger[50] },
  clearText: { fontSize: 13, lineHeight: 15.6, color: t.neutral[500], ...font(400) },

  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 10 },
  card: { borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[0] },
  imgWrap: { width: '100%', aspectRatio: 1, overflow: 'hidden', backgroundColor: t.neutral[50] },
  img: { width: '100%', height: '100%' },
  noImg: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  discount: {
    position: 'absolute', top: 8, left: 8, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4, overflow: 'hidden',
    backgroundColor: t.accent[500], color: '#fff', fontSize: 11, lineHeight: 17.6, ...font(500),
  },
  remove: {
    position: 'absolute', top: 6, right: 6, width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 255, 255, 0.9)',
    boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.12)',
  },
  body: { gap: 4, padding: 10 },
  name: { minHeight: 36.4, fontSize: 13, lineHeight: 18.2, color: t.neutral[900], ...font(500) },
  store: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], ...font(400) },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  price: { fontSize: 15, lineHeight: 24, color: t.primary[600], ...font(500) },
  compare: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], textDecorationLine: 'line-through', ...font(400) },
  cartBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 40, marginTop: 6, padding: 7,
    borderRadius: 8, backgroundColor: t.primary[600],
  },
  cartBtnOff: { backgroundColor: t.neutral[400] },
  cartText: { fontSize: 13, lineHeight: 15.6, color: '#fff', ...font(500) },
});
