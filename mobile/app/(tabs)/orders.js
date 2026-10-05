import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowCounterClockwiseIcon, ChatTextIcon, CheckCircleIcon, EyeIcon, QrCodeIcon, StarIcon, UploadSimpleIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import ScreenHeader from '../../src/components/ScreenHeader';
import ProductImage from '../../src/components/ProductImage';
import useCartStore, { cartKeyFor } from '../../src/store/cartStore';
import { toast } from '../../src/lib/toast';
import { invalidateCachedData } from '../../src/lib/dataCache';
import { momentLabel, spanLabel } from '../../src/lib/availability';
import { font, t } from '../../src/theme';
import {
  BUYER_TABS, buyerBucket, buyerTabFrom, countBuyerTabs, needsPayment, longDate, pesoPlain, rangeLabel,
} from '../../src/components/orders/orderProgress';
import {
  OrderActions, OrderBadge, OrderCardsSkeleton, OrderTabs, cardShadow,
} from '../../src/components/orders/OrderBits';
import CourierTracking from '../../src/components/orders/CourierTracking';
import OrderPayForm from '../../src/components/orders/OrderPayForm';
import OrderConfirmDialog from '../../src/components/orders/OrderConfirmDialog';
import OrderReviewSheet from '../../src/components/orders/OrderReviewSheet';
import OrderDetailsSheet from '../../src/components/orders/OrderDetailsSheet';
import OrdersEmpty from '../../src/components/orders/OrdersEmpty';

/*
 * My Orders (web/src/pages/Orders.jsx at phone size): the buyer's tabs, one
 * card per order with what to do next, the details sheet, paying a QR
 * order, "Order received", cancelling, rating and buying again.
 */

const ORDERS_PAGE = 50;

// Pay, pay again after a rejection, or replace a proof not yet checked.
const canResubmitProof = (order) => (
  needsPayment(order)
  || (order.paymentMethod !== 'COD'
    && order.paymentStatus === 'PENDING_VERIFICATION'
    && ['PENDING', 'CONFIRMED'].includes(order.status))
);

const payActionLabel = (order) => {
  if (order.paymentStatus === 'PENDING') return 'Pay now';
  if (order.paymentStatus === 'FAILED') return 'Pay again / resubmit proof';
  return 'Replace payment proof';
};

