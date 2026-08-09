import { Alert, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Minus, Plus, ShoppingBag, ShoppingCart, Trash2 } from 'lucide-react-native';
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

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const requireAuth = useRequireAuth();
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const clearCart = useCartStore((state) => state.clearCart);

  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const shippingFee = subtotal >= 500 ? 0 : 50;
  const total = subtotal + shippingFee;

  const groups = Object.values(
    items.reduce((result, item) => {
      const storeId = item.storeId || 'unknown';
      if (!result[storeId]) {
        result[storeId] = { storeId, storeName: item.storeName || 'Unknown Store', items: [] };
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
          <View>
            <Text style={styles.title}>Shopping Cart</Text>
            <Text style={styles.count}>{itemCount} {itemCount === 1 ? 'item' : 'items'}</Text>
          </View>
          <Pressable style={styles.clearButton} onPress={confirmClear}>
            <Trash2 size={16} color={colors.error} />
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        </View>

        {groups.map((group) => (
        <View key={group.storeId} style={styles.storeGroup}>
          <View style={styles.storeHeader}>
            <ShoppingBag size={17} color={colors.secondary} />
            <Text style={styles.storeName}>{group.storeName}</Text>
          </View>
          <FlatList
            data={group.items}
            scrollEnabled={false}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.itemRow}>
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
            )}
          />
        </View>
        ))}

        <View style={styles.summary}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        <SummaryRow label="Subtotal" value={peso(subtotal)} />
        <SummaryRow label="Shipping" value={shippingFee === 0 ? 'Free' : peso(shippingFee)} valueStyle={shippingFee === 0 && styles.freeText} />
        {shippingFee > 0 ? <Text style={styles.shippingHint}>Free shipping on orders ₱500 and above</Text> : null}
        <View style={styles.summaryDivider} />
        <SummaryRow label="Total" value={peso(total)} strong />
        <Pressable style={styles.checkoutButton} onPress={() => requireAuth(() => router.push('/checkout'), '/cart')}>
          <Text style={styles.checkoutText}>Proceed to Checkout</Text>
        </Pressable>
        <Pressable style={styles.continueButton} onPress={() => router.push('/products')}>
          <Text style={styles.continueText}>Continue Shopping</Text>
        </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function SummaryRow({ label, value, strong, valueStyle }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, strong && styles.summaryStrong]}>{label}</Text>
      <Text style={[styles.summaryValue, strong && styles.summaryTotal, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  pageHeader: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, backgroundColor: colors.white },
  pageTitle: { ...typography.h2, color: colors.textPrimary },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  cartToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.h2, color: colors.textPrimary },
  count: { ...typography.caption, color: colors.textSecondary },
  clearButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm },
  clearText: { ...typography.caption, color: colors.error },
  storeGroup: { marginBottom: spacing.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg, overflow: 'hidden' },
  storeHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.bgGreenLight, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  storeName: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  itemRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
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
  summary: { padding: spacing.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg, gap: spacing.sm },
  summaryTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.xs },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { ...typography.body, color: colors.textSecondary },
  summaryValue: { ...typography.body, color: colors.textPrimary },
  summaryStrong: { color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  summaryTotal: { ...typography.h3, color: colors.primaryDark },
  freeText: { color: colors.secondary },
  shippingHint: { ...typography.caption, color: colors.textMuted, textAlign: 'right' },
  summaryDivider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.xs },
  checkoutButton: { height: 48, marginTop: spacing.sm, borderRadius: radius.base, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  checkoutText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  continueButton: { height: 42, alignItems: 'center', justifyContent: 'center' },
  continueText: { ...typography.body, color: colors.secondary },
});
