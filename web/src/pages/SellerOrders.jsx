import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, CheckCircle, XCircle, Clock, Package, Truck, FileText, Storefront as StoreIcon, MagnifyingGlass, X, Flag, SlidersHorizontal } from '@phosphor-icons/react';
import { usePhoneLayout } from '../hooks/useMobileNav';
import PhoneSheet from '../components/seller/PhoneSheet';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { resolveImg } from '../lib/media';
import EmptyArt from '../components/ui/EmptyArt';
import SellerPageHead from '../components/seller/SellerPageHead';
import ReportModal from '../components/ReportModal';
import './SellerDashboard.css';
import './SellerOrders.css';
import ProofPhotoSheet, { OrderProof } from '../components/orders/ProofPhotoSheet';
import ShipOrderSheet from '../components/orders/ShipOrderSheet';
import CourierTracking from '../components/orders/CourierTracking';
import {
  SELLER_TABS, sellerTabFrom, sellerTabCount, sellerTabOf, sellerNext,
} from '../lib/orderProgress';
import '../components/orders/OrderStatusPanel.css';
import Spinner from '../components/ui/Spinner';
import { readCache, writeCache } from '../lib/pageCache';
import { momentLabel, spanLabel } from '../lib/availability';
import TimeLeft from '../components/ui/TimeLeft';

// Available Today orders carry a time to confirm by (respondBy); unconfirmed
// by then, they cancel on their own.
const TodayTag = ({ order }) => {
  if (!order?.respondBy) return null;
  const waiting = order.status === 'PENDING';
  return (
    <div className="so-today">
      <span className="so-today-badge">Today</span>
      {waiting
        ? <TimeLeft until={order.respondBy} prefix="Confirm in" className="so-today-due" />
        : order.etaFrom && !['CANCELLED', 'DELIVERED', 'COMPLETED'].includes(order.status) && (
          <span className="so-today-ready">Ready {spanLabel(order.etaFrom, order.etaTo || order.etaFrom)}</span>
        )}
    </div>
  );
};

// How many orders a tab holds (open steps only; not All, Completed, Cancelled).
const tabCount = (t, byStatus) => (t.key === 'all' || t.final ? 0 : sellerTabCount(t, byStatus));

const STATUS_MAP = {
  PENDING: { label: 'New Order', cls: 'status-pending', icon: <Clock size={13} /> },
  CONFIRMED: { label: 'Confirmed', cls: 'status-confirmed', icon: <CheckCircle size={13} /> },
  PREPARING: { label: 'Preparing', cls: 'status-preparing', icon: <Package size={13} /> },
  TO_SHIP: { label: 'To Ship', cls: 'status-preparing', icon: <Package size={13} /> },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'status-ready', icon: <Truck size={13} /> },
  SHIPPED: { label: 'Shipped', cls: 'status-ready', icon: <Truck size={13} /> },
  DELIVERED: { label: 'Delivered', cls: 'status-completed', icon: <CheckCircle size={13} /> },
  READY: { label: 'Ready', cls: 'status-ready', icon: <Truck size={13} /> },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', cls: 'status-ready', icon: <StoreIcon size={13} /> },
  PICKED_UP: { label: 'Picked Up', cls: 'status-completed', icon: <CheckCircle size={13} /> },
  COMPLETED: { label: 'Completed', cls: 'status-completed', icon: <CheckCircle size={13} /> },
  CANCELLED: { label: 'Cancelled', cls: 'status-cancelled', icon: <XCircle size={13} /> },
};

// Fulfillment-aware next-status resolution. Mirrors the backend map in
// order.service.js updateOrderStatus exactly: the first entry is the primary
// "next" action, CANCELLED is offered wherever the server allows it.
// The one next step for each status. Delivery orders the buyer sent with a
// courier are shipped with it; the rest the seller delivers. Delivered and
// picked-up orders wait for the buyer (or complete on their own).
const NEXT_STEP = {
  DELIVERY: {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'TO_SHIP',
    PREPARING: 'TO_SHIP',
    TO_SHIP: (o) => (o.courierId ? 'SHIPPED' : 'OUT_FOR_DELIVERY'),
    OUT_FOR_DELIVERY: 'DELIVERED',
    READY: 'COMPLETED',
  },
  PICKUP: {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'READY_FOR_PICKUP',
    PREPARING: 'READY_FOR_PICKUP',
    READY_FOR_PICKUP: 'PICKED_UP',
    READY: 'COMPLETED',
  },
};
const CANCELLABLE = ['PENDING', 'CONFIRMED', 'PREPARING', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'READY_FOR_PICKUP', 'READY'];

