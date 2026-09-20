import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, RefreshControl,
  ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ImageIcon as ImagePlus, ChatCircleIcon as MessageCircle, PackageIcon as Package, ReceiptIcon as ReceiptText, ArrowCounterClockwiseIcon as RotateCcw, StarIcon as Star, VideoCameraIcon as Video, XIcon as X } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import EmptyState from '../../src/components/EmptyState';
import StatusBadge from '../../src/components/StatusBadge';
import useCartStore from '../../src/store/cartStore';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { uploadReview } from '../../src/lib/upload';
import { ListSkeleton } from '../../src/components/SkeletonLayouts';
import { invalidateCachedData } from '../../src/lib/dataCache';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'To Pay' },
  { key: 'CONFIRMED', label: 'To Ship' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const TAB_STATUS_GROUPS = {
  PENDING: ['PENDING'],
  CONFIRMED: ['CONFIRMED'],
  PREPARING: ['PREPARING'],
  READY: ['READY', 'READY_FOR_PICKUP', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'DELIVERED'],
  COMPLETED: ['COMPLETED'],
  CANCELLED: ['CANCELLED'],
};

const REVIEWABLE = ['COMPLETED', 'DELIVERED', 'PICKED_UP'];
const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const firstImage = (images) => {
  if (Array.isArray(images)) return images[0];
  try { return JSON.parse(images || '[]')[0]; } catch { return images; }
};

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { status, id: deepLinkOrderId } = useLocalSearchParams();
  const addItem = useCartStore((state) => state.addItem);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState(String(status || 'all').toUpperCase());
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [reviewItem, setReviewItem] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [reviewImages, setReviewImages] = useState([]);
  const [reviewVideo, setReviewVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchOrders = useCallback(async ({ refresh = false } = {}) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    try {
      const response = await apiClient.get(ENDPOINTS.ORDERS.MY_ORDERS, { params: { pageSize: 100 } });
      setOrders(response.data || []);
    } catch (error) {
      toast.error('Failed to load orders', error.message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchOrders(); }, [fetchOrders]));

  // Deep link from an order notification: /orders?id=<orderId> opens that
  // order once the list has loaded. The id is remembered rather than cleared,
  // so dismissing the sheet does not immediately reopen it while a different
  // order arriving from another notification still does.
  const openedOrderId = useRef(null);
  useEffect(() => {
    if (!deepLinkOrderId || orders.length === 0) return;
    if (openedOrderId.current === deepLinkOrderId) return;
    openedOrderId.current = deepLinkOrderId;
    const match = orders.find((order) => order.id === deepLinkOrderId);
    if (match) setSelectedOrder(match);
  }, [deepLinkOrderId, orders]);

  const filteredOrders = useMemo(() => activeTab === 'ALL' || activeTab === 'all'
    ? orders
    : orders.filter((order) => (TAB_STATUS_GROUPS[activeTab] || [activeTab]).includes(order.status)), [activeTab, orders]);

  const countFor = (key) => key === 'all' ? orders.length : orders.filter((order) => (TAB_STATUS_GROUPS[key] || [key]).includes(order.status)).length;

  const cancelOrder = (order) => Alert.alert(
    'Cancel this order?',
    'Reserved stock will be returned to the store.',
    [
      { text: 'Keep order', style: 'cancel' },
      {
        text: 'Cancel order', style: 'destructive', onPress: async () => {
          try {
            await apiClient.post(ENDPOINTS.ORDERS.CANCEL(order.id));
            invalidateCachedData('profile:');
            invalidateCachedData('products:');
            invalidateCachedData('home:');
            setSelectedOrder(null);
            toast.success('Order cancelled');
            fetchOrders({ refresh: true });
          } catch (error) { toast.error('Could not cancel order', error.message); }
        }
      },
    ]
  );

  const reorder = (order) => {
    let added = 0;
    order.items?.forEach((item) => {
      try {
        addItem({
          id: item.productId || item.product?.id,
          name: item.productName || item.product?.name,
          price: item.product?.price || item.price,
          image: firstImage(item.product?.images),
          storeId: order.storeId || order.store?.id,
          storeName: order.store?.name,
          slug: item.product?.slug,
        }, item.quantity);
        added += 1;
      } catch { /* Continue with other available items. */ }
    });
    if (added) {
      toast.success(`${added} ${added === 1 ? 'item' : 'items'} added to cart`);
      router.push('/cart');
    } else toast.error('No items could be added');
  };

  const shareReceipt = async (order) => {
    const lines = order.items?.map((item) => `${item.quantity} x ${item.productName || item.product?.name} - ${peso(item.subtotal || Number(item.price) * item.quantity)}`) || [];
    await Share.share({ message: `E-MOORM Receipt\nOrder ${order.orderNumber}\n${lines.join('\n')}\nDelivery: ${peso(order.deliveryFee)}\nTotal: ${peso(order.total)}\nStatus: ${order.status}` });
  };

  const openReview = (item) => {
    setReviewItem(item);
    setRating(5);
    setComment('');
    setReviewImages([]);
    setReviewVideo(null);
  };

  const pickReviewImages = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return toast.error('Photo permission is required');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5 - reviewImages.length, quality: 0.85 });
    if (!result.canceled) setReviewImages((current) => [...current, ...result.assets].slice(0, 5));
  };

  const pickReviewVideo = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return toast.error('Video permission is required');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 60 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 50 * 1024 * 1024) return toast.error('Video must be under 50 MB');
    setReviewVideo(asset);
  };

  const submitReview = async () => {
    setIsSubmitting(true);
    try {
      await uploadReview({
        productId: reviewItem.productId || reviewItem.product?.id,
        orderId: selectedOrder?.id,
        rating,
        comment,
        images: reviewImages,
        video: reviewVideo,
      });
      invalidateCachedData('profile:');
      setReviewItem(null);
      toast.success('Review published');
    } catch (error) { toast.error('Could not publish review', error.message); }
    finally { setIsSubmitting(false); }
  };

  if (isLoading) return <View style={styles.screen}><View style={[styles.header, { paddingTop: insets.top + spacing.md }]}><Text style={styles.title}>My Orders</Text><Text style={styles.subtitle}>Loading your purchases</Text></View><ListSkeleton rows={6} imageSize={56} /></View>;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}><Text style={styles.title}>My Orders</Text><Text style={styles.subtitle}>{orders.length} total orders</Text></View>
      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key || (activeTab === 'ALL' && tab.key === 'all');
            const count = countFor(tab.key);
            return <Pressable key={tab.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setActiveTab(tab.key)}><Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>{count ? <Text style={[styles.tabCount, active && styles.tabCountActive]}>{count}</Text> : null}</Pressable>;
          })}
        </ScrollView>
      </View>
      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={filteredOrders.length ? styles.list : styles.empty}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => fetchOrders({ refresh: true })} colors={[colors.primary]} />}
        ListEmptyComponent={<EmptyState icon={<Package size={44} color={colors.gray400} />} title="No orders here" message="Orders in this stage will appear here." actionLabel="Browse products" onAction={() => router.push('/products')} />}
        renderItem={({ item: order }) => <OrderCard order={order} onDetails={() => setSelectedOrder(order)} onCancel={() => cancelOrder(order)} onReorder={() => reorder(order)} />}
      />

      <Modal visible={Boolean(selectedOrder)} transparent animationType="slide" onRequestClose={() => setSelectedOrder(null)}>
        <View style={styles.modalBackdrop}><View style={styles.sheet}>
          <View style={styles.sheetHeader}><View><Text style={styles.sheetTitle}>Order Details</Text><Text style={styles.orderNumber}>{selectedOrder?.orderNumber}</Text></View><Pressable style={styles.closeButton} onPress={() => setSelectedOrder(null)}><X size={20} color={colors.textPrimary} /></Pressable></View>
          {selectedOrder ? <ScrollView contentContainerStyle={styles.sheetBody}>
            <View style={styles.detailTop}><StatusBadge status={selectedOrder.status} /><Text style={styles.date}>{new Date(selectedOrder.createdAt).toLocaleString('en-PH')}</Text></View>
            <Detail label={selectedOrder.fulfillmentMethod === 'PICKUP' ? 'Pickup location' : 'Delivery address'} value={selectedOrder.deliveryAddress || selectedOrder.pickupLocation || 'Store pickup'} />
            <Detail label="Contact number" value={selectedOrder.contactNumber || '—'} />
            <Text style={styles.sectionTitle}>Items</Text>
            {selectedOrder.items?.map((item) => <View key={item.id || item.productId} style={styles.detailItem}><ProductImage item={item} /><View style={styles.itemInfo}><Text style={styles.itemName}>{item.productName || item.product?.name}</Text><Text style={styles.itemMeta}>Qty {item.quantity} · {peso(item.price)}</Text></View><Text style={styles.itemPrice}>{peso(item.subtotal || Number(item.price) * item.quantity)}</Text>{REVIEWABLE.includes(selectedOrder.status) ? <Pressable style={styles.reviewIcon} onPress={() => openReview(item)}><Star size={17} color={colors.star} /></Pressable> : null}</View>)}
            <View style={styles.summary}><Summary label="Subtotal" value={peso(selectedOrder.subtotal)} /><Summary label="Delivery fee" value={Number(selectedOrder.deliveryFee) ? peso(selectedOrder.deliveryFee) : 'FREE'} /><Summary label="Total" value={peso(selectedOrder.total)} total /></View>
            <View style={styles.actions}>
              <Pressable style={styles.actionButton} onPress={() => shareReceipt(selectedOrder)}><ReceiptText size={16} color={colors.secondary} /><Text style={styles.actionText}>Share receipt</Text></Pressable>
              <Pressable style={styles.actionButton} onPress={() => { setSelectedOrder(null); router.push(`/messages?store=${selectedOrder.storeId || selectedOrder.store?.id}`); }}><MessageCircle size={16} color={colors.secondary} /><Text style={styles.actionText}>Contact seller</Text></Pressable>
              {selectedOrder.status === 'PENDING' || selectedOrder.status === 'CONFIRMED' ? <Pressable style={[styles.actionButton, styles.dangerButton]} onPress={() => cancelOrder(selectedOrder)}><Text style={styles.dangerText}>Cancel order</Text></Pressable> : null}
              {selectedOrder.status === 'COMPLETED' ? <Pressable style={[styles.actionButton, styles.primaryAction]} onPress={() => reorder(selectedOrder)}><RotateCcw size={16} color={colors.white} /><Text style={styles.primaryActionText}>Buy again</Text></Pressable> : null}
            </View>
          </ScrollView> : null}
        </View></View>
      </Modal>

      <Modal visible={Boolean(reviewItem)} transparent animationType="fade" onRequestClose={() => setReviewItem(null)}>
        <View style={styles.modalBackdrop}><View style={styles.reviewSheet}>
          <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Review product</Text><Pressable onPress={() => setReviewItem(null)}><X size={20} color={colors.textPrimary} /></Pressable></View>
          <Text style={styles.reviewProduct}>{reviewItem?.productName || reviewItem?.product?.name}</Text>
          <View style={styles.ratingPicker}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} onPress={() => setRating(value)} hitSlop={5}><Star size={32} color={colors.star} weight={value <= rating ? 'fill' : 'regular'} /></Pressable>)}</View>
          <TextInput value={comment} onChangeText={setComment} style={styles.commentInput} placeholder="Share what you liked about this product" placeholderTextColor={colors.textMuted} multiline maxLength={1000} />
          <View style={styles.mediaRow}>
            {reviewImages.map((asset, index) => <Pressable key={`${asset.uri}-${index}`} onPress={() => setReviewImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}><Image source={{ uri: asset.uri }} style={styles.mediaPreview} /><View style={styles.mediaRemove}><X size={11} color={colors.white} /></View></Pressable>)}
            {reviewImages.length < 5 ? <Pressable style={styles.mediaButton} onPress={pickReviewImages}><ImagePlus size={20} color={colors.secondary} /><Text style={styles.mediaButtonText}>Photo</Text></Pressable> : null}
            <Pressable style={styles.mediaButton} onPress={pickReviewVideo}><Video size={20} color={reviewVideo ? colors.primary : colors.secondary} /><Text style={styles.mediaButtonText}>{reviewVideo ? 'Video added' : 'Video'}</Text></Pressable>
          </View>
          <Pressable style={[styles.submitButton, isSubmitting && styles.disabled]} disabled={isSubmitting} onPress={submitReview}>{isSubmitting ? <ActivityIndicator color={colors.white} /> : <Text style={styles.submitText}>Publish review</Text>}</Pressable>
        </View></View>
      </Modal>
    </View>
  );
}

