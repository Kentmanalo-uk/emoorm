import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Eye, CheckCircle, XCircle, Clock, Package, Truck, CaretDown as ChevronDown, FileText, Storefront as StoreIcon, MagnifyingGlass, X, Flag } from '@phosphor-icons/react';
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

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'New' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'TO_SHIP', label: 'To Ship' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { key: 'READY_FOR_PICKUP', label: 'Ready for Pickup' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_MAP = {
  PENDING: { label: 'New Order', cls: 'status-pending', icon: <Clock size={13} /> },
  CONFIRMED: { label: 'Confirmed', cls: 'status-confirmed', icon: <CheckCircle size={13} /> },
  PREPARING: { label: 'Preparing', cls: 'status-preparing', icon: <Package size={13} /> },
  TO_SHIP: { label: 'To Ship', cls: 'status-preparing', icon: <Package size={13} /> },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'status-ready', icon: <Truck size={13} /> },
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
const DELIVERY_FLOW = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['TO_SHIP', 'PREPARING', 'CANCELLED'],
  PREPARING: ['TO_SHIP', 'READY', 'CANCELLED'],
  TO_SHIP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  READY: ['COMPLETED', 'CANCELLED'],
};

const PICKUP_FLOW = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_FOR_PICKUP', 'PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'READY', 'CANCELLED'],
  READY_FOR_PICKUP: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['COMPLETED'],
  READY: ['COMPLETED', 'CANCELLED'],
};

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

const canMarkRefunded = (order) => order?.paymentStatus === 'PAID' && order?.status === 'CANCELLED';

// Prepaid orders cannot move past confirmation until the payment is verified
// (the backend enforces the same rule).
const isAwaitingPayment = (order) => Boolean(order?.paymentMethod)
  && order.paymentMethod !== 'COD'
  && order.paymentStatus !== 'PAID';

function getNextStatuses(order) {
  const flow = order?.fulfillmentMethod === 'PICKUP' ? PICKUP_FLOW : DELIVERY_FLOW;
  const next = flow[order?.status] || [];
  return isAwaitingPayment(order) ? next.filter((s) => s === 'CONFIRMED' || s === 'CANCELLED') : next;
}

