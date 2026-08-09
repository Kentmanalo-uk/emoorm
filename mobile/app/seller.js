import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, FlatList, Image, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BarChart3, Bell, ChevronRight, Edit3, MessageCircle, Package, Plus, ShoppingBag,
  Settings, Star, Store, Trash2, TrendingUp, Upload, UserRound, Wallet, X,
} from 'lucide-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import SellerMessages from '../src/components/SellerMessages';
import SellerNotifications from '../src/components/SellerNotifications';
import RoleSwitchOverlay from '../src/components/RoleSwitchOverlay';
import TextField from '../src/components/TextField';
import Select from '../src/components/Select';
import StatusBadge from '../src/components/StatusBadge';
import StarRating from '../src/components/StarRating';
import EmptyState from '../src/components/EmptyState';
import LoadingSkeleton from '../src/components/LoadingSkeleton';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import useAuthStore from '../src/store/authStore';
import { resolveImg } from '../src/lib/media';
import { uploadImage } from '../src/lib/upload';
import { toast } from '../src/lib/toast';
import { getCacheEntry, getCachedData, invalidateCachedData, refreshCachedData, setCachedData } from '../src/lib/dataCache';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

const TABS = [
  { key: 'overview', label: 'Overview', Icon: TrendingUp },
  { key: 'orders', label: 'Orders', Icon: ShoppingBag },
  { key: 'products', label: 'Products', Icon: Package },
  { key: 'insights', label: 'Insights', Icon: BarChart3 },
  { key: 'store', label: 'Store', Icon: Store },
];
const EMPTY_PRODUCT = { name: '', description: '', price: '', stock: '', categoryId: '', images: [] };
const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const imageOf = (product) => Array.isArray(product?.images) ? product.images[0] : null;
const orderImageOf = (item) => resolveImg(imageOf(item?.product));

const DELIVERY_FLOW = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['TO_SHIP', 'PREPARING', 'CANCELLED'],
  PREPARING: ['TO_SHIP', 'READY', 'CANCELLED'], TO_SHIP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'], DELIVERED: ['COMPLETED'], READY: ['COMPLETED', 'CANCELLED'],
};
const PICKUP_FLOW = {
  PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['READY_FOR_PICKUP', 'PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'READY', 'CANCELLED'], READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['COMPLETED'], READY: ['COMPLETED', 'CANCELLED'],
};
const STATUS_ACTION = {
  CONFIRMED: 'Confirm', PREPARING: 'Start preparing', TO_SHIP: 'Ready to ship', OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Mark delivered', READY: 'Mark ready', READY_FOR_PICKUP: 'Ready for pickup', PICKED_UP: 'Mark picked up', COMPLETED: 'Complete', CANCELLED: 'Cancel',
};
const ORDER_FILTERS = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'new', label: 'New', statuses: ['PENDING'] },
  { key: 'processing', label: 'Processing', statuses: ['CONFIRMED', 'PREPARING', 'TO_SHIP', 'OUT_FOR_DELIVERY'] },
  { key: 'ready', label: 'Ready', statuses: ['READY', 'READY_FOR_PICKUP'] },
  { key: 'completed', label: 'Completed', statuses: ['DELIVERED', 'PICKED_UP', 'COMPLETED'] },
  { key: 'cancelled', label: 'Cancelled', statuses: ['CANCELLED'] },
];
const SELLER_HEADERS = {
  overview: 'Seller Center',
  orders: 'Orders',
  products: 'Products',
  notifications: 'Notifications',
  messages: 'Store Messages',
  insights: 'Insights',
  store: 'Store Profile',
};
const SELLER_CACHE_TTL = 2 * 60 * 1000;
const SELLER_CACHE = {
  overview: 'seller:overview',
  orders: 'seller:orders',
  products: 'seller:products',
  store: 'seller:store-profile-v2',
  insights: 'seller:insights',
};

export default function SellerCenter() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState('overview');
  const [orderCount, setOrderCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);
  const headerTitle = SELLER_HEADERS[tab] || SELLER_HEADERS.overview;
  const isSeller = user?.role === 'SELLER';
  const refreshBadges = useCallback(async () => {
    if (!isSeller) return;
    try {
      const [pendingOrders, conversations, notifications] = await Promise.all([
        apiClient.get(ENDPOINTS.ORDERS.STORE_ORDERS, { params: { status: 'PENDING', pageSize: 1 } }),
        apiClient.get(ENDPOINTS.MESSAGES.CONVERSATIONS),
        apiClient.get(ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT),
      ]);
      setOrderCount(Number(pendingOrders?.pagination?.total || 0));
      setMessageCount((conversations.data || [])
        .filter((item) => item.role === 'seller')
        .reduce((total, item) => total + Number(item.unreadCount || 0), 0));
      setNotificationCount(Number(notifications.data?.count || 0));
    } catch { /* best-effort */ }
  }, [isSeller]);
  useEffect(() => {
    refreshBadges();
    const interval = setInterval(refreshBadges, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshBadges();
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [refreshBadges]);
  if (!isSeller) return <View style={styles.screen}><ScreenHeader title="Seller Center" /><View style={styles.guard}><Store size={48} color={colors.gray400} /><Text style={styles.guardTitle}>Seller access required</Text><Text style={styles.guardText}>Complete seller verification before opening Seller Center.</Text><Pressable accessibilityRole="button" accessibilityLabel="Apply to sell" style={styles.primaryButton} onPress={() => router.replace('/seller-apply')}><Text style={styles.primaryText}>Apply to sell</Text></Pressable></View></View>;
  return <View style={styles.screen}>
    <View style={[styles.sellerHeader, { paddingTop: insets.top, minHeight: 62 + insets.top }]}>
      <Text style={styles.headerTitle}>{headerTitle}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Seller Notifications" accessibilityState={{ selected: tab === 'notifications' }} style={styles.headerAction} onPress={() => setTab('notifications')}><View style={styles.navIconWrap}><Bell size={21} strokeWidth={1.6} fill={tab === 'notifications' ? colors.primary : 'none'} color={tab === 'notifications' ? colors.primary : colors.secondary} /><NavBadge count={notificationCount} compact /></View></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Store Messages" accessibilityState={{ selected: tab === 'messages' }} style={styles.headerAction} onPress={() => setTab('messages')}><View style={styles.navIconWrap}><MessageCircle size={21} strokeWidth={1.6} fill={tab === 'messages' ? colors.primary : 'none'} color={tab === 'messages' ? colors.primary : colors.secondary} /><NavBadge count={messageCount} compact /></View></Pressable>
    </View>
    <View style={styles.workspace}>
      {tab === 'overview' && <Overview onNavigate={setTab} />}
      {tab === 'orders' && <SellerOrders />}
      {tab === 'products' && <SellerProducts />}
      {tab === 'notifications' && <SellerNotifications onNavigate={setTab} />}
      {tab === 'messages' && <SellerMessages />}
      {tab === 'store' && <StoreSettings />}
      {tab === 'insights' && <Insights />}
    </View>
    <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, spacing.sm), minHeight: 58 + Math.max(insets.bottom, spacing.sm) }]}>{TABS.map(({ key, label, Icon }) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: tab === key }} key={key} style={styles.navItem} onPress={() => setTab(key)}><View style={styles.navIconWrap}><Icon size={25} strokeWidth={1.6} fill={tab === key ? colors.primary : 'none'} color={tab === key ? colors.primary : colors.textSecondary} />{key === 'orders' ? <NavBadge count={orderCount} /> : null}</View><Text style={[styles.navLabel, tab === key && styles.navLabelActive]} numberOfLines={1}>{label}</Text></Pressable>)}</View>
  </View>;
}