const canConfirmReceipt = (order) => ['DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(order.status);

// While the shop checks a payment the order is held, until that check is
// overdue (the backend's paymentCheck deadline); then the buyer may cancel.
const canBuyerCancel = (order) => order.paymentStatus !== 'PENDING_VERIFICATION'
  || (order.deadline?.kind === 'paymentCheck' && new Date(order.deadline.at) <= new Date());

// The card's badge: the tab it is in (as on Shopee).
const BADGE = {
  to_pay: { label: 'To Pay', tone: 'warning' },
  to_ship: { label: 'To Ship', tone: 'neutral' },
  to_receive: { label: 'To Receive', tone: 'accent' },
  to_pickup: { label: 'To Pick Up', tone: 'accent' },
  completed: { label: 'Completed', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};
const stageBadge = (order) => BADGE[buyerBucket(order)];

const productOf = (it) => it.product || { id: it.productId, name: it.productName, images: it.product?.images || [] };
const parseImages = (images) => {
  if (Array.isArray(images)) return images;
  try { return JSON.parse(images || '[]'); } catch { return images ? [images] : []; }
};

// The list as it showed last time: shown at once while it is asked for again.
let cachedOrders = null;

export default function Orders() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const addItem = useCartStore((s) => s.addItem);

  const [orders, setOrders] = useState(() => cachedOrders || []);
  const [ordersFresh, setOrdersFresh] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !cachedOrders);
  const [refreshing, setRefreshing] = useState(false);
  const [savedTab, setActiveTab] = useState(() => buyerTabFrom(params.status));
  const activeTab = buyerTabFrom(savedTab);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reorderingId, setReorderingId] = useState(null);
  const [pendingReviews, setPendingReviews] = useState({});
  const [proofOrderId, setProofOrderId] = useState(null);
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [receiving, setReceiving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const scrollRef = useRef(null);
  const cardY = useRef({});
  const listY = useRef(0);

  const tabCounts = countBuyerTabs(orders);
  const filteredOrders = activeTab === 'all' ? orders : orders.filter((o) => buyerBucket(o) === activeTab);

  // A link can name a tab (/orders?status=to_pay).
  useEffect(() => { if (params.status) setActiveTab(buyerTabFrom(params.status)); }, [params.status]);

  const loadPendingReviews = useCallback(async () => {
    try {
      const res = await apiClient.get('/reviews/my/pending');
      const map = {};
      for (const item of (Array.isArray(res.data) ? res.data : [])) map[item.productId] = item;
      setPendingReviews(map);
    } catch {
      /* the nudge is optional; the page works without it */
    }
  }, []);
  const unreviewedItems = (order) => (order.items || []).filter((it) => pendingReviews[it.productId]);

  const fetchOrders = useCallback(async () => {
    if (!cachedOrders) setIsLoading(true);
    try {
      const response = await apiClient.get('/orders/my/orders', { params: { page: 1, pageSize: ORDERS_PAGE } });
      const list = response.data || [];
      cachedOrders = list;
      setOrders(list);
      setPage(1);
      setHasMore(Boolean(response.pagination?.hasNext));
      setOrdersFresh(true);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    fetchOrders();
    loadPendingReviews();
  }, [fetchOrders, loadPendingReviews]));

  const loadMoreOrders = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const response = await apiClient.get('/orders/my/orders', { params: { page: next, pageSize: ORDERS_PAGE } });
      setOrders((cur) => {
        const have = new Set(cur.map((o) => o.id));
        return [...cur, ...(response.data || []).filter((o) => !have.has(o.id))];
      });
      setPage(next);
      setHasMore(Boolean(response.pagination?.hasNext));
    } catch {
      toast.error('Could not load more orders');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleViewOrder = (order) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  const confirmCancelOrder = async () => {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    try {
      await apiClient.post(`/orders/${cancelTarget}/cancel`);
      invalidateCachedData('profile:');
      invalidateCachedData('products:');
      invalidateCachedData('home:');
      toast.success('Order cancelled successfully');
      setCancelTarget(null);
      setShowOrderDetails(false);
      fetchOrders();
    } catch (error) {
      toast.error(error.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  // "Buy again": re-add each line from current catalogue data, skipping what
  // can no longer be bought, then straight to checkout with these items.
  const handleReorder = async (order) => {
    const lines = order.items || [];
    if (lines.length === 0) return;
    setReorderingId(order.id);
    try {
      const results = await Promise.allSettled(lines.map((line) => apiClient.get(`/products/${line.productId || line.product?.id}`)));
      let added = 0;
      let skipped = 0;
      const keys = [];
      results.forEach((result, index) => {
        const line = lines[index];
        const product = result.status === 'fulfilled' ? result.value?.data : null;
        const stock = Number(product?.stock ?? 0);
        if (!product || product.status !== 'APPROVED' || stock <= 0) {
          skipped += 1;
          return;
        }
        try {
          addItem({
            id: product.id,
            productId: product.id,
            name: product.name,
            price: product.price,
            image: parseImages(product.images)[0] || null,
            storeId: product.storeId || product.store?.id,
            storeName: product.store?.name,
            storeLogo: product.store?.logoUrl || product.store?.logo || null,
            stock,
            slug: product.slug,
            categoryId: product.categoryId,
            selectedVariations: line.selectedVariations || null,
          }, Math.max(1, Math.min(Number(line.quantity) || 1, stock)));
          keys.push(cartKeyFor({ id: product.id, selectedVariations: line.selectedVariations || null }));
          added += 1;
        } catch {
          skipped += 1;
        }
      });
      if (added === 0) {
        toast.error('None of these items are available right now');
        return;
      }
      toast.success(skipped > 0
        ? `${added} item${added === 1 ? '' : 's'} added to cart, ${skipped} unavailable`
        : `${added} item${added === 1 ? '' : 's'} added to cart`);
      router.push({ pathname: '/checkout', params: { selectedIds: JSON.stringify(keys) } });
    } catch (error) {
      toast.error(error.message || 'Failed to add items to cart');
    } finally {
      setReorderingId(null);
    }
  };

  // Deep link from a notification: /orders?id=<orderId> opens that order once
  // the fresh list has loaded. The id is remembered, so closing the sheet
  // does not reopen it while another order's link still does.
  const openedOrderId = useRef(null);
  useEffect(() => {
    const targetId = params.id;
    if (!targetId || !ordersFresh || orders.length === 0 || openedOrderId.current === targetId) return;
    openedOrderId.current = targetId;
    const match = orders.find((order) => order.id === targetId);
    if (!match) return;
    // "Order confirmed: please pay now" lands on the payment, in To Pay.
    if (needsPayment(match)) {
      setActiveTab('to_pay');
      setProofOrderId(match.id);
      setTimeout(() => {
        const y = cardY.current[match.id];
        if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, listY.current + y - 120), animated: true });
      }, 400);
      return;
    }
    setActiveTab(buyerBucket(match));
    setSelectedOrder(match);
    setShowOrderDetails(true);
  }, [orders, ordersFresh, params.id]);

  const handleConfirmReceived = async () => {
    if (!receiveTarget) return;
    setReceiving(true);
    try {
      const received = receiveTarget;
      await apiClient.post(`/orders/${received.id}/received`);
      toast.success('Thanks! Order marked as received');
      setReceiveTarget(null);
      setShowOrderDetails(false);
      fetchOrders();
      loadPendingReviews();
      // The goods are in hand: ask right away. One item opens the review
      // form; several go to the review list so each can be rated.
      const items = received.items || [];
      if (items.length === 1) {
        setReviewTarget({
          product: productOf(items[0]),
          orderId: received.id,
          intro: 'Thanks for confirming. How was it? Your rating helps other buyers and the seller.',
        });
      } else if (items.length > 1) {
        router.push('/reviews?tab=pending');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to confirm receipt');
    } finally {
      setReceiving(false);
    }
  };

  const reviewOrder = (order, item, extra = {}) => setReviewTarget({ product: productOf(item), orderId: order.id, ...extra });

  const cardButtons = (order) => {
    const storeId = order.storeId || order.store?.id;
    const done = ['COMPLETED', 'DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(order.status);
    const received = ['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(order.status) && order.items?.length > 0;
    return [
      { key: 'view', label: 'View details', Icon: EyeIcon, onPress: () => handleViewOrder(order) },
      canResubmitProof(order) && {
        key: 'pay',
        primary: true,
        label: payActionLabel(order),
        Icon: order.paymentStatus === 'PENDING_VERIFICATION' ? UploadSimpleIcon : QrCodeIcon,
        onPress: () => setProofOrderId((id) => (id === order.id ? null : order.id)),
      },
      canConfirmReceipt(order) && {
        key: 'received', primary: true, label: 'Order received', Icon: CheckCircleIcon, onPress: () => setReceiveTarget(order),
      },
      ['PENDING', 'CONFIRMED'].includes(order.status) && canBuyerCancel(order) && {
        key: 'cancel', danger: true, label: 'Cancel order', onPress: () => setCancelTarget(order.id),
      },
      order.status === 'COMPLETED' && {
        key: 'again',
        primary: true,
        label: reorderingId === order.id ? 'Adding…' : 'Buy again',
        Icon: reorderingId === order.id ? null : ArrowCounterClockwiseIcon,
        busy: reorderingId === order.id,
        onPress: () => handleReorder(order),
      },
      done && {
        key: 'return', label: 'Request return', Icon: ArrowCounterClockwiseIcon, onPress: () => router.push(`/returns/request?orderId=${order.id}`),
      },
      done && { key: 'receipt', label: 'View receipt', onPress: () => router.push(`/receipt/${order.id}`) },
      received && (order.items.length === 1
        ? { key: 'review', label: 'Write review', Icon: StarIcon, onPress: () => reviewOrder(order, order.items[0]) }
        : { key: 'review', label: 'Review items', Icon: StarIcon, onPress: () => handleViewOrder(order) }),
      storeId && { key: 'chat', label: 'Contact seller', Icon: ChatTextIcon, onPress: () => router.push(`/messages?store=${storeId}`) },
    ];
  };

  const header = <ScreenHeader title="My Orders" backTo="/profile" />;

  if (isLoading) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.content}><OrderCardsSkeleton /></View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(); loadPendingReviews(); }} colors={[t.primary[600]]} />}
        keyboardShouldPersistTaps="handled"
      >
        <OrderTabs
          tabs={BUYER_TABS}
          active={activeTab}
          onChange={setActiveTab}
          // Counts on the tabs that need something from the buyer (as on Shopee).
          counts={{
            to_pay: tabCounts.to_pay, to_ship: tabCounts.to_ship, to_receive: tabCounts.to_receive, to_pickup: tabCounts.to_pickup,
          }}
        />

        {loadFailed && orders.length === 0 ? (
          <OrdersEmpty
            art="orders"
            title={'Your orders couldn’t be loaded'}
            hint="Check your connection and try again."
            button="Try again"
            onPress={fetchOrders}
          />
        ) : filteredOrders.length === 0 ? (
          <OrdersEmpty
            art="orders"
            title="No orders found"
            hint="You haven't placed any orders in this category yet."
            button="Browse Products"
            onPress={() => router.push('/products')}
          />
        ) : (
          <View style={styles.list} onLayout={(e) => { listY.current = e.nativeEvent.layout.y; }}>
            {filteredOrders.map((order) => (
              <View key={order.id} onLayout={(e) => { cardY.current[order.id] = e.nativeEvent.layout.y; }}>
                <OrderCard
                  order={order}
                  badge={stageBadge(order)}
                  unreviewed={order.status === 'COMPLETED' ? unreviewedItems(order) : []}
                  buttons={cardButtons(order)}
                  onStore={() => order.store?.slug && router.push(`/store/${order.store.slug}`)}
                  onStar={(item, n) => reviewOrder(order, item, { initialRating: n })}
                  onRateItems={() => router.push('/reviews?tab=pending')}
                  payForm={proofOrderId === order.id ? (
                    <OrderPayForm
                      key={`pay-${order.id}`}
                      order={order}
                      apiClient={apiClient}
                      onCancel={() => setProofOrderId(null)}
                      onDone={() => { setProofOrderId(null); fetchOrders(); }}
                    />
                  ) : null}
                />
              </View>
            ))}
          </View>
        )}

        {/* Older orders, 50 at a time. */}
        {hasMore && !loadFailed ? (
          <Pressable accessibilityRole="button" onPress={loadMoreOrders} disabled={loadingMore} style={[styles.more, loadingMore && { opacity: 0.6 }]}>
            <Text style={styles.moreText}>{loadingMore ? 'Loading…' : 'Show more orders'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <OrderDetailsSheet
        open={showOrderDetails && Boolean(selectedOrder)}
        order={selectedOrder}
        badge={selectedOrder ? stageBadge(selectedOrder) : null}
        onClose={() => setShowOrderDetails(false)}
        canReceive={selectedOrder ? canConfirmReceipt(selectedOrder) : false}
        canCancel={selectedOrder ? ['PENDING', 'CONFIRMED'].includes(selectedOrder.status) && canBuyerCancel(selectedOrder) : false}
        onReceived={() => setReceiveTarget(selectedOrder)}
        onCancel={() => setCancelTarget(selectedOrder.id)}
        onReview={(item) => { setShowOrderDetails(false); reviewOrder(selectedOrder, item); }}
      />

      <OrderReviewSheet
        target={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onSuccess={() => { invalidateCachedData('profile:'); fetchOrders(); loadPendingReviews(); }}
      />

      <OrderConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this order?"
        message="The shop will be told, and anything you paid will be refunded by the shop."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        danger
        loading={cancelling}
        onConfirm={confirmCancelOrder}
        onCancel={() => { if (!cancelling) setCancelTarget(null); }}
      />

      <OrderConfirmDialog
        open={Boolean(receiveTarget)}
        title="Confirm you received this order?"
        message={receiveTarget ? `Order #${receiveTarget.orderNumber} will be marked as completed.${receiveTarget.paymentMethod === 'COD' ? ' This also confirms you paid on delivery / pickup.' : ''}` : ''}
        confirmLabel="Yes, received"
        loading={receiving}
        onConfirm={handleConfirmReceived}
        onCancel={() => { if (!receiving) setReceiveTarget(null); }}
      />
    </View>
  );
}

/** One order (.order-card): shop and stage, items, facts, nudges, buttons. */
function OrderCard({
  order, badge, unreviewed, buttons, onStore, onStar, onRateItems, payForm,
}) {
  const showEta = order.etaFrom && !['COMPLETED', 'CANCELLED', 'DELIVERED', 'PICKED_UP'].includes(order.status);
  const items = order.items || [];
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Pressable accessibilityRole="link" onPress={onStore} style={styles.storeLink}>
          <Text style={styles.storeName} numberOfLines={1}>{order.store?.name || 'Store'}</Text>
        </Pressable>
        <OrderBadge label={badge.label} tone={badge.tone} />
      </View>

      <View style={styles.cardBody}>
        <View style={styles.items}>
          {items.slice(0, 3).map((item, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <View key={index} style={styles.item}>
              <View style={styles.itemImage}><ProductImage src={item.product?.images?.[0]} /></View>
              <View style={styles.itemText}>
                <Text style={styles.itemName} numberOfLines={2}>{item.productName}</Text>
                <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>{pesoPlain(item.price)}</Text>
            </View>
          ))}
          {items.length > 3 ? (
            <Text style={styles.more3}>+{items.length - 3} more item{items.length - 3 > 1 ? 's' : ''}</Text>
          ) : null}
        </View>

        <View style={styles.info}>
          <InfoRow label="Order number" value={order.orderNumber} />
          <InfoRow label="Order date" value={longDate(order.createdAt)} />
          {showEta ? (
            <InfoRow
              label={order.fulfillmentMethod === 'PICKUP' ? 'Ready for pickup' : 'Expected'}
              value={order.respondBy
                ? spanLabel(order.etaFrom, order.etaTo || order.etaFrom)
                : rangeLabel({ from: order.etaFrom, to: order.etaTo || order.etaFrom })}
            />
          ) : null}
          {order.respondBy && order.status === 'PENDING' ? (
            <InfoRow label="Available Today" value={`The shop confirms by ${momentLabel(order.respondBy)}, or the order cancels on its own`} />
          ) : null}
          <InfoRow label="Total amount" value={pesoPlain(order.total)} total />
        </View>
      </View>

      {unreviewed.length > 0 ? (
        <View style={styles.nudge}>
          {unreviewed.length === 1 ? null : (
            <Pressable accessibilityRole="link" onPress={onRateItems} style={styles.nudgeBtn}>
              <Text style={styles.nudgeBtnText}>Rate items</Text>
            </Pressable>
          )}
          <View style={styles.nudgeText}>
            <StarIcon size={18} weight="fill" color={t.warning[500]} />
            <Text style={styles.nudgeLine}>
              {unreviewed.length === 1
                ? <>How was <Text style={styles.nudgeStrong}>{productOf(unreviewed[0]).name}</Text>? Tap a star to rate it.</>
                : `How was your order? ${unreviewed.length} items are waiting for a rating.`}
            </Text>
          </View>
          {unreviewed.length === 1 ? (
            <View style={styles.nudgeStars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} onPress={() => onStar(unreviewed[0], n)} style={styles.nudgeStar}>
                  <StarIcon size={22} color={t.neutral[500]} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {order.status === 'SHIPPED' && order.trackingNumber ? <CourierTracking order={order} /> : null}

      <OrderActions buttons={buttons} />
      {payForm}
    </View>
  );
}

function InfoRow({ label, value, total = false }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, total && styles.infoTotal]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { paddingTop: 24, paddingHorizontal: 12, gap: 12 },
  list: { gap: 12 },

  card: { borderRadius: 12, backgroundColor: t.neutral[0], overflow: 'hidden', ...cardShadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 4 },
  storeLink: { flex: 1, minWidth: 0 },
  storeName: { fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[900] },
  cardBody: { paddingTop: 8, paddingHorizontal: 14 },
  items: { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: t.neutral[150] },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  itemImage: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  itemText: { flex: 1, minWidth: 0 },
  itemName: { marginBottom: 4, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  itemQty: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  itemPrice: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  more3: { marginTop: 7, fontSize: 12, lineHeight: 19.2, fontStyle: 'italic', ...font(400), color: t.neutral[500] },
  info: { gap: 6, paddingBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  infoLabel: { flexShrink: 0, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  infoValue: { flexShrink: 1, textAlign: 'right', fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[900] },
  infoTotal: { fontSize: 17, lineHeight: 27.2 },

  nudge: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    marginHorizontal: 20, marginBottom: 0, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: t.warning[200], backgroundColor: t.warning[50],
  },
  nudgeBtn: { width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: t.primary[600] },
  nudgeBtnText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: '#fff' },
  nudgeText: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  nudgeLine: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[800] },
  nudgeStrong: { ...font(500) },
  nudgeStars: { flexDirection: 'row', gap: 2 },
  nudgeStar: { padding: 2 },

  more: {
    alignSelf: 'center', marginTop: 2, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 22,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  moreText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700] },
});