const ACTION_LABELS = {
  CONFIRMED: { label: 'Confirm Order', cls: 'action-confirm' },
  PREPARING: { label: 'Start Preparing', cls: 'action-prepare' },
  TO_SHIP: { label: 'Mark Ready to Ship', cls: 'action-prepare' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', cls: 'action-ready' },
  DELIVERED: { label: 'Mark Delivered', cls: 'action-complete' },
  READY: { label: 'Mark Ready', cls: 'action-ready' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', cls: 'action-ready' },
  PICKED_UP: { label: 'Mark Picked Up', cls: 'action-complete' },
  COMPLETED: { label: 'Mark Completed', cls: 'action-complete' },
  CANCELLED: { label: 'Cancel Order', cls: 'action-cancel' },
};

export default function SellerOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  // The buyer a seller is filing a report against, or null when the dialog is
  // closed. Reports route to the buyer's own municipal admin.
  const [reportBuyer, setReportBuyer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState(() => {
    const fromUrl = searchParams.get('status');
    return TABS.some((t) => t.key === fromUrl) ? fromUrl : 'all';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  // Server-side filters: order number search, created-at range and payment
  // status, all sent as query params to GET /orders/store/orders.
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, hasNext: false });
  const [cancelConfirm, setCancelConfirm] = useState(null); // { orderId }
  const [rejectConfirm, setRejectConfirm] = useState(null); // { orderId }
  const [refundConfirm, setRefundConfirm] = useState(null); // { orderId }
  const [verifyingId, setVerifyingId] = useState(null);

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
    setIsLoading(true);
    try {
      const params = {
        page,
        pageSize: PAGE_SIZE,
        status: activeTab !== 'all' ? activeTab : undefined,
        search: debouncedSearch || undefined,
        from: from || undefined,
        to: to || undefined,
        paymentStatus: paymentFilter || undefined,
      };
      const res = await axios.get('/orders/store/orders', { params });
      const loaded = res.data || [];
      setOrders(loaded);
      if (res.pagination) setPagination(res.pagination);
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

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await axios.put(`/orders/${orderId}/status`, { status: newStatus });
      toast.success(`Order marked as ${STATUS_MAP[newStatus]?.label || newStatus}`);
      applyOrderUpdate(orderId, {
        status: res.data?.status || newStatus,
        paymentStatus: res.data?.paymentStatus,
      });
    } catch (err) {
      toast.error(err.message || 'Failed to update order');
      // 409: the order moved on under us (buyer cancelled, another tab acted).
      // Refetch so the list shows the real state instead of a stale action.
      if (err.status === 409) loadOrders();
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
    PAID: 'Payment verified',
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

  const requestStatusChange = (orderId, newStatus) => {
    if (newStatus === 'CANCELLED') {
      setCancelConfirm({ orderId });
      return;
    }
    handleStatusChange(orderId, newStatus);
  };

  const confirmCancelOrder = async () => {
    if (!cancelConfirm) return;
    await handleStatusChange(cancelConfirm.orderId, 'CANCELLED');
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
            </div>
          )}
        />

        {/* Tabs */}
        <div className="seller-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`seller-tab ${activeTab === t.key ? 'seller-tab--active' : ''}`}
              onClick={() => selectTab(t.key)}
            >
              {t.label}
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

        <div className={`orders-layout${selectedOrder ? '' : ' is-single'}`}>
          {/* Order list */}
          <div className="seller-card orders-list-card">
            {isLoading ? (
              <Skeleton.Table cols={6} rows={6} />
            ) : displayed.length === 0 ? (
              <div className="seller-empty is-page">
                <EmptyArt name="shopping" size={168} />
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
                    const nextStatuses = getNextStatuses(order);
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
                        className={selectedOrder?.id === order.id ? 'row-selected' : ''}
                      >
                        <td className="order-num">
                          <div>#{order.orderNumber || order.id.slice(-6).toUpperCase()}</div>
                          {orderDate && <div className="so-order-date">{orderDate}</div>}
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
                          {order.paymentStatus === 'PENDING_VERIFICATION' && order.status !== 'CANCELLED' && (
                            <div className="so-payment-flag">Payment to verify</div>
                          )}
                          {order.paymentStatus === 'FAILED' && order.status !== 'CANCELLED' && (
                            <div className="so-payment-flag">Awaiting new proof</div>
                          )}
                          {canMarkRefunded(order) && (
                            <div className="so-payment-flag">Refund due</div>
                          )}
                        </td>
                        <td>
                          <div className="order-row-actions">
                            <button
                              className="seller-icon-btn"
                              title="View details"
                              onClick={() => setSelectedOrder(
                                selectedOrder?.id === order.id ? null : order
                              )}
                            >
                              <Eye size={15} />
                            </button>
                            {nextStatuses.length > 0 && (
                              <div className="status-dropdown">
                                <button
                                  className="status-dropdown-btn"
                                  disabled={isUpdating}
                                >
                                  {isUpdating ? '…' : <ChevronDown size={14} />}
                                </button>
                                <div className="status-dropdown-menu">
                                  {nextStatuses.map(ns => {
                                    const a = ACTION_LABELS[ns];
                                    return (
                                      <button
                                        key={ns}
                                        className={`status-dropdown-item ${a?.cls || ''}`}
                                        onClick={() => requestStatusChange(order.id, ns)}
                                      >
                                        {a?.label || ns}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
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

                {/* Buyer */}
                <div className="detail-row">
                  <span>Buyer</span>
                  <strong className="so-buyer-cell">
                    {selectedOrder.buyer?.id
                      ? <Link to={`/u/${selectedOrder.buyer.id}`} className="profile-link" title="View buyer profile">{selectedOrder.buyer.fullName || '—'}</Link>
                      : (selectedOrder.buyer?.fullName || '—')}
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
                    <span className={`seller-badge seller-badge--solid ${PAYMENT_LABELS[selectedOrder.paymentStatus]?.cls || ''}`}>
                      {PAYMENT_LABELS[selectedOrder.paymentStatus]?.label || selectedOrder.paymentStatus}
                    </span>
                  </div>
                )}

                {selectedOrder.paymentStatus === 'PENDING_VERIFICATION' && selectedOrder.status !== 'CANCELLED' && (
                  <div className="so-payment-review">
                    <p>Check the reference number and proof below against your GCash or bank records first.</p>
                    <div className="so-payment-actions">
                      <button
                        type="button"
                        className="so-payment-btn so-payment-btn--approve"
                        disabled={verifyingId === selectedOrder.id}
                        onClick={() => handlePaymentDecision(selectedOrder.id, 'PAID')}
                      >
                        <CheckCircle size={16} /> Payment received
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

                {/* Address */}
                <div className="detail-row detail-row--col">
                  <span>{selectedOrder.fulfillmentMethod === 'PICKUP' ? 'Pickup Location' : 'Delivery Address'}</span>
                  <p className="detail-address">{selectedOrder.deliveryAddress || '—'}</p>
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
                {getNextStatuses(selectedOrder).length > 0 && (
                  <div className="detail-actions">
                    {getNextStatuses(selectedOrder).map(ns => {
                      const a = ACTION_LABELS[ns];
                      return (
                        <button
                          key={ns}
                          className={`detail-action-btn ${a?.cls || ''}`}
                          disabled={updatingId === selectedOrder.id}
                          onClick={() => requestStatusChange(selectedOrder.id, ns)}
                        >
                          {a?.label || ns}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Receipt link */}
                {['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(selectedOrder.status) && (
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

      <ConfirmDialog
        open={!!cancelConfirm}
        title="Cancel this order?"
        message="The buyer will be notified and any reserved stock will be restored to your inventory. This cannot be undone."
        confirmLabel="Cancel Order"
        danger
        loading={updatingId === cancelConfirm?.orderId}
        onConfirm={confirmCancelOrder}
        onCancel={() => setCancelConfirm(null)}
      />

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