function NavBadge({ count, compact }) {
  if (!count) return null;
  return <View style={[styles.navBadge, compact && styles.navBadgeCompact]}><Text style={styles.navBadgeText} numberOfLines={1}>{count > 99 ? '99+' : count}</Text></View>;
}

function Overview({ onNavigate }) {
  const initialData = getCacheEntry(SELLER_CACHE.overview)?.data;
  const [data, setData] = useState(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (refresh = false) => { if (!refresh) { const fresh = getCachedData(SELLER_CACHE.overview, SELLER_CACHE_TTL); if (fresh) { setData(fresh); setLoading(false); return; } } refresh ? setRefreshing(true) : setLoading(!getCacheEntry(SELLER_CACHE.overview)); try { const next = await refreshCachedData(SELLER_CACHE.overview, async () => (await apiClient.get(ENDPOINTS.SELLER.ANALYTICS)).data); setData(next); } catch (error) { toast.error('Failed to load seller overview', error.message); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { load(); }, [load]);
  if (loading) return <SellerOverviewSkeleton />;
  const kpis = data?.kpis || {};
  return <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />}>
    <View style={styles.hero}><Text style={styles.heroEyebrow}>THIS PERIOD</Text><Text style={styles.heroValue}>{peso(kpis.revenue?.value)}</Text><Text style={styles.heroMeta}>{kpis.orders?.value || 0} completed orders · {kpis.buyers?.value || 0} buyers</Text></View>
    <View style={styles.kpiGrid}><Kpi label="Average order" value={peso(kpis.avgOrderValue?.value)} /><Kpi label="Completion" value={`${kpis.completionRate?.value || 0}%`} /><Kpi label="Active products" value={kpis.activeProducts?.value || 0} /><Kpi label="Lifetime revenue" value={peso(kpis.lifetimeRevenue?.value)} /></View>
    {data?.lowStock?.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Low Stock</Text>{data.lowStock.slice(0, 5).map((product) => <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}, ${product.stock} remaining`} key={product.id} style={styles.row} onPress={() => onNavigate('products')}><Package size={18} color={colors.warning} /><View style={styles.rowBody}><Text style={styles.rowTitle}>{product.name}</Text><Text style={styles.rowMeta}>{product.stock} remaining</Text></View><ChevronRight size={17} color={colors.textMuted} /></Pressable>)}</View> : null}
    <View style={styles.quickGrid}><QuickAction Icon={ShoppingBag} label="Process orders" onPress={() => onNavigate('orders')} /><QuickAction Icon={Plus} label="Add product" onPress={() => onNavigate('products')} /><QuickAction Icon={Store} label="Edit storefront" onPress={() => onNavigate('store')} /><QuickAction Icon={BarChart3} label="View insights" onPress={() => onNavigate('insights')} /></View>
  </ScrollView>;
}

function SellerOrders() {
  const initialOrders = getCacheEntry(SELLER_CACHE.orders)?.data;
  const [orders, setOrders] = useState(initialOrders || []);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(!initialOrders);
  const [refreshing, setRefreshing] = useState(false);
  const [updating, setUpdating] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const load = useCallback(async (refresh = false) => { if (!refresh) { const fresh = getCachedData(SELLER_CACHE.orders, SELLER_CACHE_TTL); if (fresh) { setOrders(fresh); setLoading(false); return; } } refresh ? setRefreshing(true) : setLoading(!getCacheEntry(SELLER_CACHE.orders)); try { const next = await refreshCachedData(SELLER_CACHE.orders, async () => (await apiClient.get(ENDPOINTS.ORDERS.STORE_ORDERS, { params: { pageSize: 100 } })).data || []); setOrders(next); } catch (error) { toast.error('Failed to load store orders', error.message); } finally { setLoading(false); setRefreshing(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const updateStatus = async (order, status) => {
    setUpdating(order.id);
    try { await apiClient.put(ENDPOINTS.ORDERS.UPDATE_STATUS(order.id), { status }); invalidateCachedData('products:'); invalidateCachedData('home:'); setOrders((current) => { const next = current.map((item) => item.id === order.id ? { ...item, status } : item); setCachedData(SELLER_CACHE.orders, next); return next; }); toast.success(`Order updated to ${STATUS_ACTION[status] || status}`); }
    catch (error) { toast.error('Could not update order', error.message); }
    finally { setUpdating(''); }
  };
  const activeFilter = ORDER_FILTERS.find((item) => item.key === filter) || ORDER_FILTERS[0];
  const filteredOrders = useMemo(() => activeFilter.statuses ? orders.filter((order) => activeFilter.statuses.includes(order.status)) : orders, [activeFilter, orders]);
  const countForFilter = (item) => item.statuses ? orders.filter((order) => item.statuses.includes(order.status)).length : orders.length;
  if (loading) return <SellerListSkeleton variant="orders" />;
  return <><FlatList data={filteredOrders} keyExtractor={(item) => item.id} contentContainerStyle={filteredOrders.length ? styles.content : styles.empty} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[colors.primary]} />} ListHeaderComponent={<View style={styles.orderFilters}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>{ORDER_FILTERS.map((item) => { const selected = item.key === filter; return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${item.label} orders, ${countForFilter(item)}`} key={item.key} style={[styles.filterChip, selected && styles.filterChipActive]} onPress={() => setFilter(item.key)}><Text style={[styles.filterText, selected && styles.filterTextActive]}>{item.label}</Text></Pressable>; })}</ScrollView></View>} ListEmptyComponent={<EmptyState icon={<ShoppingBag size={44} color={colors.gray400} />} title={filter === 'all' ? 'No store orders' : `No ${activeFilter.label.toLowerCase()} orders`} message={filter === 'all' ? 'New buyer orders will appear here.' : 'Try another order status.'} />} renderItem={({ item }) => {
    const next = (item.fulfillmentMethod === 'PICKUP' ? PICKUP_FLOW : DELIVERY_FLOW)[item.status] || [];
    return <View style={styles.orderCard}><Pressable accessibilityRole="button" accessibilityLabel={`View order ${item.orderNumber} details`} accessibilityHint="Shows buyer, fulfillment, payment, items, and totals" style={styles.orderCardDetails} onPress={() => setSelectedOrder(item)}><View style={styles.cardHeader}><View><Text style={styles.orderNumber}>{item.orderNumber}</Text><Text style={styles.rowMeta}>{item.buyer?.fullName || 'Buyer'} · {item.fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Delivery'}</Text></View><StatusBadge status={item.status} /></View><View style={styles.orderItems}>{item.items?.slice(0, 3).map((orderItem) => <View key={orderItem.id} style={styles.compactItem}>{orderImageOf(orderItem) ? <Image source={{ uri: orderImageOf(orderItem) }} style={styles.orderItemImage} /> : <View style={[styles.orderItemImage, styles.imageFallback]}><Package size={16} color={colors.gray400} /></View>}<View style={styles.compactBody}><Text style={styles.compactName} numberOfLines={1}>{orderItem.productName || orderItem.product?.name}</Text><Text style={styles.compactMeta}>{orderItem.quantity} × {peso(orderItem.price)}</Text></View></View>)}</View><View style={styles.orderTotal}><Text style={styles.rowMeta}>{item.contactNumber || 'No contact number'}</Text><Text style={styles.totalText}>{peso(item.total)}</Text></View></Pressable>{next.length ? <View style={styles.actionWrap}>{next.map((status) => <Pressable accessibilityRole="button" accessibilityLabel={`${STATUS_ACTION[status] || status} order ${item.orderNumber}`} key={status} disabled={updating === item.id} style={[styles.statusAction, status === 'CANCELLED' && styles.cancelAction]} onPress={() => status === 'CANCELLED' ? Alert.alert('Cancel order?', 'Stock will be restored.', [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel order', style: 'destructive', onPress: () => updateStatus(item, status) }]) : updateStatus(item, status)}><Text style={[styles.statusActionText, status === 'CANCELLED' && styles.cancelActionText]}>{STATUS_ACTION[status] || status}</Text></Pressable>)}</View> : null}</View>;
  }} /><SellerOrderDetails order={selectedOrder} onClose={() => setSelectedOrder(null)} /></>;
}