function ProductImage({ item }) {
  const uri = resolveImg(firstImage(item.product?.images));
  return uri ? <Image source={{ uri }} style={styles.itemImage} /> : <View style={[styles.itemImage, styles.imageFallback]}><Package size={18} color={colors.gray400} /></View>;
}

function OrderCard({ order, onDetails, onCancel, onReorder }) {
  const preview = order.items?.[0];
  return <View style={styles.card}>
    <View style={styles.cardHeader}><View style={styles.storeInfo}><Text style={styles.storeName} numberOfLines={1}>{order.store?.name || 'Store'}</Text><Text style={styles.orderNumber}>{order.orderNumber}</Text></View><StatusBadge status={order.status} /></View>
    {preview ? <View style={styles.preview}><ProductImage item={preview} /><View style={styles.itemInfo}><Text style={styles.itemName} numberOfLines={2}>{preview.productName || preview.product?.name}</Text><Text style={styles.itemMeta}>Qty {preview.quantity}{order.items.length > 1 ? ` · +${order.items.length - 1} more` : ''}</Text></View><Text style={styles.itemPrice}>{peso(order.total)}</Text></View> : null}
    <View style={styles.cardFooter}><Text style={styles.date}>{new Date(order.createdAt).toLocaleDateString('en-PH')}</Text><View style={styles.cardActions}>{(order.status === 'PENDING' || order.status === 'CONFIRMED') ? <Pressable onPress={onCancel}><Text style={styles.cancelLink}>Cancel</Text></Pressable> : null}{order.status === 'COMPLETED' ? <Pressable onPress={onReorder}><Text style={styles.reorderLink}>Buy again</Text></Pressable> : null}<Pressable style={styles.detailsButton} onPress={onDetails}><Text style={styles.detailsText}>View details</Text></Pressable></View></View>
  </View>;
}

