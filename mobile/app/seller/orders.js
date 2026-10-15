import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MagnifyingGlassIcon, SlidersHorizontalIcon, XIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { toast } from '../../src/lib/toast';
import { getCacheEntry, setCachedData } from '../../src/lib/dataCache';
import SellerPage, { sellerPageStyles } from '../../src/components/seller/SellerPage';
import { SellerChip } from '../../src/components/seller/SellerChips';
import EmptyState from '../../src/components/EmptyState';
import OrderConfirmDialog from '../../src/components/orders/OrderConfirmDialog';
import OrderCard, { OrdersSkeleton } from '../../src/components/seller/orders/OrderCard';
import OrderDetailSheet from '../../src/components/seller/orders/OrderDetailSheet';
import OrderFilterSheet from '../../src/components/seller/orders/OrderFilterSheet';
import ProofPhotoSheet from '../../src/components/seller/orders/ProofPhotoSheet';
import ShipOrderSheet from '../../src/components/seller/orders/ShipOrderSheet';
import BuyerReportSheet from '../../src/components/seller/orders/BuyerReportSheet';
import PhotoViewer from '../../src/components/seller/orders/PhotoViewer';
import {
  PAGE_SIZE, SELLER_TABS, STATUS_MAP, cancelReasonsFor, parcelBackNote, refundNote, sellerTabFrom, sellerTabOf, tabCount,
} from '../../src/components/seller/orders/sellerOrderLib';
import { peso } from '../../src/components/orders/orderProgress';
import { font, t } from '../../src/theme';

/*
 * /seller/orders (My orders), the phone view of web/src/pages/SellerOrders.jsx
 * (+ SellerOrders.css, SellerDashboard.css .seller-search / .seller-empty,
 * layout/SellerMobile.css "── Orders", SellerPhoneFit.css).
 *
 * The order-number search with the filter button (date ordered, payment),
 * the stage chips scrolling sideways with their counts, "N orders", then one
 * card per order (photo and name, buyer, day, total, Today/paluto timing,
 * the next step). Details opens the order's sheet: the next step for its
 * delivery or pickup flow, cancel with a reason, payment review, shipping
 * with a courier, hand-over photos, the buyer's record and Report.
 *
 * Each tab's first page is remembered (shown at once, then refreshed); pull
 * to refresh. Links: ?id=<orderId> opens that order, ?status=<tab> picks the tab.
 */

const cacheKey = (tab) => `seller:orders:${tab}`;

const PAYMENT_TOASTS = {
  PAID: 'Payment confirmed. You can now prepare the order.',
  FAILED: 'Payment rejected — the buyer will be asked to upload a new proof',
  REFUNDED: 'Refund recorded',
};