function SellerOrderDetails({ order, onClose }) {
  if (!order) return null;
  const subtotal = order.subtotal ?? order.items?.reduce((sum, item) => sum + Number(item.subtotal || Number(item.price) * item.quantity), 0);
  return <Modal visible transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><View style={styles.formSheet} accessibilityViewIsModal><View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Order Details</Text><Text style={styles.rowMeta}>{order.orderNumber}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close order details" style={styles.editClose} onPress={onClose}><X size={20} color={colors.textPrimary} /></Pressable></View><ScrollView contentContainerStyle={styles.orderDetailContent}><View style={styles.detailTop}><StatusBadge status={order.status} />{order.createdAt ? <Text style={styles.rowMeta}>{new Date(order.createdAt).toLocaleString('en-PH')}</Text> : null}</View><View style={styles.detailSection}><Text style={styles.sectionTitle}>Customer</Text><DetailRow label="Buyer" value={order.buyer?.fullName || 'Buyer'} /><DetailRow label="Contact" value={order.contactNumber || 'Not provided'} /></View><View style={styles.detailSection}><Text style={styles.sectionTitle}>Fulfillment</Text><DetailRow label="Method" value={order.fulfillmentMethod === 'PICKUP' ? 'Store pickup' : 'Delivery'} /><DetailRow label={order.fulfillmentMethod === 'PICKUP' ? 'Pickup location' : 'Delivery address'} value={order.pickupLocation || order.deliveryAddress || 'Not provided'} /></View><View style={styles.detailSection}><Text style={styles.sectionTitle}>Payment</Text><DetailRow label="Method" value={order.paymentMethod || 'Cash on delivery'} />{order.paymentReference ? <DetailRow label="Reference" value={order.paymentReference} /> : null}{order.paymentProofUrl ? <Image source={{ uri: resolveImg(order.paymentProofUrl) }} style={styles.paymentProof} resizeMode="contain" /> : null}</View><View style={styles.detailSection}><Text style={styles.sectionTitle}>Items</Text>{order.items?.map((item) => <View key={item.id || item.productId} style={styles.detailItem}>{orderImageOf(item) ? <Image source={{ uri: orderImageOf(item) }} style={styles.detailItemImage} /> : <View style={[styles.detailItemImage, styles.imageFallback]}><Package size={17} color={colors.gray400} /></View>}<View style={styles.rowBody}><Text style={styles.rowTitle}>{item.productName || item.product?.name || 'Product'}</Text><Text style={styles.rowMeta}>Qty {item.quantity} × {peso(item.price)}</Text></View><Text style={styles.totalText}>{peso(item.subtotal || Number(item.price) * item.quantity)}</Text></View>)}</View><View style={styles.detailSection}><DetailRow label="Subtotal" value={peso(subtotal)} /><DetailRow label="Delivery fee" value={Number(order.deliveryFee) ? peso(order.deliveryFee) : 'FREE'} /><View style={styles.grandTotal}><Text style={styles.sectionTitle}>Total</Text><Text style={styles.grandTotalValue}>{peso(order.total)}</Text></View></View></ScrollView></View></View></Modal>;
}

