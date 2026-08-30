import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MinusIcon as Minus, PlusIcon as Plus, ShoppingBagIcon as ShoppingBag, ShoppingCartIcon as ShoppingCart, TrashIcon as Trash2, CheckIcon as Check, StorefrontIcon as Store } from 'phosphor-react-native';
import useCartStore from '../../src/store/cartStore';
import EmptyState from '../../src/components/EmptyState';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';
import useRequireAuth from '../../src/hooks/useRequireAuth';

const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

function Checkbox({ checked, onPress, size = 22 }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={8}
      onPress={onPress}
      style={[styles.checkbox, checked && styles.checkboxChecked, { width: size, height: size }]}
    >
      {checked ? <Check size={size - 8} color={colors.white} /> : null}
    </Pressable>
  );
}

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const items = useCartStore((state) => state.items);
  const selectedProductIds = useCartStore((state) => state.selectedProductIds);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);
  const toggleItem = useCartStore((state) => state.toggleItem);
  const toggleStore = useCartStore((state) => state.toggleStore);
  const toggleAll = useCartStore((state) => state.toggleAll);

  const selectedItems = items.filter((item) => selectedProductIds.includes(item.id));
  const selectedCount = selectedItems.reduce((count, item) => count + item.quantity, 0);
  const selectedSubtotal = selectedItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const shippingFee = selectedSubtotal >= 500 ? 0 : 50;
  const total = selectedSubtotal + shippingFee;
  const allSelected = items.length > 0 && items.every((item) => selectedProductIds.includes(item.id));

  const groups = Object.values(
    items.reduce((result, item) => {
      const storeId = item.storeId || 'unknown';
      if (!result[storeId]) {
        result[storeId] = {
          storeId,
          storeName: item.storeName || 'Unknown Store',
          storeLogo: item.storeLogo || item.store?.logo || item.storeLogoUrl,
          storeSlug: item.storeSlug || item.store?.slug,
          items: [],
        };
      }
      result[storeId].items.push(item);
      return result;
    }, {})
  );

  const changeQuantity = (item, nextQuantity) => {
    if (nextQuantity < 1) return;
    try {
      updateQuantity(item.id, nextQuantity);
    } catch (err) {
      toast.error(err.message || 'Failed to update quantity');
    }
  };

  const confirmRemove = (item) => {
    Alert.alert('Remove item?', `Remove ${item.name} from your cart?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeItem(item.id) },
    ]);
  };

  const confirmClear = () => {
    Alert.alert('Clear cart?', 'Remove all items from your cart?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clearCart },
    ]);
  };

  const handleCheckout = () => {
    if (selectedItems.length === 0) {
      toast.error('Select an item to checkout');
      return;
    }
    requireAuth(() => router.push('/checkout'), '/cart');
  };

  if (items.length === 0) {
    return (
      <View style={styles.screen}>
        <View style={[styles.pageHeader, { paddingTop: insets.top + spacing.md }]}>
          <Text style={styles.pageTitle}>Cart</Text>
        </View>
        <EmptyState
          icon={<ShoppingCart size={48} color={colors.gray400} />}
          title="Your cart is empty"
          message="Start shopping to add items to your cart"
          actionLabel="Browse Products"
          onAction={() => router.push('/products')}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.pageHeader, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.pageTitle}>Cart</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.cartToolbar}>
          <Pressable style={styles.selectAllRow} onPress={toggleAll} hitSlop={8}>
            <Checkbox checked={allSelected} onPress={toggleAll} size={20} />
            <Text style={styles.selectAllText}>Select all</Text>
          </Pressable>
          <Pressable style={styles.clearButton} onPress={confirmClear}>
            <Trash2 size={16} color={colors.error} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        </View>

        {groups.map((group) => {
          const storeAllSelected = group.items.every((item) => selectedProductIds.includes(item.id));
          return (
            <View key={group.storeId} style={styles.storeGroup}>
              <View style={styles.storeHeader}>
                <Checkbox checked={storeAllSelected} onPress={() => toggleStore(group.storeId)} size={20} />
                <Pressable
                  style={styles.storeIdentity}
                  onPress={() => router.push(group.storeSlug ? `/store/${group.storeSlug}` : `/store/${group.storeId}`)}
                >
                  {group.storeLogo ? (
                    <Image source={{ uri: resolveImg(group.storeLogo) }} style={styles.storeLogo} />
                  ) : (
                    <View style={styles.storeLogoPlaceholder}>
                      <Store size={16} color={colors.secondary} />
                    </View>
                  )}
                  <Text style={styles.storeName} numberOfLines={1}>{group.storeName}</Text>
                </Pressable>
              </View>
              <FlatList
                data={group.items}
                scrollEnabled={false}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const isSelected = selectedProductIds.includes(item.id);
                  return (
                    <View style={styles.itemRow}>
                      <Checkbox checked={isSelected} onPress={() => toggleItem(item.id)} />
                      <Pressable onPress={() => router.push(`/product/${item.slug || item.id}`)}>
                        {item.image ? (
                          <Image source={{ uri: resolveImg(item.image) }} style={styles.itemImage} />
                        ) : (
                          <View style={styles.itemImagePlaceholder}><ShoppingBag size={22} color={colors.gray400} /></View>
                        )}
                      </Pressable>
                      <View style={styles.itemInfo}>
                        <Pressable onPress={() => router.push(`/product/${item.slug || item.id}`)}>
                          <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                        </Pressable>
                        <Text style={styles.itemPrice}>{peso(item.price)}</Text>
                        {item.stock !== undefined && item.stock < 10 && item.stock > 0 ? (
                          <Text style={styles.lowStock}>Only {item.stock} left in stock</Text>
                        ) : null}
                        {item.stock === 0 ? <Text style={styles.outOfStock}>Out of stock</Text> : null}
                        <View style={styles.itemActions}>
                          <View style={styles.stepper}>
                            <Pressable
                              style={[styles.stepperButton, item.quantity <= 1 && styles.disabled]}
                              disabled={item.quantity <= 1}
                              onPress={() => changeQuantity(item, item.quantity - 1)}
                            >
                              <Minus size={14} color={colors.textPrimary} />
                            </Pressable>
                            <Text style={styles.quantity}>{item.quantity}</Text>
                            <Pressable
                              style={[styles.stepperButton, item.quantity >= item.stock && styles.disabled]}
                              disabled={item.quantity >= item.stock}
                              onPress={() => changeQuantity(item, item.quantity + 1)}
                            >
                              <Plus size={14} color={colors.textPrimary} />
                            </Pressable>
                          </View>
                          <Pressable style={styles.removeButton} onPress={() => confirmRemove(item)}>
                            <Trash2 size={17} color={colors.error} />
                          </Pressable>
                        </View>
                      </View>
                      <Text style={styles.lineTotal}>{peso(Number(item.price) * item.quantity)}</Text>
                    </View>
                  );
                }}
              />
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={styles.bottomTotal}>
          <Text style={styles.bottomTotalLabel}>{selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected • Total</Text>
          <Text style={styles.bottomTotalValue}>{peso(total)}</Text>
        </View>
        <Pressable
          style={[styles.bottomCheckoutButton, selectedItems.length === 0 && styles.disabled]}
          onPress={handleCheckout}
          disabled={selectedItems.length === 0}
        >
          <Text style={styles.bottomCheckoutText}>Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  pageHeader: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, backgroundColor: colors.white },
  pageTitle: { ...typography.h2, color: colors.textPrimary },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  cartToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  selectAllText: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm },
  clearText: { ...typography.caption, color: colors.error },
  checkbox: {
    borderRadius: radius.base,
    borderWidth: 2,
    borderColor: colors.borderMedium,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  storeGroup: { marginBottom: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden' },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.bgGreenLight, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  storeIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  storeLogo: { width: 28, height: 28, borderRadius: radius.full, backgroundColor: colors.gray100 },
  storeLogoPlaceholder: { width: 28, height: 28, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  storeName: { ...typography.body, flex: 1, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  itemImage: { width: 76, height: 76, borderRadius: radius.base, backgroundColor: colors.gray100 },
  itemImagePlaceholder: { width: 76, height: 76, borderRadius: radius.base, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray100 },
  itemInfo: { flex: 1, gap: 3 },
  itemName: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.medium, fontWeight: '500' },
  itemPrice: { ...typography.body, color: colors.primaryDark, fontFamily: fontFamily.bold, fontWeight: '700' },
  lowStock: { ...typography.caption, color: colors.warning },
  outOfStock: { ...typography.caption, color: colors.error },
  itemActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.base, overflow: 'hidden' },
  stepperButton: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gray50 },
  quantity: { ...typography.caption, width: 30, textAlign: 'center', color: colors.textPrimary },
  disabled: { opacity: 0.4 },
  removeButton: { width: 30, height: 28, alignItems: 'center', justifyContent: 'center' },
  lineTotal: { ...typography.caption, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  bottomTotal: { flex: 1, gap: 2 },
  bottomTotalLabel: { ...typography.caption, color: colors.textSecondary },
  bottomTotalValue: { ...typography.h3, color: colors.textPrimary },
  bottomCheckoutButton: {
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.base,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  bottomCheckoutText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold, fontWeight: '600' },
});
