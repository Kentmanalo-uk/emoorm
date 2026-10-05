import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  HeartIcon, MagnifyingGlassIcon, ShoppingBagIcon, StorefrontIcon, TrashIcon, WarningCircleIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import useCartStore from '../../src/store/cartStore';
import useAuthStore from '../../src/store/authStore';
import EmptyState from '../../src/components/EmptyState';
import EmptyArt from '../../src/components/EmptyArt';
import ShellPageMenu from '../../src/components/ShellPageMenu';
import CartStoreGroup from '../../src/components/cart/CartStoreGroup';
import CartSuggestions from '../../src/components/cart/CartSuggestions';
import CartBar from '../../src/components/cart/CartBar';
import CartVoucherCard from '../../src/components/cart/CartVoucherCard';
import CartConfirmDialog from '../../src/components/cart/CartConfirmDialog';
import useCartIdentityGate from '../../src/components/cart/useCartIdentityGate';
import CartLoginGate from '../../src/components/cart/CartLoginGate';
import { cartPeso, storeDeliveryFee, useCartSettings } from '../../src/components/cart/cartSettings';
import { toast } from '../../src/lib/toast';
import { font, t } from '../../src/theme';

/*
 * The cart (web/src/pages/Cart.jsx, phone layout): a title bar with the ⋯
 * menu that stays on top, a search field, the shop groups, "Have a voucher?",
 * "You may also like", and the checkout bar above the tab bar.
 */

const SUGGESTION_COUNT = 12;
const fixed2 = (n) => `₱${Number(n || 0).toFixed(2)}`;

