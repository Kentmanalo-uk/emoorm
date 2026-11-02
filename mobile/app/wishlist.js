import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { ShoppingCartIcon, TrashIcon } from '../src/lib/icons';
import ScreenHeader from '../src/components/ScreenHeader';
import CartConfirmDialog from '../src/components/cart/CartConfirmDialog';
import { ProfileEmpty } from '../src/components/profile/ProfileUI';
import { saveWishlist, syncWishlist } from '../src/components/profile/wishlistSync';
import useWishlistStore from '../src/store/wishlistStore';
import useCartStore from '../src/store/cartStore';
import useAuthStore from '../src/store/authStore';
import { isLivestock } from '../src/components/orders/orderLines';
import { toast } from '../src/lib/toast';
import ProductCard, { CardPhotoButton } from '../src/components/ProductCard';
import { GRID_BLEED, GRID_GAP, gridCellWidth } from '../src/lib/productGrid';
import { font, t, themed } from '../src/theme';
import { PullFlatList } from '../src/components/PullList';

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
  const cardWidth = gridCellWidth(width);

  // The account's saved list (the website's store loads it on sign-in).
  useEffect(() => { if (isAuthenticated) syncWishlist(); }, [isAuthenticated]);

  const handleAddToCart = (product) => {
    // Live animals are bought by making an offer on their page.
    if (isLivestock(product)) { router.push(`/product/${product.slug}`); return; }
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
      <PullFlatList onPull={() => (isAuthenticated ? syncWishlist() : undefined)}
        // Saved items arrive in one response with no paging, so this is
        // as long as the person has been saving; only what is on screen
        // gets built.
        data={items}
        keyExtractor={(product) => product.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item: product }) => (
          <WishlistCard
            width={cardWidth}
            product={product}
            onAddToCart={handleAddToCart}
            onRemove={handleRemove}
          />
        )}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.content}
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        ListHeaderComponent={(
          <>
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
                page
                art="wishlist"
                title="Your wishlist is empty"
                hint="Save products you love and come back to them anytime."
                action="Browse Products"
                onAction={() => router.push('/products')}
              />
            ) : null}
          </>
        )}
      />

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

/** The shared card, with the two things a saved product also needs on its photo. */
function WishlistCard({ width, product, onAddToCart, onRemove }) {
  return (
    <ProductCard
      product={product}
      variant="home"
      style={{ width }}
      photoExtra={(
        <>
          <CardPhotoButton top label={`Remove ${product.name}`} onPress={() => onRemove(product)}>
            <TrashIcon size={15} color={t.neutral[500]} />
          </CardPhotoButton>
          {product.stock === 0 ? null : (
            <CardPhotoButton label={`Add ${product.name} to cart`} onPress={() => onAddToCart(product)}>
              <ShoppingCartIcon size={16} color={t.onBrand} />
            </CardPhotoButton>
          )}
        </>
      )}
    />
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  list: { flex: 1, backgroundColor: t.neutral[100] },
  content: { flexGrow: 1, gap: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 16 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: -12 },
  clear: {
    flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 40, paddingHorizontal: 14,
    borderRadius: 8, backgroundColor: t.neutral[0],
  },
  clearPressed: { backgroundColor: t.danger[50] },
  clearText: { fontSize: 13, lineHeight: 15.6, color: t.neutral[500], ...font(400) },

  gridRow: { gap: GRID_GAP, marginBottom: GRID_GAP, marginHorizontal: GRID_BLEED },
}));