function DetailRow({ label, value }) { return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{String(value)}</Text></View>; }

function SellerProducts() {
  const initialData = getCacheEntry(SELLER_CACHE.products)?.data;
  const [products, setProducts] = useState(initialData?.products || []);
  const [categories, setCategories] = useState(initialData?.categories || []);
  const [loading, setLoading] = useState(!initialData);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const load = useCallback(async (force = false) => { if (!force) { const fresh = getCachedData(SELLER_CACHE.products, SELLER_CACHE_TTL); if (fresh) { setProducts(fresh.products); setCategories(fresh.categories); setLoading(false); return; } } setLoading(!getCacheEntry(SELLER_CACHE.products)); try { const data = await refreshCachedData(SELLER_CACHE.products, async () => { const [productResponse, categoryResponse] = await Promise.all([apiClient.get(ENDPOINTS.MY_PRODUCTS, { params: { pageSize: 100 } }), apiClient.get(ENDPOINTS.CATEGORIES)]); return { products: productResponse.data || [], categories: categoryResponse.data || [] }; }); setProducts(data.products); setCategories(data.categories); } catch (error) { toast.error('Failed to load inventory', error.message); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const openForm = (product) => { setEditingId(product?.id || null); setForm(product ? { name: product.name || '', description: product.description || '', price: String(product.price || ''), stock: String(product.stock ?? ''), categoryId: product.categoryId || product.category?.id || '', images: product.images || [] } : EMPTY_PRODUCT); setFormOpen(true); };
  const chooseImage = async () => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return toast.error('Photo permission is required'); const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }); if (result.canceled) return; setUploading(true); try { const uploaded = await uploadImage(result.assets[0]); setForm((current) => ({ ...current, images: [...current.images, uploaded.url].slice(0, 10) })); } catch (error) { toast.error('Upload failed', error.message); } finally { setUploading(false); } };
  const save = async () => { if (!form.name.trim() || !form.categoryId || Number(form.price) <= 0 || Number(form.stock) < 0) return toast.error('Complete valid name, category, price, and stock'); setSaving(true); try { const payload = { ...form, name: form.name.trim(), price: Number(form.price), stock: Number(form.stock || 0), images: form.images.filter(Boolean) }; editingId ? await apiClient.put(ENDPOINTS.PRODUCT_BY_ID(editingId), payload) : await apiClient.post(ENDPOINTS.PRODUCTS, payload); invalidateCachedData('products:'); invalidateCachedData('home:'); setFormOpen(false); toast.success(editingId ? 'Product updated' : 'Product submitted for approval'); load(true); } catch (error) { toast.error('Could not save product', error.message); } finally { setSaving(false); } };
  const remove = (product) => Alert.alert('Delete product?', product.name, [{ text: 'Keep', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { try { await apiClient.delete(ENDPOINTS.PRODUCT_BY_ID(product.id)); invalidateCachedData('products:'); invalidateCachedData('home:'); setProducts((current) => { const next = current.filter((item) => item.id !== product.id); setCachedData(SELLER_CACHE.products, { products: next, categories }); return next; }); } catch (error) { toast.error('Could not delete product', error.message); } } }]);
  if (loading) return <SellerListSkeleton variant="products" />;
  return <View style={styles.flex}><FlatList data={products} keyExtractor={(item) => item.id} contentContainerStyle={products.length ? styles.content : styles.empty} ListHeaderComponent={<View style={styles.listHeading}><View><Text style={styles.listTitle}>Inventory</Text><Text style={styles.rowMeta}>{products.length} products</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Add product" style={styles.addButton} onPress={() => openForm()}><Plus size={17} color={colors.white} /><Text style={styles.addText}>Add</Text></Pressable></View>} ListEmptyComponent={<EmptyState icon={<Package size={44} color={colors.gray400} />} title="No products yet" message="Create your first product listing." actionLabel="Add product" onAction={() => openForm()} />} renderItem={({ item }) => <View style={styles.productCard}>{imageOf(item) ? <Image source={{ uri: resolveImg(imageOf(item)) }} style={styles.productImage} /> : <View style={[styles.productImage, styles.imageFallback]}><Package size={21} color={colors.gray400} /></View>}<View style={styles.productBody}><Text style={styles.rowTitle} numberOfLines={2}>{item.name}</Text><Text style={styles.productPrice}>{peso(item.price)}</Text><Text style={[styles.stock, item.stock < 5 && styles.lowStock]}>{item.stock} in stock · {item.status}</Text></View><View style={styles.productActions}><Pressable accessibilityRole="button" accessibilityLabel={`Edit ${item.name}`} style={styles.iconButton} onPress={() => openForm(item)}><Edit3 size={17} color={colors.secondary} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${item.name}`} style={styles.iconButton} onPress={() => remove(item)}><Trash2 size={17} color={colors.error} /></Pressable></View></View>} />
    <Modal visible={formOpen} transparent animationType="slide" onRequestClose={() => setFormOpen(false)}><View style={styles.modalBackdrop}><View style={styles.formSheet}><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{editingId ? 'Edit Product' : 'New Product'}</Text><Pressable onPress={() => setFormOpen(false)}><X size={21} color={colors.textPrimary} /></Pressable></View><ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled"><TextField label="Product name" value={form.name} onChangeText={(value) => setForm((current) => ({ ...current, name: value }))} autoCapitalize="words" /><Select label="Category" value={form.categoryId} onChange={(value) => setForm((current) => ({ ...current, categoryId: value }))} options={categories.map((category) => ({ label: category.name, value: category.id }))} /><TextField label="Description" value={form.description} onChangeText={(value) => setForm((current) => ({ ...current, description: value }))} autoCapitalize="sentences" multiline /><View style={styles.fieldRow}><View style={styles.fieldHalf}><TextField label="Price" value={form.price} onChangeText={(value) => setForm((current) => ({ ...current, price: value }))} keyboardType="decimal-pad" /></View><View style={styles.fieldHalf}><TextField label="Stock" value={form.stock} onChangeText={(value) => setForm((current) => ({ ...current, stock: value }))} keyboardType="number-pad" /></View></View><ScrollView horizontal contentContainerStyle={styles.imageList}>{form.images.map((image, index) => <Pressable key={`${image}-${index}`} onPress={() => setForm((current) => ({ ...current, images: current.images.filter((_, imageIndex) => imageIndex !== index) }))}><Image source={{ uri: resolveImg(image) }} style={styles.formImage} /><View style={styles.imageRemove}><X size={12} color={colors.white} /></View></Pressable>)}<Pressable style={styles.uploadButton} onPress={chooseImage}>{uploading ? <ActivityIndicator color={colors.primary} /> : <Upload size={22} color={colors.secondary} />}</Pressable></ScrollView><Pressable style={styles.primaryButton} disabled={saving} onPress={save}>{saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>{editingId ? 'Save changes' : 'Create product'}</Text>}</Pressable></ScrollView></View></View></Modal>
  </View>;
}

function storeForm(store) { return { name: store.name || '', description: store.description || '', address: store.address || '', contactNumber: store.contactNumber || '', businessHours: store.businessHours || '', fulfillmentMode: store.fulfillmentMode || 'DELIVERY', pickupAddress: store.pickupAddress || '', acceptsCod: store.acceptsCod !== false, paymentQrType: store.paymentQrType || 'GCASH', paymentQrImage: store.paymentQrImage || '', logo: store.logo || '', coverImage: store.bannerImage || store.coverImage || '' }; }

function StoreSettings() {
  const router = useRouter();
  const initialData = getCacheEntry(SELLER_CACHE.store)?.data;
  const initialStore = initialData?.store;
  const [store, setStore] = useState(initialStore || null);
  const [form, setForm] = useState(initialStore ? storeForm(initialStore) : null);
  const [metrics, setMetrics] = useState(initialData?.metrics || { rating: 0, reviews: 0, unitsSold: 0, followers: 0, products: 0, completedOrders: 0, followerGrowth: 0 });
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(!initialStore);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [switching, setSwitching] = useState(false);
  const switchToBuyer = () => { setSwitching(true); setTimeout(() => { router.replace('/profile'); setSwitching(false); }, 650); };
  useEffect(() => { const fresh = getCachedData(SELLER_CACHE.store, SELLER_CACHE_TTL); if (fresh) { setStore(fresh.store); setForm(storeForm(fresh.store)); setMetrics(fresh.metrics); setLoading(false); return; } refreshCachedData(SELLER_CACHE.store, async () => { const storeResponse = await apiClient.get(ENDPOINTS.SELLER.MY_STORE); const currentStore = storeResponse.data; const [storefrontResponse, followerResponse, analyticsResponse] = await Promise.all([apiClient.get(ENDPOINTS.STORES.STOREFRONT(currentStore.slug)).catch(() => ({ data: {} })), apiClient.get(ENDPOINTS.FOLLOWS.SELLER_STATS(currentStore.id)).catch(() => ({ data: {} })), apiClient.get(ENDPOINTS.SELLER.ANALYTICS).catch(() => ({ data: {} }))]); const storefront = storefrontResponse.data || {}; const followers = followerResponse.data || {}; const analytics = analyticsResponse.data || {}; return { store: currentStore, metrics: { rating: Number(storefront.stats?.averageRating || 0), reviews: storefront.stats?.reviewCount || 0, unitsSold: analytics.kpis?.unitsSold?.value || 0, followers: followers.total ?? storefront.followerCount ?? 0, products: storefront.stats?.productCount || analytics.kpis?.totalProducts?.value || 0, completedOrders: analytics.kpis?.orders?.value || 0, followerGrowth: followers.growthPct || 0 } }; }).then((data) => { setStore(data.store); setForm(storeForm(data.store)); setMetrics(data.metrics); }).catch((error) => toast.error('Failed to load store', error.message)).finally(() => setLoading(false)); }, []);
  if (loading || !form) return <SellerStoreSkeleton />;
  const setField = (name, value) => setForm((current) => ({ ...current, [name]: value }));
  const chooseImage = async (field) => { const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(); if (!permission.granted) return; const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 }); if (result.canceled) return; setUploading(field); try { const uploaded = await uploadImage(result.assets[0]); setField(field, uploaded.url); } catch (error) { toast.error('Upload failed', error.message); } finally { setUploading(''); } };
  const save = async () => { if (!form.name.trim()) return toast.error('Store name is required'); setSaving(true); try { const response = await apiClient.put(ENDPOINTS.STORES.BY_ID(store.id), { ...form, bannerImage: form.coverImage }); setStore(response.data); setForm(storeForm(response.data)); setCachedData(SELLER_CACHE.store, { store: response.data, metrics }); setEditing(false); toast.success('Store settings saved'); } catch (error) { toast.error('Could not save store', error.message); } finally { setSaving(false); } };
  if (!editing) return <><ScrollView contentContainerStyle={styles.content}><View style={styles.sellerProfile}>{form.coverImage ? <Image source={{ uri: resolveImg(form.coverImage) }} style={styles.profileCover} /> : <View style={[styles.profileCover, styles.coverFallback]} />}{form.logo ? <Image source={{ uri: resolveImg(form.logo) }} style={styles.profileLogo} /> : <View style={[styles.profileLogo, styles.logoFallback]}><Store size={28} color={colors.secondary} /></View>}<Text style={styles.profileName}>{store.name || 'Your Store'}</Text>{store.description ? <Text style={styles.profileDescription}>{store.description}</Text> : null}<View style={styles.profileStats}><ProfileMetric value={metrics.rating.toFixed(1)} label={`${metrics.reviews} reviews`} /><ProfileMetric value={Number(metrics.unitsSold).toLocaleString()} label="items sold" /><ProfileMetric value={Number(metrics.followers).toLocaleString()} label="followers" last /></View></View><View style={styles.section}><Text style={styles.sectionTitle}>Seller Tools</Text><SellerTool Icon={Edit3} label="Edit Store Profile" detail="Storefront, fulfillment, and payment" onPress={() => setEditing(true)} /><SellerTool Icon={Store} label="View Public Store" detail="See what buyers see" onPress={() => store.slug && router.push(`/store/${store.slug}`)} /><SellerTool Icon={Settings} label="Account Settings" detail="Personal details and security" onPress={() => router.push('/settings')} /><SellerTool Icon={UserRound} label="Switch to Personal Account" detail="Return to your buyer profile" onPress={switchToBuyer} last /></View></ScrollView><RoleSwitchOverlay visible={switching} label="Switching to Personal Account..." Icon={UserRound} /></>;
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.editHeading}><View><Text style={styles.listTitle}>Edit Store Profile</Text><Text style={styles.rowMeta}>Update what buyers see</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Close store editor" style={styles.editClose} onPress={() => setEditing(false)}><X size={19} color={colors.textPrimary} /></Pressable></View><View style={styles.storePreview}>{form.coverImage ? <Image source={{ uri: resolveImg(form.coverImage) }} style={styles.cover} /> : <View style={[styles.cover, styles.coverFallback]} />}{form.logo ? <Image source={{ uri: resolveImg(form.logo) }} style={styles.logo} /> : <View style={[styles.logo, styles.logoFallback]}><Store size={25} color={colors.secondary} /></View>}<Text style={styles.storePreviewName}>{form.name || 'Your Store'}</Text></View><View style={styles.section}><Text style={styles.sectionTitle}>Storefront</Text><TextField label="Store name" value={form.name} onChangeText={(value) => setField('name', value)} autoCapitalize="words" /><TextField label="Description" value={form.description} onChangeText={(value) => setField('description', value)} multiline autoCapitalize="sentences" /><TextField label="Address" value={form.address} onChangeText={(value) => setField('address', value)} autoCapitalize="words" /><TextField label="Contact number" value={form.contactNumber} onChangeText={(value) => setField('contactNumber', value)} keyboardType="phone-pad" /><TextField label="Business hours" value={form.businessHours} onChangeText={(value) => setField('businessHours', value)} placeholder="Mon-Sat, 8:00 AM-5:00 PM" /><View style={styles.brandRow}><BrandButton label="Logo" image={form.logo} loading={uploading === 'logo'} onPress={() => chooseImage('logo')} /><BrandButton label="Cover" image={form.coverImage} loading={uploading === 'coverImage'} onPress={() => chooseImage('coverImage')} /></View></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>Fulfillment & Payment</Text><Select label="Fulfillment mode" value={form.fulfillmentMode} onChange={(value) => setField('fulfillmentMode', value)} options={[{ label: 'Delivery only', value: 'DELIVERY' }, { label: 'Pickup only', value: 'PICKUP' }, { label: 'Delivery and pickup', value: 'BOTH' }]} />{form.fulfillmentMode !== 'DELIVERY' ? <TextField label="Pickup address" value={form.pickupAddress} onChangeText={(value) => setField('pickupAddress', value)} autoCapitalize="words" /> : null}<View style={styles.switchRow}><View><Text style={styles.rowTitle}>Cash on delivery</Text><Text style={styles.rowMeta}>Allow COD or cash on pickup</Text></View><Switch value={form.acceptsCod} onValueChange={(value) => setField('acceptsCod', value)} trackColor={{ true: colors.primary }} /></View><Select label="QR payment type" value={form.paymentQrType} onChange={(value) => setField('paymentQrType', value)} options={[{ label: 'GCash', value: 'GCASH' }, { label: 'QR Ph', value: 'QRPH' }]} /><BrandButton label="Payment QR" image={form.paymentQrImage} loading={uploading === 'paymentQrImage'} onPress={() => chooseImage('paymentQrImage')} /></View><Pressable style={styles.primaryButton} disabled={saving} onPress={save}>{saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryText}>Save store settings</Text>}</Pressable></ScrollView>;
}

