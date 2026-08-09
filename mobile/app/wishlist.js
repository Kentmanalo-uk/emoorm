import { Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart, Package, ShoppingCart, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import ScreenHeader from '../src/components/ScreenHeader';
import EmptyState from '../src/components/EmptyState';
import useWishlistStore from '../src/store/wishlistStore';
import useCartStore from '../src/store/cartStore';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

const imageOf = (product) => Array.isArray(product.images) ? product.images[0] : product.image;

export default function Wishlist() {
  const router = useRouter();
  const items = useWishlistStore((state) => state.items);
  const removeItem = useWishlistStore((state) => state.removeItem);
  const clear = useWishlistStore((state) => state.clear);
  const addItem = useCartStore((state) => state.addItem);

  const addToCart = (product) => {
    try {
      addItem({ ...product, image: imageOf(product), storeId: product.storeId || product.store?.id, storeName: product.store?.name }, 1);
      toast.success('Added to cart');
    } catch (error) { toast.error(error.message || 'Could not add item'); }
  };

  return <View style={styles.screen}>
    <ScreenHeader title="My Wishlist" subtitle={`${items.length} saved ${items.length === 1 ? 'item' : 'items'}`} action={items.length ? <Pressable onPress={() => Alert.alert('Clear wishlist?', 'All saved products will be removed.', [{ text: 'Keep', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: clear }])}><Trash2 size={19} color={colors.error} /></Pressable> : null} />
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={items.length ? styles.list : styles.empty}
      ListEmptyComponent={<EmptyState icon={<Heart size={46} color={colors.gray400} />} title="Your wishlist is empty" message="Save products you love and come back anytime." actionLabel="Browse products" onAction={() => router.push('/products')} />}
      renderItem={({ item }) => <Pressable style={styles.card} onPress={() => router.push(`/product/${item.slug}`)}>
        {imageOf(item) ? <Image source={{ uri: resolveImg(imageOf(item)) }} style={styles.image} /> : <View style={[styles.image, styles.fallback]}><Package size={24} color={colors.gray400} /></View>}
        <View style={styles.body}><Text style={styles.name} numberOfLines={2}>{item.name}</Text><Text style={styles.store} numberOfLines={1}>{item.store?.name || item.storeName || 'Local seller'}</Text><Text style={styles.price}>₱{Number(item.price || 0).toFixed(2)}</Text><View style={styles.actions}><Pressable style={styles.cartButton} disabled={item.stock === 0} onPress={(event) => { event.stopPropagation(); addToCart(item); }}><ShoppingCart size={15} color={colors.white} /><Text style={styles.cartText}>{item.stock === 0 ? 'Out of stock' : 'Add to cart'}</Text></Pressable><Pressable style={styles.removeButton} onPress={(event) => { event.stopPropagation(); removeItem(item.id); }}><Trash2 size={17} color={colors.error} /></Pressable></View></View>
      </Pressable>}
    />
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl }, empty: { flexGrow: 1 },
  card: { flexDirection: 'row', padding: spacing.sm, gap: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white }, image: { width: 110, height: 126, borderRadius: radius.base, backgroundColor: colors.gray100 }, fallback: { alignItems: 'center', justifyContent: 'center' }, body: { flex: 1, paddingVertical: spacing.xs }, name: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, store: { ...typography.caption, color: colors.textMuted, marginTop: 3 }, price: { ...typography.h3, color: colors.primaryDark, marginTop: spacing.sm }, actions: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }, cartButton: { flex: 1, height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.base, backgroundColor: colors.primary }, cartText: { ...typography.caption, color: colors.white, fontFamily: fontFamily.semiBold }, removeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: '#fef2f2' },
});