export default function Cart() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const settings = useCartSettings();
  const { requireVerifiedIdentity, identityDialog } = useCartIdentityGate();
  const items = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const revalidate = useCartStore((s) => s.revalidate);

  const [storeSlugs, setStoreSlugs] = useState({});
  const [cartSearchText, setCartSearchText] = useState(() => String(params.cartSearch || ''));
  const [confirm, setConfirm] = useState(null); // { title, confirmLabel, onConfirm }

  // Prices and stock are frozen at add time: refresh every line against the
  // catalogue on each visit (and again after login), flagging what can't be bought.
  const [revalidating, setRevalidating] = useState(false);
  const [revalidationNotice, setRevalidationNotice] = useState('');
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      if (useCartStore.getState().items.length === 0) return;
      setRevalidating(true);
      try {
        const { capped, unavailable } = await revalidate();
        if (cancelled) return;
        const notes = [];
        if (unavailable.length) notes.push(`${unavailable.length} ${unavailable.length === 1 ? 'item is' : 'items are'} no longer available`);
        if (capped.length) notes.push(`quantity reduced to available stock for ${capped.join(', ')}`);
        if (capped.length) toast.info(`Quantity reduced to available stock: ${capped.join(', ')}`);
        setRevalidationNotice(notes.length ? `${notes.join('; ')}.` : '');
      } catch {
        // Leave the cart as it was; the checkout re-checks anyway.
      } finally {
        if (!cancelled) setRevalidating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated])); // eslint-disable-line react-hooks/exhaustive-deps

  // "You may also like": products from the cart's categories, then the newest.
  const [suggestions, setSuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  // Refetch only when the set of products changes, not on quantity edits.
  const cartProductKey = [...new Set(items.map((i) => i.productId || i.id))].sort().join(',');
  const cartCategoryKey = [...new Set(items.map((i) => i.categoryId).filter(Boolean))].sort().join(',');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSuggestionsLoading(true);
      try {
        const inCart = new Set(cartProductKey ? cartProductKey.split(',') : []);
        const categoryIds = cartCategoryKey ? cartCategoryKey.split(',').slice(0, 2) : [];
        const requests = [
          ...categoryIds.map((categoryId) => apiClient.get('/products', { params: { categoryId, pageSize: SUGGESTION_COUNT } })),
          // Newest products fill the rest (and cover empty carts).
          apiClient.get('/products', { params: { pageSize: SUGGESTION_COUNT + inCart.size, sortBy: 'createdAt', sortOrder: 'desc' } }),
        ];
        const results = await Promise.allSettled(requests);
        const unique = new Map();
        results
          .filter((r) => r.status === 'fulfilled')
          .flatMap((r) => r.value.data || [])
          .forEach((product) => {
            if (!inCart.has(product.id) && !unique.has(product.id)) unique.set(product.id, product);
          });
        if (!cancelled) setSuggestions([...unique.values()].slice(0, SUGGESTION_COUNT));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [cartProductKey, cartCategoryKey]);

  const itemCount = items.reduce((count, item) => (item.unavailable ? count : count + item.quantity), 0);
  const cartSearch = String(params.cartSearch || '').trim().toLowerCase();
  const visibleItems = useMemo(() => {
    if (!cartSearch) return items;
    return items.filter((item) => [
      item.name,
      item.storeName,
      ...Object.values(item.selectedVariations || {}),
    ].some((value) => String(value || '').toLowerCase().includes(cartSearch)));
  }, [items, cartSearch]);

  // Unavailable lines can never be selected, counted or checked out.
  const purchasableItems = useMemo(() => items.filter((item) => !item.unavailable), [items]);
  const unavailableItems = useMemo(() => items.filter((item) => item.unavailable), [items]);
  const [selectedIds, setSelectedIds] = useState(() => purchasableItems.map((item) => item.id));
  useEffect(() => {
    setSelectedIds((prev) => {
      const known = new Set(prev);
      // Newly added items start selected, so "all checked" stays the default.
      const merged = purchasableItems.map((item) => item.id).filter((id) => known.has(id));
      const additions = purchasableItems.map((item) => item.id).filter((id) => !known.has(id));
      return [...merged, ...additions];
    });
  }, [purchasableItems]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedItems = useMemo(() => purchasableItems.filter((item) => selectedSet.has(item.id)), [purchasableItems, selectedSet]);
  const selectedCount = selectedItems.reduce((count, item) => count + item.quantity, 0);
  const subtotal = selectedItems.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

  // Checkout is one shop at a time, so the fee is that shop's own.
  const selectedStoreIds = [...new Set(selectedItems.map((item) => item.storeId).filter(Boolean))];
  const feeStoreId = selectedStoreIds.length === 1 ? selectedStoreIds[0] : null;
  const [feeStores, setFeeStores] = useState({});
  useEffect(() => {
    if (!feeStoreId || feeStores[feeStoreId] !== undefined) return undefined;
    let cancelled = false;
    apiClient.get(`/stores/${feeStoreId}`)
      .then((res) => { if (!cancelled) setFeeStores((cur) => ({ ...cur, [feeStoreId]: res.data || null })); })
      .catch(() => { if (!cancelled) setFeeStores((cur) => ({ ...cur, [feeStoreId]: null })); });
    return () => { cancelled = true; };
  }, [feeStoreId, feeStores]);
  const feeStore = feeStoreId ? feeStores[feeStoreId] : undefined;
  const pickupOnly = feeStore?.fulfillmentMode === 'PICKUP';

  // Shops can price each town or barangay on its own, so quote the address
  // checkout will start from: the default saved address, else the profile's
  // town and barangay (checkout confirms it for whichever address is chosen).
  const [savedAddress, setSavedAddress] = useState(undefined); // undefined: loading
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;
    apiClient.get('/addresses')
      .then((res) => {
        if (cancelled) return;
        const list = res.data || [];
        setSavedAddress(list.find((a) => a.isDefault) || list[0] || null);
      })
      .catch(() => { if (!cancelled) setSavedAddress(null); });
    return () => { cancelled = true; };
  }, [isAuthenticated]);
  const addressReady = !isAuthenticated || savedAddress !== undefined;
  const quoteTown = savedAddress ? savedAddress.municipalityId : user?.municipalityId;
  const quoteBarangay = savedAddress ? savedAddress.barangay : user?.barangay;
  const [feeQuotes, setFeeQuotes] = useState({});
  const quoteKey = addressReady && feeStoreId && quoteTown ? `${feeStoreId}|${quoteTown}|${quoteBarangay || ''}` : null;
  useEffect(() => {
    if (!quoteKey || feeQuotes[quoteKey] !== undefined) return undefined;
    let cancelled = false;
    const query = { municipalityId: quoteTown, ...(quoteBarangay ? { barangay: quoteBarangay } : {}) };
    apiClient.get(`/stores/${feeStoreId}/coverage`, { params: query })
      .then((res) => { if (!cancelled) setFeeQuotes((cur) => ({ ...cur, [quoteKey]: res.data || null })); })
      .catch(() => { if (!cancelled) setFeeQuotes((cur) => ({ ...cur, [quoteKey]: null })); });
    return () => { cancelled = true; };
  }, [quoteKey, feeQuotes, feeStoreId, quoteTown, quoteBarangay]);
  const quote = quoteKey ? feeQuotes[quoteKey] : null;
  // null: not known yet (nothing selected, several shops, or still loading).
  const shippingFee = subtotal > 0 && feeStore !== undefined
    ? (pickupOnly ? 0 : (quote?.covered && quote.fee != null ? Number(quote.fee) : storeDeliveryFee(feeStore, settings, 'DELIVERY')))
    : null;

  const [voucherInput, setVoucherInput] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState(null);
  const [voucherLoading, setVoucherLoading] = useState(false);
  const applyVoucher = async () => {
    const code = voucherInput.trim();
    if (!code) { toast.error('Enter a voucher code'); return; }
    if (subtotal <= 0) { toast.error('Select items before applying a voucher'); return; }
    setVoucherLoading(true);
    try {
      const res = await apiClient.post('/vouchers/validate', { code, subtotal, storeId: selectedStoreIds.length === 1 ? selectedStoreIds[0] : undefined });
      setAppliedVoucher(res.data);
      toast.success(`Voucher ${res.data.voucher.code} applied`);
    } catch (err) {
      setAppliedVoucher(null);
      toast.error(err?.message || 'Invalid voucher code');
    } finally {
      setVoucherLoading(false);
    }
  };
  const clearVoucher = () => {
    setAppliedVoucher(null);
    setVoucherInput('');
  };
  // Re-validate the voucher when the subtotal changes; drop it if it no longer applies.
  useEffect(() => {
    if (!appliedVoucher) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.post('/vouchers/validate', {
          code: appliedVoucher.voucher.code,
          subtotal,
          storeId: selectedStoreIds.length === 1 ? selectedStoreIds[0] : undefined,
        });
        if (!cancelled) setAppliedVoucher(res.data);
      } catch {
        if (!cancelled) setAppliedVoucher(null);
      }
    })();
    return () => { cancelled = true; };
  }, [subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  const discountAmount = appliedVoucher ? Number(appliedVoucher.discountAmount || 0) : 0;
  const total = Math.max(0, subtotal + (shippingFee || 0) - discountAmount);
  const visiblePurchasable = visibleItems.filter((item) => !item.unavailable);
  const allSelected = visiblePurchasable.length > 0 && visiblePurchasable.every((item) => selectedSet.has(item.id));
  const multiStoreSelected = selectedStoreIds.length > 1;

  const toggleItemSelected = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleStoreSelected = (storeItems) => {
    const ids = storeItems.filter((item) => !item.unavailable).map((item) => item.id);
    if (ids.length === 0) return;
    const allOn = ids.every((id) => selectedSet.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };
  const toggleAllSelected = () => {
    const visibleIds = visiblePurchasable.map((item) => item.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleQuantityChange = (itemId, newQuantity) => {
    if (newQuantity < 1) return;
    try {
      updateQuantity(itemId, newQuantity);
    } catch (error) {
      toast.error(error.message || 'Failed to update quantity');
    }
  };
  const handleRemoveItem = (itemId) => setConfirm({
    title: 'Remove this item from your cart?', confirmLabel: 'Remove', onConfirm: () => removeItem(itemId),
  });
  const handleClearCart = () => setConfirm({
    title: 'Remove everything from your cart?', confirmLabel: 'Remove all', onConfirm: () => clearCart(),
  });

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/checkout');
      return;
    }
    if (selectedItems.length === 0) {
      toast.error('Select at least one item to checkout');
      return;
    }
    if (new Set(selectedItems.map((item) => item.storeId).filter(Boolean)).size > 1) {
      toast.error('Checkout is limited to one store per order. Select items from one store only.');
      return;
    }
    // Available Today items are made or picked for a set time: they check out
    // on their own (the order is ready in their window).
    const todayCount = selectedItems.filter((item) => item.listingKind === 'TODAY').length;
    if (todayCount && todayCount !== selectedItems.length) {
      toast.error('Available Today items check out on their own. Select only those, or only the others.');
      return;
    }
    if (!(await requireVerifiedIdentity())) return;
    router.push({
      pathname: '/checkout',
      params: {
        selectedIds: JSON.stringify(selectedIds),
        ...(appliedVoucher?.voucher?.code ? { voucherCode: appliedVoucher.voucher.code } : {}),
      },
    });
  };

  // Each shop name links to its page; look the slugs up once.
  const cartStoreIds = [...new Set(items.map((item) => item.storeId).filter(Boolean))].sort().join(',');
  useEffect(() => {
    if (!cartStoreIds) return undefined;
    let cancelled = false;
    const missing = cartStoreIds.split(',').filter((id) => !storeSlugs[id]);
    if (missing.length === 0) return undefined;
    Promise.all(missing.map((id) => apiClient.get(`/stores/${id}`).then((res) => [id, res.data?.slug]).catch(() => [id, null])))
      .then((pairs) => {
        if (cancelled) return;
        setStoreSlugs((cur) => ({ ...cur, ...Object.fromEntries(pairs.filter(([, slug]) => slug)) }));
      });
    return () => { cancelled = true; };
  }, [cartStoreIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => Object.values(visibleItems.reduce((acc, item) => {
    const storeId = item.storeId || 'unknown';
    if (!acc[storeId]) acc[storeId] = { storeId, storeName: item.storeName || 'Unknown Store', items: [] };
    acc[storeId].items.push(item);
    return acc;
  }, {})), [visibleItems]);

  // The field keeps its own text so fast typing never waits on the route.
  const setCartSearch = (value) => {
    setCartSearchText(value);
    router.setParams({ cartSearch: value.trim() ? value : undefined });
  };

  const menuItems = [
    { key: 'shop', Icon: StorefrontIcon, label: 'Continue shopping', to: '/products' },
    { key: 'wish', Icon: HeartIcon, label: 'My wishlist', to: '/wishlist' },
    items.length > 0 && { key: 'clear', Icon: TrashIcon, label: 'Clear cart', danger: true, onPress: handleClearCart },
  ].filter(Boolean);

  // The title bar stays at the top while the cart scrolls; the search field
  // under it scrolls away with the items.
  const head = (
    <View style={styles.head}>
      <View style={styles.titleRow}>
        <Text style={styles.title} accessibilityRole="header">Cart</Text>
        {itemCount > 0 ? <View style={styles.count}><Text style={styles.countText}>{itemCount}</Text></View> : null}
      </View>
      <ShellPageMenu items={menuItems} label="Cart options" />
    </View>
  );

  const confirmDialog = (
    <CartConfirmDialog
      open={Boolean(confirm)}
      danger
      title={confirm?.title || ''}
      confirmLabel={confirm?.confirmLabel}
      onConfirm={() => { const run = confirm?.onConfirm; setConfirm(null); run?.(); }}
      onCancel={() => setConfirm(null)}
    />
  );

  // Signed out: the website's phone cart is behind ProtectedRoute gate="cart",
  // which shows a Log in page in its place (the tab bar stays).
  if (!isAuthenticated) return <CartLoginGate />;

  if (items.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={styles.emptyContent}>
          <View style={styles.topGap} />
          {head}
          <EmptyState
            flat
            art="cart"
            title="Your cart is empty"
            text="Items you add from products and shops will show up here."
            actions={[{ label: 'Browse products', onPress: () => router.push('/products'), icon: ShoppingBagIcon }]}
            style={styles.emptyCard}
          />
          <View style={styles.gutter}>
            <CartSuggestions suggestions={suggestions} loading={suggestionsLoading} />
          </View>
        </ScrollView>
        {confirmDialog}
      </View>
    );
  }

  const checkoutDisabled = revalidating || selectedItems.length === 0 || multiStoreSelected
    || selectedItems.some((item) => item.unavailable || item.stock === 0);
  let barNote = null;
  if (multiStoreSelected) barNote = 'Check out one shop at a time — deselect items from the other shops.';
  else if (unavailableItems.length > 0) barNote = `${unavailableItems.length === 1 ? 'One item is' : `${unavailableItems.length} items are`} unavailable and won't be checked out.`;
  let feeLabel = 'Select items';
  if (selectedCount > 0) {
    if (shippingFee === null) feeLabel = 'Delivery fee at checkout';
    else feeLabel = pickupOnly ? 'Pickup only' : `Delivery fee: ${fixed2(shippingFee)}`;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView stickyHeaderIndices={[1]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topGap} />
        {head}
        <View style={styles.search}>
          <MagnifyingGlassIcon size={16} color={t.neutral[500]} />
          <TextInput
            value={cartSearchText}
            onChangeText={setCartSearch}
            placeholder="Search in cart"
            placeholderTextColor={t.neutral[400]}
            accessibilityLabel="Search in cart"
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.list}>
          {revalidating || revalidationNotice ? (
            <View style={[styles.notice, revalidationNotice && styles.noticeWarn]} accessibilityRole="alert">
              <WarningCircleIcon size={16} color={revalidationNotice ? t.warning[700] : t.neutral[600]} />
              <Text style={[styles.noticeText, revalidationNotice && styles.noticeTextWarn]}>
                {revalidating ? 'Checking current prices and stock…' : revalidationNotice}
              </Text>
            </View>
          ) : null}
          {cartSearch && visibleItems.length === 0 ? (
            <View style={styles.searchEmpty}>
              <EmptyArt name="search" size={84} />
              <Text style={styles.searchEmptyTitle}>No cart items found</Text>
              <Text style={styles.searchEmptyText}>Try another product or store name.</Text>
            </View>
          ) : null}
          {groups.map((group) => (
            <CartStoreGroup
              key={group.storeId}
              group={group}
              slug={storeSlugs[group.storeId]}
              selectedSet={selectedSet}
              onToggleStore={toggleStoreSelected}
              onToggleItem={toggleItemSelected}
              onQuantity={handleQuantityChange}
              onRemove={handleRemoveItem}
              onRemoveNow={removeItem}
            />
          ))}
        </View>

        <View style={styles.gutter}>
          <CartVoucherCard
            value={voucherInput}
            onChangeText={setVoucherInput}
            applied={Boolean(appliedVoucher)}
            loading={voucherLoading}
            canApply={!voucherLoading && Boolean(voucherInput.trim()) && subtotal !== 0}
            onApply={applyVoucher}
            onRemove={clearVoucher}
            appliedNote={appliedVoucher ? (appliedVoucher.voucher.description || `Discount of ${fixed2(discountAmount)} applied.`) : ''}
          />
          <CartSuggestions suggestions={suggestions} loading={suggestionsLoading} style={styles.suggestions} />
        </View>
      </ScrollView>

      <CartBar
        note={barNote}
        noteBad={multiStoreSelected}
        allSelected={allSelected}
        onToggleAll={toggleAllSelected}
        totalLabel={cartPeso(total)}
        feeLabel={feeLabel}
        offLabel={discountAmount > 0 ? `${fixed2(discountAmount)} off` : ''}
        checkoutLabel={`Check out${selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}`}
        disabled={checkoutDisabled}
        onCheckout={handleCheckout}
      />
      {confirmDialog}
      {identityDialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { paddingBottom: 24 },
  emptyContent: { paddingBottom: 24 },
  topGap: { height: 10, backgroundColor: t.neutral[0] },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 49,
    paddingHorizontal: 12,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: t.neutral[200],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 22, lineHeight: 25.3, ...font(500), color: t.neutral[900] },
  count: { minWidth: 22, paddingVertical: 1, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.primary[50] },
  countText: { fontSize: 12, lineHeight: 13.8, ...font(500), color: t.primary[700], textAlign: 'center' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    marginTop: 10,
    marginHorizontal: 12,
    marginBottom: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: t.neutral[100],
  },
  searchInput: {
    flex: 1, minWidth: 0, height: '100%', padding: 0, fontSize: 16, ...font(400), color: t.neutral[900], outlineStyle: 'none',
  },
  list: { gap: 8 },
  // The website's notice keeps its own 10.5px margin on top of the list gap.
  notice: {
    marginBottom: 10.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: t.neutral[200],
    backgroundColor: t.neutral[50],
  },
  noticeWarn: { borderColor: t.warning[200], backgroundColor: t.warning[50] },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[600] },
  noticeTextWarn: { color: t.warning[700] },
  searchEmpty: {
    alignItems: 'center',
    gap: 7,
    paddingVertical: 32,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  searchEmptyTitle: { marginTop: 5, fontSize: 18, lineHeight: 28.8, ...font(500), color: t.neutral[900], textAlign: 'center' },
  searchEmptyText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500], textAlign: 'center' },
  gutter: { paddingHorizontal: 12 },
  suggestions: { marginTop: 8 },
  // The website's empty card ends in an 8px grey rule before the suggestions.
  emptyCard: { borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
});