function Insights() {
  const initialData = getCacheEntry(SELLER_CACHE.insights)?.data;
  const [analytics, setAnalytics] = useState(initialData?.analytics || null);
  const [reviews, setReviews] = useState(initialData?.reviews || []);
  const [loading, setLoading] = useState(!initialData);
  useEffect(() => { const fresh = getCachedData(SELLER_CACHE.insights, SELLER_CACHE_TTL); if (fresh) { setAnalytics(fresh.analytics); setReviews(fresh.reviews); setLoading(false); return; } refreshCachedData(SELLER_CACHE.insights, async () => { const [analyticsResponse, productResponse] = await Promise.all([apiClient.get(ENDPOINTS.SELLER.ANALYTICS), apiClient.get(ENDPOINTS.MY_PRODUCTS, { params: { pageSize: 50 } })]); const products = productResponse.data || []; const reviewResponses = await Promise.all(products.slice(0, 20).map((product) => apiClient.get(ENDPOINTS.REVIEWS.BY_PRODUCT(product.id), { params: { pageSize: 5 } }).then((response) => response.data || []).catch(() => []))); return { analytics: analyticsResponse.data, reviews: reviewResponses.flat().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) }; }).then((data) => { setAnalytics(data.analytics); setReviews(data.reviews); }).catch((error) => toast.error('Failed to load insights', error.message)).finally(() => setLoading(false)); }, []);
  if (loading) return <SellerOverviewSkeleton />;
  const maxRevenue = Math.max(1, ...(analytics?.salesByDay || []).map((day) => Number(day.total || 0)));
  const average = reviews.length ? reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length : 0;
  return <ScrollView contentContainerStyle={styles.content}><View style={styles.kpiGrid}><Kpi label="Revenue" value={peso(analytics?.kpis?.revenue?.value)} /><Kpi label="Orders" value={analytics?.kpis?.orders?.value || 0} /><Kpi label="Customers" value={analytics?.kpis?.buyers?.value || 0} /><Kpi label="Rating" value={reviews.length ? average.toFixed(1) : 'New'} /></View><View style={styles.section}><Text style={styles.sectionTitle}>Daily Sales</Text><View style={styles.chart}>{(analytics?.salesByDay || []).slice(-14).map((day) => <View key={day.date} style={styles.barColumn}><View style={[styles.bar, { height: Math.max(3, (Number(day.total || 0) / maxRevenue) * 110) }]} /><Text style={styles.barLabel}>{new Date(day.date).getDate()}</Text></View>)}</View></View><View style={styles.section}><Text style={styles.sectionTitle}>Best Sellers</Text>{(analytics?.topProducts || []).slice(0, 5).map((product, index) => <View key={product.id} style={styles.row}><Text style={styles.rank}>{index + 1}</Text><View style={styles.rowBody}><Text style={styles.rowTitle}>{product.name}</Text><Text style={styles.rowMeta}>{product.quantity} sold</Text></View><Text style={styles.totalText}>{peso(product.revenue)}</Text></View>)}</View><View style={styles.section}><Text style={styles.sectionTitle}>Recent Reviews</Text>{reviews.length ? reviews.slice(0, 10).map((review) => <View key={review.id} style={styles.review}><View style={styles.reviewHeader}><Text style={styles.rowTitle}>{review.user?.fullName || 'Buyer'}</Text><StarRating rating={review.rating} size={13} /></View>{review.product?.name ? <Text style={styles.rowMeta}>on {review.product.name}</Text> : null}{review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}</View>) : <Text style={styles.emptyText}>No reviews yet.</Text>}</View></ScrollView>;
}