const PAYMENT_LABELS = {
  PENDING: { label: 'Unpaid', cls: 'status-pending' },
  PENDING_VERIFICATION: { label: 'Payment to verify', cls: 'status-pending' },
  PAID: { label: 'Paid', cls: 'status-completed' },
  FAILED: { label: 'Proof rejected — awaiting resubmission', cls: 'status-cancelled' },
  EXPIRED: { label: 'Payment expired', cls: 'status-cancelled' },
  REFUNDED: { label: 'Refunded', cls: 'status-cancelled' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', cls: 'status-cancelled' },
};

const PAYMENT_FILTERS = [
  { key: '', label: 'Any payment' },
  ...Object.entries(PAYMENT_LABELS).map(([key, v]) => ({ key, label: v.label })),
];

const PAGE_SIZE = 20;

// A QR order is paid after the seller confirms it: before that nothing is
// due; after it, the buyer pays from To Pay and the seller confirms it.
const qrUnpaid = (order) => order?.paymentMethod && order.paymentMethod !== 'COD' && order.paymentStatus === 'PENDING';
const paymentBadge = (order) => {
  if (qrUnpaid(order) && order.status === 'PENDING') return { label: 'Paid after you confirm', cls: 'status-pending' };
  if (qrUnpaid(order) && order.status === 'CONFIRMED') return { label: 'Waiting for payment', cls: 'status-pending' };
  return PAYMENT_LABELS[order?.paymentStatus] || null;
};

// A cancelled order the buyer paid for (verified, or a proof left unchecked
// past its deadline): the shop records the refund once the money is back.
// Why a seller cancels; a no-show and a refusal count on the buyer's record.
const cancelReasonsFor = (status) => [
  ['SELLER_CANCELLED', 'I can\'t fill this order'],
  ['OUT_OF_STOCK', 'Out of stock'],
  ...(['READY_FOR_PICKUP', 'READY'].includes(status) ? [['NO_SHOW', 'The buyer didn\'t come to pick it up']] : []),
  ...(status === 'OUT_FOR_DELIVERY' ? [['REFUSED', 'The buyer refused the delivery']] : []),
];

/** The buyer's last year at a glance: finished orders, and any that fell through on their side. */
function BuyerRecord({ orderId }) {
  const [record, setRecord] = useState(null);
  useEffect(() => {
    let cancelled = false;
    axios.get(`/orders/${orderId}/buyer-record`)
      .then((res) => { if (!cancelled) setRecord(res.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orderId]);
  if (!record) return null;
  const issues = [
    record.noShows && `${record.noShows} no-show${record.noShows === 1 ? '' : 's'}`,
    record.refused && `${record.refused} refused`,
    record.unpaid && `${record.unpaid} unpaid`,
  ].filter(Boolean);
  return (
    <span className={`so-buyer-record${issues.length ? ' is-warn' : ''}`} title="This buyer's orders in the last 12 months, at any shop">
      {record.completed} order{record.completed === 1 ? '' : 's'} completed{issues.length ? ` · ${issues.join(' · ')}` : ''}{record.phoneVerified ? ' · verified number' : ''}
    </span>
  );
}

const canMarkRefunded = (order) => ['PAID', 'PENDING_VERIFICATION'].includes(order?.paymentStatus) && order?.status === 'CANCELLED';

// Prepaid orders cannot move past confirmation until the payment is verified
// (the backend enforces the same rule).
const isAwaitingPayment = (order) => Boolean(order?.paymentMethod)
  && order.paymentMethod !== 'COD'
  && order.paymentStatus !== 'PAID';

/** The one next step, or null (waiting for the buyer's payment, or for the buyer). */
function nextStep(order) {
  const step = NEXT_STEP[order?.fulfillmentMethod === 'PICKUP' ? 'PICKUP' : 'DELIVERY'][order?.status];
  const to = typeof step === 'function' ? step(order) : step;
  if (!to) return null;
  // A QR order goes on only once its payment is confirmed.
  if (to !== 'CONFIRMED' && isAwaitingPayment(order)) return null;
  return to;
}
const canCancel = (order) => CANCELLABLE.includes(order?.status);

const ACTION_LABELS = {
  CONFIRMED: { label: 'Confirm order', cls: 'action-confirm' },
  PREPARING: { label: 'Start packing', cls: 'action-prepare' },
  TO_SHIP: { label: 'Packed: ready to ship', cls: 'action-prepare' },
  OUT_FOR_DELIVERY: { label: 'Out for delivery', cls: 'action-ready' },
  SHIPPED: { label: 'Ship with courier', cls: 'action-ready' },
  DELIVERED: { label: 'Mark delivered', cls: 'action-complete' },
  READY: { label: 'Mark ready', cls: 'action-ready' },
  READY_FOR_PICKUP: { label: 'Ready for pickup', cls: 'action-ready' },
  PICKED_UP: { label: 'Mark picked up', cls: 'action-complete' },
  COMPLETED: { label: 'Mark completed', cls: 'action-complete' },
  CANCELLED: { label: 'Cancel order', cls: 'action-cancel' },
};

export default function SellerOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  // The buyer a seller is filing a report against, or null when the dialog is
  // closed. Reports route to the buyer's own municipal admin.
  const [reportBuyer, setReportBuyer] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    return sellerTabFrom(searchParams.get('status'));
  });
  // Each tab's first page as it showed last time: shown at once while it is
  // asked for again.
  const [saved] = useState(() => readCache(`seller:orders:${activeTab}`));
  const [orders, setOrders] = useState(() => saved?.orders || []);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [selectedOrder, setSelectedOrder] = useState(null);
  // Orders per stage, for the counts on the tabs.
  const [stageCounts, setStageCounts] = useState({});
  const [updatingId, setUpdatingId] = useState(null);
  // Server-side filters: order number search, created-at range and payment
  // status, all sent as query params to GET /orders/store/orders.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(() => saved?.pagination || { total: 0, totalPages: 1, hasNext: false });
  const [cancelConfirm, setCancelConfirm] = useState(null); // { orderId, status }
  const [cancelReason, setCancelReason] = useState('SELLER_CANCELLED');
  const [rejectConfirm, setRejectConfirm] = useState(null); // { orderId }
  const [refundConfirm, setRefundConfirm] = useState(null); // { orderId }
  const [verifyingId, setVerifyingId] = useState(null);
  // Phones: a few status chips on one row; everything else in a sheet.
  const isPhone = usePhoneLayout();
  const [filterOpen, setFilterOpen] = useState(false);

  // Typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    loadOrders();
  }, [activeTab, page, debouncedSearch, from, to, paymentFilter]);

  const selectTab = (key) => {
    if (key === activeTab) return;
    setActiveTab(key);
    setPage(1);
  };

  // After a step the order is in another tab: go there with it, and pick
  // it out, so the seller sees where it went.
  const [movedId, setMovedId] = useState(null);
  const moveToTab = (orderId, status, note) => {
    const tab = sellerTabOf(status);
    const label = SELLER_TABS.find((t) => t.key === tab)?.label || STATUS_MAP[status]?.label || status;
    toast.success(note ? `${note}. Moved to ${label}.` : `Moved to ${label}`);
    setMovedId(orderId);
    if (tab !== activeTab) selectTab(tab);
    setTimeout(() => setMovedId((id) => (id === orderId ? null : id)), 3500);
  };
  useEffect(() => {
    if (!movedId || isLoading) return;
    document.getElementById(`so-row-${movedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [movedId, isLoading, orders]);

  const applyFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const hasFilters = Boolean(debouncedSearch || from || to || paymentFilter);

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFrom('');
    setTo('');
    setPaymentFilter('');
    setPage(1);
  };

  const loadOrders = async () => {
    const viewKey = page === 1 && !debouncedSearch && !from && !to && !paymentFilter
      ? `seller:orders:${activeTab}`
      : null;
    const kept = viewKey ? readCache(viewKey) : undefined;
    if (kept) {
      setOrders(kept.orders || []);
      if (kept.pagination) setPagination(kept.pagination);
    } else {
      setIsLoading(true);
    }
    try {
      const params = {
        page,
        pageSize: PAGE_SIZE,
        status: activeTab !== 'all' ? (SELLER_TABS.find((t) => t.key === activeTab)?.status || activeTab) : undefined,
        search: debouncedSearch || undefined,
        from: from || undefined,
        to: to || undefined,
        paymentStatus: paymentFilter || undefined,
      };
      const res = await axios.get('/orders/store/orders', { params });
      // The tab counts, fresh with every load.
      axios.get('/orders/store/stages').then((r) => setStageCounts(r.data?.byStatus || {})).catch(() => {});
      const loaded = res.data || [];
      setOrders(loaded);
      if (res.pagination) setPagination(res.pagination);
      if (viewKey) writeCache(viewKey, { orders: loaded, pagination: res.pagination || null });
      // Deep-link support: /seller/orders?id=<orderId> opens that order's detail panel
      const targetId = searchParams.get('id');
      if (targetId) {
        const match = loaded.find((o) => o.id === targetId);
        if (match) {
          setSelectedOrder(match);
        } else {
          // Not on this page; fetch it directly so the link still works.
          axios.get(`/orders/${targetId}`).then((r) => { if (r.data) setSelectedOrder(r.data); }).catch(() => {});
        }
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.delete('id');
          return next;
        }, { replace: true });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus, proofUrl, extra = {}) => {
    setUpdatingId(orderId);
    try {
      const res = await axios.put(`/orders/${orderId}/status`, { status: newStatus, ...(proofUrl ? { proofUrl } : {}), ...extra });
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
      // 409: the order moved on under us (buyer cancelled, another tab acted).
      // Refetch so the list shows the real state instead of a stale action.
      if (err.status === 409) loadOrders();
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  // Merge server-side changes (status/payment) into the list and detail panel.
  function applyOrderUpdate(orderId, changes) {
    const clean = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...clean } : o)));
    setSelectedOrder((prev) => (prev?.id === orderId ? { ...prev, ...clean } : prev));
  }

  const PAYMENT_TOASTS = {
    PAID: 'Payment confirmed. You can now prepare the order.',
    FAILED: 'Payment rejected — the buyer will be asked to upload a new proof',
    REFUNDED: 'Refund recorded',
  };

  // PATCH /orders/:id/payment { paymentStatus: 'PAID' | 'FAILED' | 'REFUNDED' }.
  // Rejecting no longer cancels the order: it stays open with its stock and
  // paymentStatus FAILED until the buyer resubmits proof.
  const handlePaymentDecision = async (orderId, paymentStatus) => {
    setVerifyingId(orderId);
    try {
      const res = await axios.patch(`/orders/${orderId}/payment`, { paymentStatus });
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

  const displayed = orders;

  // Handing an order over asks for a photo first: proof of delivery or of pickup.
  const [proofRequest, setProofRequest] = useState(null);
  // Shipping with a courier asks for the courier and the tracking number.
  const [shipRequest, setShipRequest] = useState(null);

  const requestStatusChange = (orderId, newStatus) => {
    if (newStatus === 'CANCELLED') {
      const target = orders.find((o) => o.id === orderId) || (selectedOrder?.id === orderId ? selectedOrder : null);
      setCancelConfirm({ orderId, status: target?.status });
      setCancelReason('SELLER_CANCELLED');
      return;
    }
    const order = orders.find((o) => o.id === orderId) || (selectedOrder?.id === orderId ? selectedOrder : null);
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
    if (!proofRequest) return;
    const ok = await handleStatusChange(proofRequest.orderId, proofRequest.status, proofUrl);
    if (ok) setProofRequest(null);
    return ok;
  };

  const confirmShip = async ({ courierId, trackingNumber }) => {
    if (!shipRequest) return false;
    const { orderId } = shipRequest;
    setUpdatingId(orderId);
    try {
      const res = await axios.patch(`/orders/${orderId}/ship`, { courierId, trackingNumber });
      const courier = shipRequest.courier || null;
      applyOrderUpdate(orderId, {
        status: res.data?.status || 'SHIPPED',
        paymentStatus: res.data?.paymentStatus,
        courierId,
        courierName: res.data?.courierName,
        trackingNumber: res.data?.trackingNumber,
        shippedAt: res.data?.shippedAt,
        courier,
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

  const confirmCancelOrder = async () => {
    if (!cancelConfirm) return;
    await handleStatusChange(cancelConfirm.orderId, 'CANCELLED', null, { cancelReason });
    setCancelConfirm(null);
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Orders"
          subtitle="Manage incoming orders from buyers"
          actions={(
            <div className="seller-search">
              <MagnifyingGlass size={15} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order number"
                aria-label="Search your orders by order number"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                  <X size={12} weight="bold" />
                </button>
              )}
              {isPhone && (
                <button type="button" className="so-filter-btn" onClick={() => setFilterOpen(true)} aria-label="Filter by date or payment">
                  <SlidersHorizontal size={17} weight="bold" />
                  {(from || to || paymentFilter) && <span className="scm-chip-dot" />}
                </button>
              )}
            </div>
          )}
        />

        {isPhone ? (
          <>
            <div className="scm-chips so-stage-chips" role="tablist" aria-label="Show orders">
              {SELLER_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.key}
                  className={`scm-chip${activeTab === t.key ? ' is-on' : ''}`}
                  onClick={() => selectTab(t.key)}
                >
                  {t.label}
                  {tabCount(t, stageCounts) > 0 && <em className="so-tab-count">{tabCount(t, stageCounts)}</em>}
                </button>
              ))}
            </div>
            {!isLoading && pagination.total > 0 && (
              <p className="som-count">{pagination.total} order{pagination.total === 1 ? '' : 's'}</p>
            )}
            <PhoneSheet
              open={filterOpen}
              title="Filter orders"
              onClose={() => setFilterOpen(false)}
              footer={(
                <>
                  <button type="button" className="scm-btn scm-btn--ghost" onClick={() => clearFilters()}>
                    Reset
                  </button>
                  <button type="button" className="scm-btn" onClick={() => setFilterOpen(false)}>Done</button>
                </>
              )}
            >
              <span className="scm-sheet-label">Date ordered</span>
              <div className="scm-field-row">
                <label className="scm-field">
                  From
                  <input type="date" value={from} max={to || undefined} onChange={(e) => applyFilter(setFrom)(e.target.value)} />
                </label>
                <label className="scm-field">
                  To
                  <input type="date" value={to} min={from || undefined} onChange={(e) => applyFilter(setTo)(e.target.value)} />
                </label>
              </div>
              <span className="scm-sheet-label">Payment</span>
              <label className="scm-field">
                <select value={paymentFilter} onChange={(e) => applyFilter(setPaymentFilter)(e.target.value)} aria-label="Payment">
                  {PAYMENT_FILTERS.map((p) => (
                    <option key={p.key || 'any'} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </label>
            </PhoneSheet>
          </>
        ) : (
        <>
        {/* Tabs */}
        <div className="seller-tabs">
          {SELLER_TABS.map(t => (
            <button
              key={t.key}
              className={`seller-tab ${activeTab === t.key ? 'seller-tab--active' : ''}`}
              onClick={() => selectTab(t.key)}
            >
              {t.label}
              {tabCount(t, stageCounts) > 0 && <em className="so-tab-count">{tabCount(t, stageCounts)}</em>}
            </button>
          ))}
        </div>

        {/* Date range + payment status filters (server-side) */}
        <div className="so-filters">
          <label className="so-filter">
            <span>From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => applyFilter(setFrom)(e.target.value)} />
          </label>
          <label className="so-filter">
            <span>To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => applyFilter(setTo)(e.target.value)} />
          </label>
          <label className="so-filter">
            <span>Payment</span>
            <select value={paymentFilter} onChange={(e) => applyFilter(setPaymentFilter)(e.target.value)}>
              {PAYMENT_FILTERS.map((p) => (
                <option key={p.key || 'any'} value={p.key}>{p.label}</option>
              ))}
            </select>
          </label>
          {hasFilters && (
            <button type="button" className="btn-seller-outline so-filter-clear" onClick={clearFilters}>
              <X size={12} weight="bold" /> Clear
            </button>
          )}
          {!isLoading && pagination.total > 0 && (
            <span className="so-filter-count">{pagination.total} order{pagination.total === 1 ? '' : 's'}</span>
          )}
        </div>
        </>
        )}

        <div className={`orders-layout${selectedOrder ? '' : ' is-single'}`}>
          {/* Order list */}
          <div className="seller-card orders-list-card">
            {isLoading ? (
              <Skeleton.Table cols={6} rows={6} />
            ) : displayed.length === 0 ? (
              <div className="seller-empty is-page">
                <EmptyArt name="orders" size={168} />
                <strong>{hasFilters ? 'No orders match your filters' : 'No orders in this category'}</strong>
                <p>
                  {hasFilters
                    ? 'Try a different order number, date range or payment status.'
                    : 'New orders from buyers will appear here.'}
                </p>
                {hasFilters && (
                  <button type="button" className="btn-seller-outline" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
              <table className="seller-table so-orders-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Order #</th>
                    <th>Products</th>
                    <th style={{ width: 180 }}>Buyer</th>
                    <th style={{ width: 110 }}>Total</th>
                    <th style={{ width: 130 }}>Status</th>
                    <th style={{ width: 110 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(order => {
                    const s = STATUS_MAP[order.status] || { label: order.status, cls: '' };
                    const next = nextStep(order);
                    const isUpdating = updatingId === order.id;
                    const items = order.items || [];
                    const totalQty = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
                    const orderDate = order.createdAt
                      ? new Date(order.createdAt).toLocaleDateString('en-PH', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })
                      : '';
                    return (
                      <tr
                        key={order.id}
                        id={`so-row-${order.id}`}
                        className={`${selectedOrder?.id === order.id ? 'row-selected' : ''}${movedId === order.id ? ' is-moved' : ''}`.trim()}
                      >
                        <td className="order-num">
                          <div>#{order.orderNumber || order.id.slice(-6).toUpperCase()}</div>
                          {orderDate && <div className="so-order-date">{orderDate}</div>}
                          <TodayTag order={order} />
                        </td>
                        <td>
                          <div className="so-products">
                            <div className="so-product-thumbs">
                              {items.slice(0, 3).map((it) => {
                                const src = resolveImg(it.product?.images?.[0]);
                                return (
                                  <div key={it.id} className="so-product-thumb" title={it.product?.name}>
                                    {src ? (
                                      <img
                                        src={src}
                                        alt={it.product?.name || 'Product'}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                      />
                                    ) : (
                                      <span className="so-product-thumb-fallback">
                                        <Package size={14} />
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                              {items.length > 3 && (
                                <div className="so-product-thumb so-product-more">+{items.length - 3}</div>
                              )}
                            </div>
                            <div className="so-product-summary">
                              {items.length === 0 ? (
                                <span className="so-product-name">No items</span>
                              ) : (
                                <>
                                  <span className="so-product-name">
                                    {items[0].product?.name || 'Product'}
                                    {items.length > 1 && (
                                      <span className="so-product-extra"> +{items.length - 1} more</span>
                                    )}
                                  </span>
                                  <span className="so-product-meta">
                                    {items.length} {items.length === 1 ? 'item' : 'items'} · Qty {totalQty}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="so-buyer">
                            {order.buyer?.id ? (
                              <Link to={`/u/${order.buyer.id}`} className="so-buyer-name profile-link" title="View buyer profile">
                                {order.buyer.fullName || 'Buyer'}
                              </Link>
                            ) : (
                              <span className="so-buyer-name">{order.buyer?.fullName || 'Buyer'}</span>
                            )}
                            {order.buyer?.contactNumber && (
                              <span className="so-buyer-meta">{order.buyer.contactNumber}</span>
                            )}
                          </div>
                        </td>
                        <td>₱{Number(order.total).toFixed(2)}</td>
                        <td>
                          <span className={`seller-badge seller-badge--solid ${s.cls}`}>
                            {s.label}
                          </span>
                        </td>
                        <td>
                          <div className="order-row-actions">
                            <button
                              className="seller-icon-btn"
                              title="View details"
                              aria-label="View order details"
                              onClick={() => setSelectedOrder(
                                selectedOrder?.id === order.id ? null : order
                              )}
                            >
                              <Eye size={15} /><span className="so-action-label">Details</span>
                            </button>
                            {next && (
                              <button
                                type="button"
                                className="so-next-btn"
                                disabled={isUpdating}
                                onClick={() => requestStatusChange(order.id, next)}
                              >
                                {isUpdating ? <Spinner size={14} /> : null}
                                <span>{ACTION_LABELS[next]?.label || next}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagination.totalPages > 1 && (
                <div className="so-pagination">
                  <button
                    type="button"
                    className="btn-seller-outline so-pagination-btn"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <span>Page {page} of {pagination.totalPages}</span>
                  <button
                    type="button"
                    className="btn-seller-outline so-pagination-btn"
                    disabled={page >= pagination.totalPages || isLoading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
              </>
            )}
          </div>

          {/* Order detail panel */}
          {selectedOrder && (
            <div className="seller-card order-detail-panel">
              <div className="seller-card-header">
                <h2>Order #{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}</h2>
                <button className="seller-icon-btn" onClick={() => setSelectedOrder(null)}>
                  <XCircle size={16} />
                </button>
              </div>
              <div className="order-detail-body">
                {/* Status */}
                <div className="detail-row">
                  <span>Status</span>
                  <span className={`seller-badge seller-badge--solid ${STATUS_MAP[selectedOrder.status]?.cls}`}>
                    {STATUS_MAP[selectedOrder.status]?.label || selectedOrder.status}
                  </span>
                </div>

                {selectedOrder.respondBy && (
                  <div className="detail-row detail-row--col so-today-detail">
                    <span>Available Today</span>
                    <p>
                      {selectedOrder.status === 'PENDING'
                        ? `Confirm by ${momentLabel(selectedOrder.respondBy)}, or it cancels on its own. `
                        : ''}
                      {selectedOrder.etaFrom ? `The buyer expects it ${spanLabel(selectedOrder.etaFrom, selectedOrder.etaTo || selectedOrder.etaFrom)}.` : ''}
                    </p>
                  </div>
                )}

                {(() => {
                  const next = sellerNext(selectedOrder);
                  return next.title ? (
                    <div className={`osp is-full so-next-panel is-${next.tone}`}>
                      <div className="osp-head-text">
                        <strong>{next.title}</strong>
                        {next.text && <p>{next.text}</p>}
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Buyer */}
                <div className="detail-row">
                  <span>Buyer</span>
                  <strong className="so-buyer-cell">
                    {selectedOrder.buyer?.id
                      ? <Link to={`/u/${selectedOrder.buyer.id}`} className="profile-link" title="View buyer profile">{selectedOrder.buyer.fullName || '—'}</Link>
                      : (selectedOrder.buyer?.fullName || '—')}
                    <BuyerRecord orderId={selectedOrder.id} />
                    {selectedOrder.buyer?.id && (
                      <button
                        type="button"
                        className="so-report-buyer"
                        onClick={() => setReportBuyer(selectedOrder.buyer)}
                        title="Report this buyer to their municipal admin"
                      >
                        <Flag size={14} /> Report
                      </button>
                    )}
                  </strong>
                </div>

                <div className="detail-row">
                  <span>Contact</span>
                  <strong>{selectedOrder.contactNumber || '—'}</strong>
                </div>

                <div className="detail-row">
                  <span>Fulfillment</span>
                  <strong>{selectedOrder.fulfillmentMethod === 'PICKUP' ? 'Store Pickup' : 'Delivery'}</strong>
                </div>

                {selectedOrder.fulfillmentMethod !== 'PICKUP' && (
                  <div className="detail-row">
                    <span>Delivered by</span>
                    <strong>
                      {selectedOrder.courierId
                        ? `${selectedOrder.courierName || selectedOrder.courier?.name} (buyer's choice)${selectedOrder.shippingWeightGrams ? ` · ${(selectedOrder.shippingWeightGrams / 1000).toLocaleString('en-PH', { maximumFractionDigits: 2 })} kg` : ''}`
                        : 'You'}
                    </strong>
                  </div>
                )}

                <div className="detail-row">
                  <span>Payment</span>
                  <strong>
                    {selectedOrder.paymentMethod || 'COD'}
                    {selectedOrder.paymentReference && ` — Ref: ${selectedOrder.paymentReference}`}
                  </strong>
                </div>

                {selectedOrder.paymentStatus && (
                  <div className="detail-row">
                    <span>Payment status</span>
                    <span className={`seller-badge seller-badge--solid ${paymentBadge(selectedOrder)?.cls || ''}`}>
                      {paymentBadge(selectedOrder)?.label || selectedOrder.paymentStatus}
                    </span>
                  </div>
                )}

                {qrUnpaid(selectedOrder) && selectedOrder.status === 'PENDING' && (
                  <div className="so-payment-review">
                    <p>The buyer pays with your QR after you confirm this order. Confirm it if you can fill it; they&apos;ll be told to pay right away.</p>
                  </div>
                )}

                {qrUnpaid(selectedOrder) && selectedOrder.status === 'CONFIRMED' && (
                  <div className="so-payment-review">
                    <p>Waiting for the buyer to pay with your QR. You&apos;ll be notified when they send the reference and screenshot, then you confirm the payment and prepare the order. If they don&apos;t pay within 48 hours, the order is cancelled and its stock comes back.</p>
                  </div>
                )}

                {selectedOrder.paymentStatus === 'PENDING_VERIFICATION' && selectedOrder.status !== 'CANCELLED' && (
                  <div className="so-payment-review">
                    <p>The buyer says they paid. Check the reference number and screenshot below against your GCash or bank records, then confirm the payment.</p>
                    <div className="so-payment-actions">
                      <button
                        type="button"
                        className="so-payment-btn so-payment-btn--approve"
                        disabled={verifyingId === selectedOrder.id}
                        onClick={() => handlePaymentDecision(selectedOrder.id, 'PAID')}
                      >
                        <CheckCircle size={16} /> Confirm payment
                      </button>
                      <button
                        type="button"
                        className="so-payment-btn so-payment-btn--reject"
                        disabled={verifyingId === selectedOrder.id}
                        onClick={() => setRejectConfirm({ orderId: selectedOrder.id })}
                      >
                        <XCircle size={16} /> Reject payment
                      </button>
                    </div>
                  </div>
                )}

                {selectedOrder.paymentStatus === 'FAILED' && selectedOrder.status !== 'CANCELLED' && (
                  <div className="so-payment-review">
                    <p>The proof was rejected. The order and its stock are kept while the buyer uploads a new one; it expires automatically if they don't.</p>
                  </div>
                )}

                {canMarkRefunded(selectedOrder) && (
                  <div className="so-payment-review">
                    <p>This prepaid order was cancelled after payment. Once you have returned the money to the buyer, record it here.</p>
                    <div className="so-payment-actions">
                      <button
                        type="button"
                        className="so-payment-btn so-payment-btn--approve"
                        disabled={verifyingId === selectedOrder.id}
                        onClick={() => setRefundConfirm({ orderId: selectedOrder.id })}
                      >
                        <CheckCircle size={16} /> Mark refunded
                      </button>
                    </div>
                  </div>
                )}

                {selectedOrder.paymentProofUrl && (
                  <div className="detail-row detail-row--col">
                    <span>Payment Proof</span>
                    <a
                      className="payment-proof"
                      href={resolveImg(selectedOrder.paymentProofUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Click or hover to preview"
                    >
                      <img
                        src={resolveImg(selectedOrder.paymentProofUrl)}
                        alt="Payment proof"
                      />
                      <span className="payment-proof-zoom">Hover to preview · Click to open</span>
                    </a>
                  </div>
                )}

                {selectedOrder.fulfillmentProofUrl && (
                  <div className="detail-row detail-row--col">
                    <OrderProof order={selectedOrder} resolve={resolveImg} />
                  </div>
                )}

                {selectedOrder.trackingNumber && (
                  <div className="detail-row detail-row--col">
                    <CourierTracking order={selectedOrder} />
                  </div>
                )}

                {/* Address */}
                <div className="detail-row detail-row--col">
                  <span>{selectedOrder.fulfillmentMethod === 'PICKUP' ? 'Pickup Location' : 'Delivery Address'}</span>
                  <p className="detail-address">{selectedOrder.deliveryAddress || '—'}</p>
                  {selectedOrder.deliveryLatitude != null && (
                    <a
                      className="so-map-link"
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.deliveryLatitude},${selectedOrder.deliveryLongitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open the buyer's pin in Maps
                    </a>
                  )}
                </div>

                {selectedOrder.deliveryNotes && (
                  <div className="detail-row detail-row--col">
                    <span>Notes</span>
                    <p className="detail-address">{selectedOrder.deliveryNotes}</p>
                  </div>
                )}

                {/* Items */}
                <div className="detail-items">
                  <p className="detail-items-title">Items</p>
                  {(selectedOrder.items || []).map(item => (
                    <div key={item.id} className="detail-item">
                      <span>
                        {item.product?.name || item.productName || item.productId}
                        {item.selectedVariations && Object.keys(item.selectedVariations).length > 0 && (
                          <small className="detail-item-variations">
                            {Object.entries(item.selectedVariations).map(([name, value]) => `${name}: ${value}`).join(' · ')}
                          </small>
                        )}
                      </span>
                      <span>×{item.quantity}</span>
                      <span>₱{(Number(item.price) * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className="detail-totals">
                  <div className="detail-total-row">
                    <span>Subtotal</span>
                    <span>₱{Number(selectedOrder.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="detail-total-row">
                    <span>Delivery fee</span>
                    <span>₱{Number(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                  </div>
                  {Number(selectedOrder.discountAmount) > 0 && (
                    <div className="detail-total-row">
                      <span>Discount{selectedOrder.voucherCode ? ` (${selectedOrder.voucherCode})` : ''}</span>
                      <span>−₱{Number(selectedOrder.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="detail-total-row detail-total-row--bold">
                    <span>Total</span>
                    <span>₱{Number(selectedOrder.total).toFixed(2)}</span>
                  </div>
                </div>

                {/* Action buttons */}
                {nextStep(selectedOrder) && (
                  <div className="detail-actions">
                    <button
                      className={`detail-action-btn ${ACTION_LABELS[nextStep(selectedOrder)]?.cls || ''}`}
                      disabled={updatingId === selectedOrder.id}
                      onClick={() => requestStatusChange(selectedOrder.id, nextStep(selectedOrder))}
                    >
                      {ACTION_LABELS[nextStep(selectedOrder)]?.label || nextStep(selectedOrder)}
                    </button>
                  </div>
                )}
                {canCancel(selectedOrder) && (
                  <button type="button" className="so-cancel-link" onClick={() => requestStatusChange(selectedOrder.id, 'CANCELLED')}>
                    Cancel this order
                  </button>
                )}

                {/* Receipt link */}
                {['COMPLETED', 'DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(selectedOrder.status) && (
                  <div className="detail-actions">
                    <Link
                      to={`/orders/${selectedOrder.id}/receipt`}
                      className="detail-action-btn action-complete"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={14} style={{ marginRight: 6 }} /> View Receipt
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ShipOrderSheet
        open={!!shipRequest}
        couriers={shipRequest?.courier ? [shipRequest.courier] : []}
        orderNumber={shipRequest?.orderNumber}
        onCancel={() => setShipRequest(null)}
        onConfirm={confirmShip}
      />
      <ProofPhotoSheet
        open={!!proofRequest}
        kind={proofRequest?.kind}
        orderNumber={proofRequest?.orderNumber}
        onCancel={() => setProofRequest(null)}
        onConfirm={confirmProof}
      />
      <ConfirmDialog
        open={!!cancelConfirm}
        title="Cancel this order?"
        message="The buyer will be notified and any reserved stock will be restored to your inventory. This cannot be undone."
        confirmLabel="Cancel Order"
        danger
        loading={updatingId === cancelConfirm?.orderId}
        onConfirm={confirmCancelOrder}
        onCancel={() => setCancelConfirm(null)}
      >
        <div className="so-cancel-reasons" role="radiogroup" aria-label="Why">
          {cancelReasonsFor(cancelConfirm?.status).map(([key, label]) => (
            <label key={key} className={cancelReason === key ? 'is-on' : ''}>
              <input type="radio" name="cancel-reason" checked={cancelReason === key} onChange={() => setCancelReason(key)} />
              {label}
            </label>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejectConfirm}
        title="Reject this payment?"
        message="Only reject if the payment did not arrive or the proof is invalid. The buyer will be asked to upload a new proof. The order and its stock are kept."
        confirmLabel="Reject Payment"
        danger
        loading={verifyingId === rejectConfirm?.orderId}
        onConfirm={() => handlePaymentDecision(rejectConfirm.orderId, 'FAILED')}
        onCancel={() => setRejectConfirm(null)}
      />

      <ConfirmDialog
        open={!!refundConfirm}
        title="Mark this order as refunded?"
        message="Only confirm once the buyer has actually received the money back. This records the refund on the order and cannot be undone."
        confirmLabel="Mark Refunded"
        loading={verifyingId === refundConfirm?.orderId}
        onConfirm={() => handlePaymentDecision(refundConfirm.orderId, 'REFUNDED')}
        onCancel={() => setRefundConfirm(null)}
      />
      {reportBuyer && (
        <ReportModal
          type="BUYER"
          reportedBuyerId={reportBuyer.id}
          targetName={reportBuyer.fullName || 'this buyer'}
          onClose={() => setReportBuyer(null)}
        />
      )}

    </div>
  );
}