function Detail({ label, value }) { return <View style={styles.detailRow}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }
function Summary({ label, value, total }) { return <View style={styles.summaryRow}><Text style={total ? styles.totalLabel : styles.summaryLabel}>{label}</Text><Text style={total ? styles.totalValue : styles.summaryValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, backgroundColor: colors.white }, title: { ...typography.h2, color: colors.textPrimary }, subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  tabsWrap: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderLight }, tabs: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs }, tab: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.gray100 }, tabActive: { backgroundColor: colors.primary }, tabText: { ...typography.caption, color: colors.textSecondary }, tabTextActive: { color: colors.white, fontFamily: fontFamily.semiBold }, tabCount: { ...typography.caption, color: colors.textMuted }, tabCountActive: { color: colors.white },
  list: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl }, empty: { flexGrow: 1 }, card: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md }, cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }, storeInfo: { flex: 1 }, storeName: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, orderNumber: { ...typography.caption, color: colors.textMuted, marginTop: 2 }, preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, itemImage: { width: 58, height: 58, borderRadius: radius.base, backgroundColor: colors.gray100 }, imageFallback: { alignItems: 'center', justifyContent: 'center' }, itemInfo: { flex: 1, gap: 3 }, itemName: { ...typography.body, color: colors.textPrimary }, itemMeta: { ...typography.caption, color: colors.textSecondary }, itemPrice: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.textPrimary }, cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.borderLight, paddingTop: spacing.sm, gap: spacing.sm }, date: { ...typography.caption, color: colors.textMuted }, cardActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, cancelLink: { ...typography.caption, color: colors.error }, reorderLink: { ...typography.caption, color: colors.secondary }, detailsButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.base, backgroundColor: colors.bgGreenLight }, detailsText: { ...typography.caption, fontFamily: fontFamily.semiBold, color: colors.secondary },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17,24,39,0.45)' }, sheet: { maxHeight: '88%', backgroundColor: colors.bgSecondary, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' }, sheetHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.borderLight }, sheetTitle: { ...typography.h3, color: colors.textPrimary }, closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, sheetBody: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl }, detailTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, detailRow: { padding: spacing.md, backgroundColor: colors.white, borderRadius: radius.lg, gap: spacing.xs }, detailLabel: { ...typography.caption, color: colors.textMuted }, detailValue: { ...typography.body, color: colors.textPrimary, lineHeight: 20 }, sectionTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xs }, detailItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.white }, reviewIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, summary: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between' }, summaryLabel: { ...typography.body, color: colors.textSecondary }, summaryValue: { ...typography.body, color: colors.textPrimary }, totalLabel: { ...typography.h3, color: colors.textPrimary }, totalValue: { ...typography.h3, color: colors.primaryDark }, actions: { gap: spacing.sm }, actionButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg, backgroundColor: colors.white }, actionText: { ...typography.body, color: colors.secondary, fontFamily: fontFamily.semiBold }, dangerButton: { borderColor: '#fecaca' }, dangerText: { ...typography.body, color: colors.error, fontFamily: fontFamily.semiBold }, primaryAction: { borderColor: colors.primary, backgroundColor: colors.primary }, primaryActionText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold },
  reviewSheet: { backgroundColor: colors.white, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: spacing.xxl }, reviewProduct: { ...typography.body, color: colors.textSecondary, textAlign: 'center', padding: spacing.md }, ratingPicker: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg }, commentInput: { minHeight: 110, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.gray50, textAlignVertical: 'top', ...typography.body, color: colors.textPrimary }, mediaRow: { minHeight: 70, flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.lg }, mediaPreview: { width: 64, height: 64, borderRadius: radius.base }, mediaRemove: { position: 'absolute', right: 2, top: 2, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: 'rgba(17,24,39,0.75)' }, mediaButton: { minWidth: 64, height: 64, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: spacing.xs, borderRadius: radius.base, backgroundColor: colors.bgGreenLight }, mediaButtonText: { ...typography.caption, fontSize: 10, color: colors.secondary }, submitButton: { minHeight: 48, margin: spacing.lg, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.primary }, submitText: { ...typography.body, color: colors.white, fontFamily: fontFamily.semiBold }, disabled: { opacity: 0.5 },
});