function SellerOverviewSkeleton() { return <View style={styles.skeletonContent} accessibilityLabel="Loading seller overview"><LoadingSkeleton width="100%" height={130} borderRadius={radius.lg} /><View style={styles.kpiGrid}>{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} width="48%" height={82} borderRadius={radius.lg} />)}</View><LoadingSkeleton width="100%" height={170} borderRadius={radius.lg} /></View>; }
function SellerListSkeleton({ variant }) { return <View style={styles.skeletonContent} accessibilityLabel={`Loading seller ${variant}`}><View style={styles.skeletonHeading}><LoadingSkeleton width="38%" height={22} /><LoadingSkeleton width={72} height={18} /></View>{variant === 'orders' ? <View style={styles.skeletonChips}>{Array.from({ length: 4 }, (_, index) => <LoadingSkeleton key={index} width={70} height={44} borderRadius={radius.full} />)}</View> : null}{Array.from({ length: 5 }, (_, index) => <LoadingSkeleton key={index} width="100%" height={variant === 'orders' ? 156 : 90} borderRadius={radius.lg} />)}</View>; }
function SellerStoreSkeleton() { return <View style={styles.skeletonContent} accessibilityLabel="Loading store profile"><LoadingSkeleton width="100%" height={220} borderRadius={radius.lg} /><LoadingSkeleton width="40%" height={22} /><LoadingSkeleton width="100%" height={250} borderRadius={radius.lg} /></View>; }
function Kpi({ label, value }) { return <View style={styles.kpi}><Text style={styles.kpiLabel}>{label}</Text><Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>; }
function QuickAction({ Icon, label, onPress }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.quickAction} onPress={onPress}><Icon size={20} color={colors.secondary} /><Text style={styles.quickText}>{label}</Text></Pressable>; }
function SellerTool({ Icon, label, detail, onPress, last }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} style={[styles.sellerTool, !last && styles.sellerToolDivider]} onPress={onPress}><View style={styles.sellerToolIcon}><Icon size={23} strokeWidth={1.6} color={colors.secondary} /></View><View style={styles.rowBody}><Text style={styles.rowTitle}>{label}</Text><Text style={styles.rowMeta}>{detail}</Text></View><ChevronRight size={18} color={colors.gray300} /></Pressable>; }
function ProfileMetric({ value, label, last }) { return <View style={[styles.profileMetric, !last && styles.profileMetricDivider]}><Text style={styles.profileMetricValue}>{value}</Text><Text style={styles.profileMetricLabel}>{label}</Text></View>; }
function BrandButton({ label, image, loading, onPress }) { return <Pressable accessibilityRole="button" accessibilityLabel={`Upload ${label}`} style={styles.brandButton} onPress={onPress}>{image ? <Image source={{ uri: resolveImg(image) }} style={styles.brandImage} /> : <View style={[styles.brandImage, styles.imageFallback]}>{loading ? <ActivityIndicator color={colors.primary} /> : <Upload size={20} color={colors.secondary} />}</View>}<Text style={styles.brandLabel}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, flex: { flex: 1 }, workspace: { flex: 1 }, empty: { flexGrow: 1 }, content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  skeletonContent: { flex: 1, padding: spacing.md, gap: spacing.md }, skeletonHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, skeletonChips: { flexDirection: 'row', gap: spacing.sm, overflow: 'hidden' },
  sellerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.white, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  headerTitle: { ...typography.h2, flex: 1, color: colors.textPrimary },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, position: 'relative' },
  bottomNav: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight, backgroundColor: colors.white },
  navItem: { flex: 1, minWidth: 0, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 1 },
  navIconWrap: { position: 'relative' },
  navBadge: { position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.error, borderWidth: 1.5, borderColor: colors.white },
  navBadgeCompact: { top: -2, right: -4 },
  navBadgeText: { fontSize: 9, lineHeight: 11, color: colors.white, fontFamily: fontFamily.bold },
  navLabel: { fontSize: 10, color: colors.textMuted, fontFamily: fontFamily.medium }, navLabelActive: { color: colors.primary },
  guard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }, guardTitle: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.lg }, guardText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xl }, hero: { padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.secondary }, heroEyebrow: { ...typography.caption, color: colors.primaryLighter }, heroValue: { fontSize: 30, fontFamily: fontFamily.bold, color: colors.white, marginTop: spacing.xs }, heroMeta: { ...typography.caption, color: colors.white, marginTop: spacing.xs }, kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, kpi: { width: '48%', minHeight: 82, justifyContent: 'center', padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.white }, kpiLabel: { ...typography.caption, color: colors.textMuted }, kpiValue: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xs }, section: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white }, sectionTitle: { ...typography.h3, color: colors.textPrimary }, row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight }, rowBody: { flex: 1 }, rowTitle: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, rowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 }, quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, quickAction: { width: '48%', minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white }, quickText: { ...typography.caption, color: colors.textPrimary },
  orderCard: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, borderRadius: radius.base, backgroundColor: colors.white }, orderCardDetails: { padding: spacing.md, gap: spacing.md }, cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }, orderNumber: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, orderItems: { gap: spacing.sm }, compactItem: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, orderItemImage: { width: 44, height: 44, borderRadius: radius.base, backgroundColor: colors.gray100 }, compactBody: { flex: 1, gap: 2 }, compactName: { ...typography.caption, color: colors.textSecondary }, compactMeta: { ...typography.caption, color: colors.textMuted }, orderTotal: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }, totalText: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, actionWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }, statusAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.base, backgroundColor: colors.white }, statusActionText: { ...typography.caption, color: colors.primaryDark, fontFamily: fontFamily.semiBold }, cancelAction: { borderColor: colors.borderMedium, backgroundColor: colors.white }, cancelActionText: { color: colors.textSecondary },
  orderFilters: { marginHorizontal: -spacing.md, marginTop: -spacing.md, backgroundColor: colors.white }, filterList: { paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight, backgroundColor: colors.white }, filterChip: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderBottomWidth: 2, borderBottomColor: 'transparent' }, filterChipActive: { borderBottomColor: colors.primary }, filterText: { ...typography.caption, color: colors.textMuted, fontFamily: fontFamily.medium }, filterTextActive: { color: colors.primaryDark, fontFamily: fontFamily.semiBold },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }, listTitle: { ...typography.h2, color: colors.textPrimary }, addButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.base, backgroundColor: colors.primary }, addText: { ...typography.caption, color: colors.white, fontFamily: fontFamily.semiBold }, productCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white }, productImage: { width: 66, height: 66, borderRadius: radius.base, backgroundColor: colors.gray100 }, imageFallback: { alignItems: 'center', justifyContent: 'center' }, productBody: { flex: 1 }, productPrice: { ...typography.body, color: colors.primaryDark, marginTop: 2 }, stock: { ...typography.caption, color: colors.textMuted, marginTop: 2 }, lowStock: { color: colors.warning }, productActions: { gap: spacing.xs }, iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' }, formSheet: { maxHeight: '92%', borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: colors.white }, sheetHeader: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight }, sheetTitle: { ...typography.h3, color: colors.textPrimary }, formContent: { padding: spacing.lg, paddingBottom: spacing.xxl }, fieldRow: { flexDirection: 'row', gap: spacing.sm }, fieldHalf: { flex: 1 }, imageList: { gap: spacing.sm, marginBottom: spacing.lg }, formImage: { width: 70, height: 70, borderRadius: radius.base }, imageRemove: { position: 'absolute', right: 3, top: 3, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: 'rgba(17,24,39,0.75)' }, uploadButton: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: radius.base, backgroundColor: colors.bgGreenLight }, primaryButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.primary }, primaryText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold },
  orderDetailContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }, detailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, detailSection: { padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.bgSecondary }, detailRow: { minHeight: 28, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg }, detailLabel: { ...typography.caption, flexShrink: 0, color: colors.textMuted }, detailValue: { ...typography.caption, flex: 1, color: colors.textPrimary, fontFamily: fontFamily.medium, textAlign: 'right' }, detailItem: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight }, detailItemImage: { width: 48, height: 48, borderRadius: radius.base, backgroundColor: colors.white }, paymentProof: { width: '100%', height: 180, borderRadius: radius.base, backgroundColor: colors.white }, grandTotal: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderMedium }, grandTotalValue: { ...typography.h2, color: colors.primaryDark },
  storePreview: { alignItems: 'center', paddingBottom: spacing.md, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.white }, cover: { width: '100%', height: 110 }, coverFallback: { backgroundColor: colors.bgGreenLight }, logo: { width: 72, height: 72, marginTop: -36, borderRadius: radius.full, borderWidth: 3, borderColor: colors.white, backgroundColor: colors.white }, logoFallback: { alignItems: 'center', justifyContent: 'center' }, storePreviewName: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.sm }, brandRow: { flexDirection: 'row', gap: spacing.sm }, brandButton: { flex: 1, alignItems: 'center', gap: spacing.xs }, brandImage: { width: '100%', height: 80, borderRadius: radius.base, backgroundColor: colors.gray100 }, brandLabel: { ...typography.caption, color: colors.textSecondary }, switchRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  sellerProfile: { alignItems: 'center', paddingBottom: spacing.lg, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.white },
  profileCover: { width: '100%', height: 132 }, profileLogo: { width: 82, height: 82, marginTop: -41, borderRadius: radius.full, borderWidth: 4, borderColor: colors.white, backgroundColor: colors.white },
  profileName: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.sm }, profileDescription: { ...typography.body, maxWidth: 310, marginTop: spacing.xs, paddingHorizontal: spacing.lg, color: colors.textSecondary, textAlign: 'center' },
  profileStats: { width: '100%', flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight }, profileMetric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingHorizontal: spacing.xs }, profileMetricDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.borderLight }, profileMetricValue: { ...typography.h3, color: colors.textPrimary }, profileMetricLabel: { fontSize: 11, color: colors.textMuted, fontFamily: fontFamily.regular, textAlign: 'center' },
  sellerTool: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, sellerToolDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight }, sellerToolIcon: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  editHeading: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, editClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.white },
  chart: { height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingTop: spacing.sm }, barColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' }, bar: { width: '80%', borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: colors.primary }, barLabel: { fontSize: 9, color: colors.textMuted, marginTop: 3 }, rank: { width: 24, ...typography.h3, color: colors.primaryDark }, review: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.borderLight }, reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm }, reviewComment: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs }, emptyText: { ...typography.body, color: colors.textMuted },
});