export default function SellerOrdersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);

  const [activeTab, setActiveTab] = useState(() => sellerTabFrom(params.status));
  // Each tab's first page as it showed last time: shown at once while it is asked for again.
  const saved = useMemo(() => getCacheEntry(cacheKey(activeTab))?.data || null, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [orders, setOrders] = useState(() => saved?.orders || []);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState(() => saved?.pagination || { total: 0, totalPages: 1, hasNext: false });
  const [selectedOrder, setSelectedOrder] = useState(null);
  // Orders per stage, for the counts on the chips.
  const [stageCounts, setStageCounts] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);

  // Server-side filters: order number, created-at range and payment status.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);

  const [cancelConfirm, setCancelConfirm] = useState(null); // { orderId, status }
  const [cancelReason, setCancelReason] = useState('SELLER_CANCELLED');
  const [rejectConfirm, setRejectConfirm] = useState(null); // { orderId }
  const [refundConfirm, setRefundConfirm] = useState(null); // { orderId }
  // A MoorMove rider brought back a parcel they couldn't deliver: { order }.
  const [parcelConfirm, setParcelConfirm] = useState(null);
  // Letting the buyer off a failed trip's delivery fee: { order }.
  const [waiveConfirm, setWaiveConfirm] = useState(null);
  // Handing an order over asks for a photo first: proof of delivery or of pickup.
  const [proofRequest, setProofRequest] = useState(null);
  // Shipping with a courier asks for the courier and the tracking number.
  const [shipRequest, setShipRequest] = useState(null);
  // The buyer a seller is filing a report against (to their municipal admin).
  const [reportBuyer, setReportBuyer] = useState(null);
  const [photo, setPhoto] = useState(null); // { uri, title }

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const hasFilters = Boolean(debouncedSearch || from || to || paymentFilter);

  // Only the newest request may set the list (tabs and filters change fast).
  const requestId = useRef(0);
  const loadOrders = useCallback(async ({ pull = false } = {}) => {
    const id = requestId.current + 1;
    requestId.current = id;
    const viewKey = page === 1 && !debouncedSearch && !from && !to && !paymentFilter ? cacheKey(activeTab) : null;
    const kept = viewKey ? getCacheEntry(viewKey)?.data : undefined;
    if (kept) {
      setOrders(kept.orders || []);
      if (kept.pagination) setPagination(kept.pagination);
      setIsLoading(false);
    } else if (!pull) {
      setIsLoading(true);
    }
    try {
      const res = await apiClient.get('/orders/store/orders', {
        params: {
          page,
          pageSize: PAGE_SIZE,
          status: activeTab !== 'all' ? (SELLER_TABS.find((tab) => tab.key === activeTab)?.status || activeTab) : undefined,
          search: debouncedSearch || undefined,
          from: from || undefined,
          to: to || undefined,
          paymentStatus: paymentFilter || undefined,
        },
      });
      // The chip counts, fresh with every load.
      apiClient.get('/orders/store/stages').then((r) => setStageCounts(r.data?.byStatus || {})).catch(() => {});
      if (id !== requestId.current) return;
      const loaded = Array.isArray(res.data) ? res.data : [];
      setOrders(loaded);
      if (res.pagination) setPagination(res.pagination);
      if (viewKey) setCachedData(viewKey, { orders: loaded, pagination: res.pagination || null });
    } catch (err) {
      if (id === requestId.current) toast.error(err.message || 'Failed to load orders');
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeTab, page, debouncedSearch, from, to, paymentFilter]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders({ pull: true });
  };

  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;
  const selectTab = useCallback((key) => {
    if (key === tabRef.current) return;
    tabRef.current = key;
    setActiveTab(key);
    setPage(1);
  }, []);

  // ?status=… picks the tab (also when a link opens this page again).
  useEffect(() => {
    if (params.status) selectTab(sellerTabFrom(params.status));
  }, [params.status, selectTab]);

  // ?id=<orderId> opens that order: from the list, or asked for on its own.
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = params.id;
    if (!targetId || isLoading || openedId.current === targetId) return;
    openedId.current = targetId;
    const match = orders.find((o) => o.id === targetId);
    if (match) {
      setSelectedOrder(match);
    } else {
      apiClient.get(`/orders/${targetId}`).then((r) => { if (r.data) setSelectedOrder(r.data); }).catch(() => {});
    }
    router.setParams({ id: undefined });
  }, [params.id, isLoading, orders, router]);
  // The same link may open the same order again later.
  useEffect(() => { if (!params.id) openedId.current = null; }, [params.id]);

  // After a step the order is in another tab: go there with it, and pick it
  // out, so the seller sees where it went.
  const [movedId, setMovedId] = useState(null);
  const movedTimer = useRef(null);
  useEffect(() => () => clearTimeout(movedTimer.current), []);
  const moveToTab = (orderId, status, note) => {
    const tab = sellerTabOf(status);
    const label = SELLER_TABS.find((x) => x.key === tab)?.label || STATUS_MAP[status]?.label || status;
    toast.success(note ? `${note}. Moved to ${label}.` : `Moved to ${label}`);
    setMovedId(orderId);
    if (tab !== activeTab) selectTab(tab);
    clearTimeout(movedTimer.current);
    movedTimer.current = setTimeout(() => setMovedId((cur) => (cur === orderId ? null : cur)), 3500);
  };
  useEffect(() => {
    if (!movedId || isLoading) return;
    const index = orders.findIndex((o) => o.id === movedId);
    if (index < 0) return;
    requestAnimationFrame(() => {
      try { listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true }); } catch { /* not laid out yet */ }
    });
  }, [movedId, isLoading, orders]);

  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFrom('');
    setTo('');
    setPaymentFilter('');
    setPage(1);
  };

  // Merge server-side changes (status/payment) into the list and the open sheet.
  const applyOrderUpdate = (orderId, changes) => {
    const clean = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...clean } : o)));
    setSelectedOrder((prev) => (prev?.id === orderId ? { ...prev, ...clean } : prev));
  };

  const handleStatusChange = async (orderId, newStatus, proofUrl, extra = {}) => {
    setUpdatingId(orderId);
    try {
      const res = await apiClient.put(`/orders/${orderId}/status`, { status: newStatus, ...(proofUrl ? { proofUrl } : {}), ...extra });
      moveToTab(orderId, res.data?.status || newStatus);
      applyOrderUpdate(orderId, {
        status: res.data?.status || newStatus,
        paymentStatus: res.data?.paymentStatus,
        fulfillmentProofUrl: res.data?.fulfillmentProofUrl,
        fulfillmentProofAt: res.data?.fulfillmentProofAt,
      });
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to update order');
      // 409: the order moved on under us (buyer cancelled, another device acted).
      // Refetch so the list shows the real state instead of a stale action.
      if (err.status === 409) loadOrders();
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  // PATCH /orders/:id/payment { paymentStatus: 'PAID' | 'FAILED' | 'REFUNDED' }.
  // Rejecting does not cancel the order: it stays open with its stock and
  // paymentStatus FAILED until the buyer resubmits proof.
  const handlePaymentDecision = async (orderId, paymentStatus) => {
    setVerifyingId(orderId);
    try {
      const res = await apiClient.patch(`/orders/${orderId}/payment`, { paymentStatus });
      applyOrderUpdate(orderId, {
        paymentStatus: res.data?.paymentStatus || paymentStatus,
        status: res.data?.status,
      });
      toast.success(PAYMENT_TOASTS[paymentStatus] || 'Payment updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update payment');
      loadOrders();
    } finally {
      setVerifyingId(null);
      setRejectConfirm(null);
      setRefundConfirm(null);
    }
  };

  const findOrder = (orderId) => orders.find((o) => o.id === orderId) || (selectedOrder?.id === orderId ? selectedOrder : null);

  const requestStatusChange = (orderId, newStatus) => {
    const order = findOrder(orderId);
    if (newStatus === 'CANCELLED') {
      setCancelConfirm({ orderId, status: order?.status, order });
      setCancelReason('SELLER_CANCELLED');
      return;
    }
    if (newStatus === 'SHIPPED') {
      setShipRequest({
        orderId,
        orderNumber: order?.orderNumber,
        courier: order?.courier || (order?.courierId ? { id: order.courierId, name: order.courierName } : null),
      });
      return;
    }
    const pickup = order?.fulfillmentMethod === 'PICKUP';
    if ((newStatus === 'DELIVERED' && !pickup) || (newStatus === 'PICKED_UP' && pickup)) {
      setProofRequest({ orderId, status: newStatus, kind: pickup ? 'PICKUP' : 'DELIVERY', orderNumber: order?.orderNumber });
      return;
    }
    handleStatusChange(orderId, newStatus);
  };

  const confirmProof = async (proofUrl) => {
    if (!proofRequest) return false;
    const ok = await handleStatusChange(proofRequest.orderId, proofRequest.status, proofUrl);
    if (ok) setProofRequest(null);
    return ok;
  };

  const confirmShip = async ({ courierId, trackingNumber }) => {
    if (!shipRequest) return false;
    const { orderId } = shipRequest;
    setUpdatingId(orderId);
    try {
      const res = await apiClient.patch(`/orders/${orderId}/ship`, { courierId, trackingNumber });
      applyOrderUpdate(orderId, {
        status: res.data?.status || 'SHIPPED',
        paymentStatus: res.data?.paymentStatus,
        courierId,
        courierName: res.data?.courierName,
        trackingNumber: res.data?.trackingNumber,
        shippedAt: res.data?.shippedAt,
        courier: shipRequest.courier || null,
      });
      moveToTab(orderId, res.data?.status || 'SHIPPED', 'Shipped. The buyer can now track it');
      setShipRequest(null);
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not ship the order');
      if (err.status === 409) loadOrders();
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  // POST /orders/:id/rider/parcel-returned: the parcel is back at the shop,
  // so the order can go with a rider again, be delivered by the shop, or be cancelled.
  const confirmParcelBack = async () => {
    const order = parcelConfirm?.order;
    if (!order) return;
    setUpdatingId(order.id);
    try {
      const res = await apiClient.post(`/orders/${order.id}/rider/parcel-returned`);
      if (res.data?.id) applyOrderUpdate(order.id, res.data);
      toast.success('Parcel back. Call a rider again or deliver it yourself.');
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Try again.');
      // 409: nothing is coming back any more (or not yet): show the order as it is now.
      if (err.status === 409) {
        loadOrders();
        apiClient.get(`/orders/${order.id}`).then((r) => { if (r.data?.id) applyOrderUpdate(order.id, r.data); }).catch(() => {});
      }
    } finally {
      setUpdatingId(null);
      setParcelConfirm(null);
    }
  };

  // POST /orders/:id/unpaid-fee/waive (:id is the order whose trip failed): the
  // buyer won't pay that trip's fee. The answer is the order as it is now.
  const confirmWaive = async () => {
    const order = waiveConfirm?.order;
    if (!order) return;
    setUpdatingId(order.id);
    try {
      const res = await apiClient.post(`/orders/${order.id}/unpaid-fee/waive`);
      if (res.data?.id) applyOrderUpdate(order.id, res.data);
      toast.success('Fee waived. The buyer won\'t pay it.');
    } catch (err) {
      toast.error(err.message || 'Something went wrong. Try again.');
      // 409: it was paid, or is part of an order already on its way: show it as it is now.
      if (err.status === 409) {
        apiClient.get(`/orders/${order.id}`).then((r) => { if (r.data?.id) applyOrderUpdate(order.id, r.data); }).catch(() => {});
      }
    } finally {
      setUpdatingId(null);
      setWaiveConfirm(null);
    }
  };

  const confirmCancelOrder = async () => {
    if (!cancelConfirm) return;
    await handleStatusChange(cancelConfirm.orderId, 'CANCELLED', null, { cancelReason });
    setCancelConfirm(null);
  };

  const filtersOn = Boolean(from || to || paymentFilter);

  const header = (
    <View>
      {/* The order-number search (in the page head on phones) with the filters behind its sliders button. */}
      <View style={[styles.search, searchFocus && styles.searchFocus]}>
        <MagnifyingGlassIcon size={15} color={t.neutral[500]} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Order number"
          placeholderTextColor={t.neutral[400]}
          accessibilityLabel="Search your orders by order number"
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          onFocus={() => setSearchFocus(true)}
          onBlur={() => setSearchFocus(false)}
          style={styles.searchInput}
        />
        {search ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} hitSlop={8} style={styles.searchClear}>
            <XIcon size={12} weight="bold" color={t.neutral[600]} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Filter by date or payment" onPress={() => setFilterOpen(true)} hitSlop={12} style={({ pressed }) => [styles.filterBtn, pressed && styles.filterBtnPressed]}>
          <SlidersHorizontalIcon size={17} weight="bold" color={t.neutral[600]} />
          {filtersOn ? <View style={styles.filterDot} /> : null}
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsRow} accessibilityRole="tablist">
        {SELLER_TABS.map((tab) => {
          const on = activeTab === tab.key;
          const n = tabCount(tab, stageCounts);
          return (
            <SellerChip key={tab.key} on={on} onPress={() => selectTab(tab.key)}>
              <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{tab.label}</Text>
              {n > 0 ? <View style={styles.tabCount}><Text style={styles.tabCountText}>{n}</Text></View> : null}
            </SellerChip>
          );
        })}
      </ScrollView>

      {!isLoading && pagination.total > 0 ? (
        <Text style={styles.count}>{pagination.total} order{pagination.total === 1 ? '' : 's'}</Text>
      ) : null}
    </View>
  );

  const empty = isLoading ? (
    <OrdersSkeleton />
  ) : (
    <EmptyState
      page
      art="orders"
      title={hasFilters ? 'No orders match your filters' : 'No orders in this category'}
      text={hasFilters ? 'Try a different order number, date range or payment status.' : 'New orders from buyers will appear here.'}
      actions={hasFilters ? [{ label: 'Clear filters', onPress: clearFilters }] : undefined}
    />
  );

  const footer = !isLoading && orders.length > 0 && pagination.totalPages > 1 ? (
    <View style={styles.pager}>
      <Pressable
        accessibilityRole="button"
        disabled={page <= 1 || isLoading}
        onPress={() => setPage((p) => Math.max(1, p - 1))}
        style={[styles.pagerBtn, (page <= 1 || isLoading) && styles.pagerOff]}
      >
        <Text style={styles.pagerBtnText}>Prev</Text>
      </Pressable>
      <Text style={styles.pagerText}>Page {page} of {pagination.totalPages}</Text>
      <Pressable
        accessibilityRole="button"
        disabled={page >= pagination.totalPages || isLoading}
        onPress={() => setPage((p) => p + 1)}
        style={[styles.pagerBtn, (page >= pagination.totalPages || isLoading) && styles.pagerOff]}
      >
        <Text style={styles.pagerBtnText}>Next</Text>
      </Pressable>
    </View>
  ) : null;

  return (
    <SellerPage scroll={false}>
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        ref={listRef}
        data={isLoading ? [] : orders}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            selected={selectedOrder?.id === item.id}
            moved={movedId === item.id}
            updating={updatingId === item.id}
            onDetails={(o) => setSelectedOrder((cur) => (cur?.id === o.id ? null : o))}
            onNext={(o, next) => requestStatusChange(o.id, next)}
          />
        )}
        extraData={`${selectedOrder?.id}|${movedId}|${updatingId}`}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={[sellerPageStyles.content, { flexGrow: 1, paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollToIndexFailed={({ averageItemLength, index }) => {
          listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true });
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />}
      />

      <OrderFilterSheet
        open={filterOpen}
        from={from}
        to={to}
        payment={paymentFilter}
        onFrom={applyFilter(setFrom)}
        onTo={applyFilter(setTo)}
        onPayment={applyFilter(setPaymentFilter)}
        onReset={clearFilters}
        onClose={() => setFilterOpen(false)}
      />

      <OrderDetailSheet
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        updatingId={updatingId}
        verifyingId={verifyingId}
        onStep={requestStatusChange}
        onPayment={handlePaymentDecision}
        onReject={(orderId) => setRejectConfirm({ orderId })}
        onRefund={(orderId) => setRefundConfirm({ orderId })}
        onReport={(buyer) => setReportBuyer(buyer)}
        onView={(uri, title) => setPhoto({ uri, title })}
        onParcelBack={(order) => setParcelConfirm({ order })}
        onWaive={(order) => setWaiveConfirm({ order })}
      />

      <ShipOrderSheet
        open={Boolean(shipRequest)}
        couriers={shipRequest?.courier ? [shipRequest.courier] : []}
        orderNumber={shipRequest?.orderNumber}
        onCancel={() => setShipRequest(null)}
        onConfirm={confirmShip}
      />
      <ProofPhotoSheet
        open={Boolean(proofRequest)}
        kind={proofRequest?.kind}
        orderNumber={proofRequest?.orderNumber}
        onCancel={() => setProofRequest(null)}
        onConfirm={confirmProof}
      />

      <OrderConfirmDialog
        open={Boolean(cancelConfirm)}
        title="Cancel this order?"
        message="The buyer will be notified and any reserved stock will be restored to your inventory. This cannot be undone."
        confirmLabel="Cancel Order"
        danger
        loading={Boolean(cancelConfirm) && updatingId === cancelConfirm?.orderId}
        onConfirm={confirmCancelOrder}
        onCancel={() => setCancelConfirm(null)}
      >
        {/* Paid online: what goes back to the buyer (less a failed trip's fee they cover). */}
        {refundNote(cancelConfirm?.order) ? <Text style={styles.dialogNote}>{refundNote(cancelConfirm.order)}</Text> : null}
        {/* Why (a no-show or a refusal goes on the buyer's record). */}
        <View style={styles.reasons} accessibilityRole="radiogroup" accessibilityLabel="Why">
          {cancelReasonsFor(cancelConfirm?.status, cancelConfirm?.order).map(([key, label]) => {
            const on = cancelReason === key;
            return (
              <Pressable
                key={key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setCancelReason(key)}
                style={[styles.reason, on && styles.reasonOn]}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <Text style={styles.reasonText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </OrderConfirmDialog>

      <OrderConfirmDialog
        open={Boolean(rejectConfirm)}
        title="Reject this payment?"
        message="Only reject if the payment did not arrive or the proof is invalid. The buyer will be asked to upload a new proof. The order and its stock are kept."
        confirmLabel="Reject Payment"
        danger
        loading={Boolean(rejectConfirm) && verifyingId === rejectConfirm?.orderId}
        onConfirm={() => handlePaymentDecision(rejectConfirm.orderId, 'FAILED')}
        onCancel={() => setRejectConfirm(null)}
      />

      <OrderConfirmDialog
        open={Boolean(refundConfirm)}
        title="Mark this order as refunded?"
        message="Only confirm once the buyer has actually received the money back. This records the refund on the order and cannot be undone."
        confirmLabel="Mark Refunded"
        loading={Boolean(refundConfirm) && verifyingId === refundConfirm?.orderId}
        onConfirm={() => handlePaymentDecision(refundConfirm.orderId, 'REFUNDED')}
        onCancel={() => setRefundConfirm(null)}
      />

      <OrderConfirmDialog
        open={Boolean(parcelConfirm)}
        title="Got the parcel back?"
        message={`Only confirm once the rider${parcelConfirm?.order?.riderDelivery?.riderName ? `, ${parcelConfirm.order.riderDelivery.riderName},` : ''} has brought the parcel${parcelConfirm?.order?.orderNumber ? ` for #${parcelConfirm.order.orderNumber}` : ''} back to your shop. Then you can call a rider again, deliver it yourself, or cancel the order.`}
        confirmLabel="Parcel back"
        cancelLabel="Not now"
        loading={Boolean(parcelConfirm) && updatingId === parcelConfirm?.order?.id}
        onConfirm={confirmParcelBack}
        onCancel={() => setParcelConfirm(null)}
      >
        {/* Who pays the rider for the failed trip. */}
        {parcelBackNote(parcelConfirm?.order) ? <Text style={styles.dialogNote}>{parcelBackNote(parcelConfirm.order)}</Text> : null}
      </OrderConfirmDialog>

      <OrderConfirmDialog
        open={Boolean(waiveConfirm)}
        title="Waive this fee?"
        message={waiveConfirm?.order?.unpaidFee
          ? `The buyer won't pay the ${peso(waiveConfirm.order.unpaidFee.amount)} delivery fee for the failed trip${waiveConfirm.order.orderNumber ? ` of #${waiveConfirm.order.orderNumber}` : ''}, and can use cash on delivery at your shop again. This can't be undone.`
          : ''}
        confirmLabel="Waive fee"
        cancelLabel="Not now"
        loading={Boolean(waiveConfirm) && updatingId === waiveConfirm?.order?.id}
        onConfirm={confirmWaive}
        onCancel={() => setWaiveConfirm(null)}
      />

      {reportBuyer ? (
        <BuyerReportSheet
          reportedBuyerId={reportBuyer.id}
          targetName={reportBuyer.fullName || 'this buyer'}
          onClose={() => setReportBuyer(null)}
        />
      ) : null}

      <PhotoViewer uri={photo?.uri} title={photo?.title} onClose={() => setPhoto(null)} />
    </SellerPage>
  );
}

function Separator() {
  return <View style={styles.sep} />;
}

const styles = StyleSheet.create({
  // .seller-search in the page head (SellerPhoneFit.css): full width, 48 high, 12px corners.
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 48, marginBottom: 12, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  searchFocus: { borderColor: t.primary[600] },
  searchInput: {
    flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 16, ...font(400), color: t.neutral[900], outlineStyle: 'none',
  },
  searchClear: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[200] },
  // .so-filter-btn as the website draws it (.seller-search button wins): an 18px grey round.
  filterBtn: {
    width: 18, height: 18, marginLeft: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[200],
  },
  filterBtnPressed: { backgroundColor: t.neutral[300] },
  filterDot: { position: 'absolute', top: -2, right: -2, width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent[500] },

  // .scm-chips.so-stage-chips: one row, scrolling sideways.
  chips: { flexGrow: 0, marginBottom: 12 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chipText: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[700] },
  chipTextOn: { color: '#fff' },
  // .so-tab-count (6px after the chip's own 6px gap)
  tabCount: {
    minWidth: 18, height: 18, marginLeft: 6, paddingHorizontal: 5, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#ee4d2d',
  },
  tabCountText: { fontSize: 11, lineHeight: 14, ...font(700), color: '#fff' },
  // .som-count
  count: { marginTop: -4, marginHorizontal: 2, marginBottom: 10, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },

  sep: { height: 10 },

  // .so-pagination on phones
  pager: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 12, padding: 16,
    borderRadius: 12, backgroundColor: t.neutral[0],
  },
  pagerBtn: {
    minHeight: 40, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  pagerOff: { opacity: 0.4 },
  pagerBtnText: { fontSize: 13, lineHeight: 20, ...font(500), color: t.neutral[700] },
  pagerText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },

  // A line of money under a dialog's question (who pays the rider, what is refunded).
  dialogNote: { marginTop: 10, fontSize: 14, lineHeight: 21, ...font(600), color: t.neutral[800] },

  // .so-cancel-reasons
  reasons: { gap: 6, marginTop: 12 },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8,
  },
  reasonOn: { borderColor: t.danger[300], backgroundColor: t.danger[50] },
  radio: {
    width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: t.neutral[400],
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  radioOn: { borderColor: t.danger[600] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.danger[600] },
  reasonText: { flex: 1, fontSize: 13.5, lineHeight: 20, ...font(400), color: t.neutral[800] },
});
