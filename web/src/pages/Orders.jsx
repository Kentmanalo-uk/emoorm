import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, MapPin, Eye, ChatText as MessageSquare, ArrowCounterClockwise as RotateCcw, Star, X,
  UploadSimple as Upload, CheckCircle,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import ReviewModal from '../components/ReviewModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import { uploadImage } from '../lib/upload';
import ProductImage from '../components/ProductImage';
import useAuthStore from '../store/authStore';
import useCartStore from '../store/cartStore';
import './Orders.css';
import { useSheetPresence } from '../hooks/useSheetMotion';
import { OrderCardsSkeleton } from '../components/ui/PageSkeletons';

// The DB stores `images` as JSON; some rows come back stringified. Normalize.
const parseImages = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
};

// Same reference rule the server applies.
const PAYMENT_REFERENCE_RE = /^[A-Za-z0-9 -]{4,64}$/;

// Buyer-facing label + tone for every PaymentStatus value.
const getPaymentBadge = (order) => {
  const cod = order.paymentMethod === 'COD';
  const map = {
    PENDING: { label: cod ? 'Unpaid' : 'Awaiting payment', tone: 'neutral' },
    PENDING_VERIFICATION: { label: 'Awaiting verification', tone: 'neutral' },
    PAID: { label: 'Paid', tone: 'success' },
    FAILED: { label: 'Proof rejected — resubmit', tone: 'danger' },
    EXPIRED: { label: 'Expired', tone: 'danger' },
    REFUNDED: { label: 'Refunded', tone: 'accent' },
    PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'accent' },
  };
  return map[order.paymentStatus] || null;
};

// A prepaid order whose payment still needs the buyer's attention.
const needsPayment = (order) => (
  order.paymentMethod !== 'COD'
  && ['PENDING', 'PENDING_VERIFICATION', 'FAILED'].includes(order.paymentStatus)
  && !['CANCELLED', 'COMPLETED'].includes(order.status)
);

const canResubmitProof = (order) => (
  order.paymentMethod !== 'COD'
  && ['FAILED', 'PENDING_VERIFICATION'].includes(order.paymentStatus)
  && ['PENDING', 'CONFIRMED'].includes(order.status)
);

const canConfirmReceipt = (order) => ['DELIVERED', 'PICKED_UP'].includes(order.status);

const Orders = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const addItem = useCartStore((s) => s.addItem);

  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  // Phones: the details sheet slides away instead of vanishing.
  const detailsSheet = useSheetPresence(showOrderDetails);
  const [reviewTarget, setReviewTarget] = useState(null); // { product, orderId, initialRating?, intro? }
  const [reorderingId, setReorderingId] = useState(null);

  // Products received but not yet reviewed, keyed by product id, so a
  // completed order can ask for a rating until it has one.
  const [pendingReviews, setPendingReviews] = useState({});
  const loadPendingReviews = async () => {
    try {
      const res = await axios.get('/reviews/my/pending');
      const map = {};
      for (const item of (Array.isArray(res.data) ? res.data : [])) map[item.productId] = item;
      setPendingReviews(map);
    } catch {
      /* the nudge is optional; the page works without it */
    }
  };
  const unreviewedItems = (order) => (order.items || []).filter((it) => pendingReviews[it.productId]);
  const productOf = (it) => it.product || { id: it.productId, name: it.productName, images: it.product?.images || [] };

  // Inline "resubmit payment proof" form, one order at a time.
  const [proofForm, setProofForm] = useState(null); // { orderId, reference, url, uploading, submitting }
  // "Order received" confirmation.
  const [receiveTarget, setReceiveTarget] = useState(null); // order
  const [receiving, setReceiving] = useState(false);

  const orderTabs = [
    { key: 'all', label: 'All' },
    { key: 'TO_PAY', label: 'To Pay' },
    { key: 'PENDING', label: 'Pending' },
    { key: 'CONFIRMED', label: 'To Ship' },
    { key: 'PREPARING', label: 'Preparing' },
    { key: 'READY', label: 'Ready' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'CANCELLED', label: 'Cancelled' },
  ];

  // Every order.status resolves to exactly one status tab below. "To Pay" is
  // a payment view (prepaid orders still awaiting payment / verification).
  // Statuses like TO_SHIP/OUT_FOR_DELIVERY/READY_FOR_PICKUP/PICKED_UP/DELIVERED
  // are grouped under "Ready" (order is in transit / awaiting buyer receipt).
  const TAB_STATUS_GROUPS = {
    PENDING: ['PENDING'],
    CONFIRMED: ['CONFIRMED'],
    PREPARING: ['PREPARING'],
    READY: ['READY', 'READY_FOR_PICKUP', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'DELIVERED'],
    COMPLETED: ['COMPLETED'],
    CANCELLED: ['CANCELLED'],
  };

  const orderMatchesTab = (order, tabKey) => {
    if (tabKey === 'all') return true;
    if (tabKey === 'TO_PAY') return needsPayment(order);
    return (TAB_STATUS_GROUPS[tabKey] || [tabKey]).includes(order.status);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    const status = searchParams.get('status');
    if (status) {
      setActiveTab(status.toUpperCase());
    }

    fetchOrders();
  }, [isAuthenticated, navigate, searchParams]);

  useEffect(() => {
    filterOrders();
  }, [activeTab, orders]);

  // Deep link from a notification: /profile/orders?id=<orderId> opens that
  // order once the list has loaded. The id is remembered rather than stripped
  // from the URL, so closing the panel does not immediately reopen it while a
  // different order arriving from another notification still does.
  const openedOrderId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || orders.length === 0 || openedOrderId.current === targetId) return;
    openedOrderId.current = targetId;
    const match = orders.find((order) => order.id === targetId);
    if (match) {
      setSelectedOrder(match);
      setShowOrderDetails(true);
    }
  }, [orders, searchParams]);

  useEffect(() => {
    if (isAuthenticated) loadPendingReviews();
  }, [isAuthenticated]);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/orders/my/orders', { params: { pageSize: 100 } });
      setOrders(response.data || []);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const filterOrders = () => {
    if (activeTab === 'all') {
      setFilteredOrders(orders);
    } else {
      setFilteredOrders(orders.filter((order) => orderMatchesTab(order, activeTab)));
    }
  };

  const handleViewOrder = (order) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order?')) {
      return;
    }

    try {
      await axios.post(`/orders/${orderId}/cancel`);
      toast.success('Order cancelled successfully');
      fetchOrders();
      setShowOrderDetails(false);
    } catch (error) {
      console.error('Failed to cancel order:', error);
      toast.error(error.message || 'Failed to cancel order');
    }
  };

  // "Buy again": re-add each line from current catalogue data, skipping what
  // can no longer be bought.
  const handleReorder = async (order) => {
    const lines = order.items || [];
    if (lines.length === 0) return;
    setReorderingId(order.id);
    try {
      const results = await Promise.allSettled(
        lines.map((line) => axios.get(`/products/${line.productId || line.product?.id}`)),
      );
      let added = 0;
      let skipped = 0;
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
            image: parseImages(product.images)[0] || '/placeholder-product.png',
            storeId: product.storeId || product.store?.id,
            storeName: product.store?.name,
            storeLogo: product.store?.logoUrl || product.store?.logo || null,
            stock,
            slug: product.slug,
            categoryId: product.categoryId,
            selectedVariations: line.selectedVariations || null,
          }, Math.max(1, Math.min(Number(line.quantity) || 1, stock)));
          added += 1;
        } catch {
          // e.g. the cart already holds the full stock of this line
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
      navigate('/cart');
    } catch (error) {
      toast.error(error.message || 'Failed to add items to cart');
    } finally {
      setReorderingId(null);
    }
  };

  const openProofForm = (order) => {
    setProofForm({ orderId: order.id, reference: order.paymentReference || '', url: '', uploading: false, submitting: false });
  };

  const handleProofFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProofForm((f) => (f ? { ...f, uploading: true } : f));
    try {
      const res = await uploadImage(file);
      setProofForm((f) => (f ? { ...f, url: res.url, uploading: false } : f));
      toast.success('Proof uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
      setProofForm((f) => (f ? { ...f, uploading: false } : f));
    } finally {
      e.target.value = '';
    }
  };

  const handleProofSubmit = async (e) => {
    e.preventDefault();
    if (!proofForm) return;
    const reference = proofForm.reference.trim();
    if (!PAYMENT_REFERENCE_RE.test(reference)) {
      toast.error('Reference must be 4–64 letters, numbers, spaces or dashes.');
      return;
    }
    if (!proofForm.url) {
      toast.error('Upload your payment proof screenshot.');
      return;
    }
    setProofForm((f) => ({ ...f, submitting: true }));
    try {
      await axios.patch(`/orders/${proofForm.orderId}/proof`, { paymentReference: reference, paymentProofUrl: proofForm.url });
      toast.success('Payment proof submitted for verification');
      setProofForm(null);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'Failed to submit payment proof');
      setProofForm((f) => (f ? { ...f, submitting: false } : f));
    }
  };

  const handleConfirmReceived = async () => {
    if (!receiveTarget) return;
    setReceiving(true);
    try {
      const received = receiveTarget;
      await axios.post(`/orders/${received.id}/received`);
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
        navigate('/profile/reviews?tab=pending');
      }
    } catch (err) {
      toast.error(err.message || 'Failed to confirm receipt');
    } finally {
      setReceiving(false);
    }
  };

  const getStatusBadge = (status, fulfillmentMethod) => {
    const pickup = fulfillmentMethod === 'PICKUP';
    const badges = {
      PENDING: { label: 'Pending', tone: 'neutral' },
      CONFIRMED: { label: 'Confirmed', tone: 'neutral' },
      PREPARING: { label: 'Preparing', tone: 'neutral' },
      TO_SHIP: { label: 'To Ship', tone: 'accent' },
      OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'accent' },
      DELIVERED: { label: 'Delivered', tone: 'accent' },
      READY: { label: pickup ? 'Ready for Pickup' : 'Ready', tone: 'accent' },
      READY_FOR_PICKUP: { label: 'Ready for Pickup', tone: 'accent' },
      PICKED_UP: { label: 'Picked Up', tone: 'accent' },
      COMPLETED: { label: 'Completed', tone: 'success' },
      CANCELLED: { label: 'Cancelled', tone: 'danger' },
    };
    return badges[status] || { label: status, tone: 'neutral' };
  };

  const getOrderTimeline = (order) => {
    const readyStatuses = ['READY', 'READY_FOR_PICKUP', 'TO_SHIP', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'DELIVERED'];
    const timeline = [
      {
        status: 'PENDING',
        label: 'Order Placed',
        date: order.createdAt,
        active: true
      },
      {
        status: 'CONFIRMED',
        label: 'Order Confirmed',
        date: order.confirmedAt,
        active: ['CONFIRMED', 'PREPARING', ...readyStatuses, 'COMPLETED'].includes(order.status)
      },
      {
        status: 'PREPARING',
        label: 'Preparing',
        date: order.preparingAt,
        active: ['PREPARING', ...readyStatuses, 'COMPLETED'].includes(order.status)
      },
      {
        status: 'READY',
        label: order.fulfillmentMethod === 'PICKUP' ? 'Ready for Pickup' : 'Ready',
        date: order.readyAt,
        active: [...readyStatuses, 'COMPLETED'].includes(order.status)
      },
      {
        status: 'COMPLETED',
        label: 'Completed',
        date: order.completedAt,
        active: order.status === 'COMPLETED'
      },
    ];

    if (order.status === 'CANCELLED') {
      return [
        {
          status: 'PENDING',
          label: 'Order Placed',
          date: order.createdAt,
          active: true
        },
        {
          status: 'CANCELLED',
          label: 'Order Cancelled',
          date: order.cancelledAt,
          active: true
        },
      ];
    }

    return timeline;
  };

  if (isLoading) {
    return (
      <div className="profile-page-wrap">
        <OrderCardsSkeleton title="My Orders" />
      </div>
    );
  }

  return (
    <div className="profile-page-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">My Orders</h1>
      </header>

      <div className="orders-tabs" role="tablist">
        {orderTabs.map((tab) => {
          const count = tab.key === 'all'
            ? orders.length
            : orders.filter((o) => orderMatchesTab(o, tab.key)).length;

          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`order-tab ${activeTab === tab.key ? 'active' : ''}`}
              role="tab"
            >
              <span>{tab.label}</span>
              {count > 0 && <span className="order-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="profile-section">
          <div className="empty-state">
            <Package size={40} strokeWidth={1.5} weight="fill" />
            <p className="empty-state-text">No orders found</p>
            <p className="empty-state-hint">
              You haven't placed any orders in this category yet.
            </p>
            <Link to="/products" className="empty-state-button">Browse Products</Link>
          </div>
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => {
            const statusBadge = getStatusBadge(order.status, order.fulfillmentMethod);
            const paymentBadge = getPaymentBadge(order);
            const storeId = order.storeId || order.store?.id;

            return (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <Link
                    to={`/store/${order.store?.slug}`}
                    className="order-store-name"
                  >
                    {order.store?.name || 'Store'}
                  </Link>
                  <span className="order-badges">
                    {paymentBadge && (
                      <span className={`order-status-badge status-${paymentBadge.tone}`}>
                        {paymentBadge.label}
                      </span>
                    )}
                    <span className={`order-status-badge status-${statusBadge.tone}`}>
                      {statusBadge.label}
                    </span>
                  </span>
                </div>

                <div className="order-card-body">
                  <div className="order-items">
                    {order.items?.slice(0, 3).map((item, index) => (
                      <div key={index} className="order-item">
                        <ProductImage src={item.product?.images?.[0]} alt={item.productName} className="order-item-image" />
                        <div className="order-item-details">
                          <p className="order-item-name">{item.productName}</p>
                          <p className="order-item-quantity">Qty: {item.quantity}</p>
                        </div>
                        <div className="order-item-price">
                          ₱{parseFloat(item.price).toFixed(2)}
                        </div>
                      </div>
                    ))}
                    {order.items?.length > 3 && (
                      <p className="order-items-more">
                        +{order.items.length - 3} more item{order.items.length - 3 > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  <div className="order-info">
                    <div className="order-info-item">
                      <span className="order-info-label">Order number</span>
                      <span className="order-info-value">{order.orderNumber}</span>
                    </div>
                    <div className="order-info-item">
                      <span className="order-info-label">Order date</span>
                      <span className="order-info-value">
                        {new Date(order.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </span>
                    </div>
                    <div className="order-info-item">
                      <span className="order-info-label">Total amount</span>
                      <span className="order-info-value order-total">
                        ₱{parseFloat(order.total).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {order.status === 'COMPLETED' && unreviewedItems(order).length > 0 && (
                  <div className="order-review-nudge">
                    <div className="order-review-nudge-text">
                      <Star size={18} weight="fill" />
                      <span>
                        {unreviewedItems(order).length === 1
                          ? <>How was <strong>{productOf(unreviewedItems(order)[0]).name}</strong>? Tap a star to rate it.</>
                          : <>How was your order? {unreviewedItems(order).length} items are waiting for a rating.</>}
                      </span>
                    </div>
                    {unreviewedItems(order).length === 1 ? (
                      <div className="order-review-nudge-stars">
                        {/* Rendered 5..1: the row is laid out in reverse so hovering
                            a star lights everything to its left (see Orders.css). */}
                        {[5, 4, 3, 2, 1].map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-label={`${n} star${n === 1 ? '' : 's'}`}
                            onClick={() => setReviewTarget({
                              product: productOf(unreviewedItems(order)[0]),
                              orderId: order.id,
                              initialRating: n,
                            })}
                          >
                            <Star size={22} weight="regular" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Link to="/profile/reviews?tab=pending" className="order-action-btn is-primary">
                        Rate items
                      </Link>
                    )}
                  </div>
                )}

                <div className="order-card-actions">
                  <button
                    onClick={() => handleViewOrder(order)}
                    className="order-action-btn"
                  >
                    <Eye size={16} />
                    View details
                  </button>

                  {canResubmitProof(order) && (
                    <button
                      type="button"
                      onClick={() => (proofForm?.orderId === order.id ? setProofForm(null) : openProofForm(order))}
                      className="order-action-btn is-primary"
                    >
                      <Upload size={16} />
                      Resubmit payment proof
                    </button>
                  )}

                  {canConfirmReceipt(order) && (
                    <button
                      type="button"
                      onClick={() => setReceiveTarget(order)}
                      className="order-action-btn is-primary"
                    >
                      <CheckCircle size={16} />
                      Order received
                    </button>
                  )}

                  {['PENDING', 'CONFIRMED'].includes(order.status) && (
                    <button
                      onClick={() => handleCancelOrder(order.id)}
                      className="order-action-btn is-danger"
                    >
                      Cancel order
                    </button>
                  )}

                  {order.status === 'COMPLETED' && (
                    <button
                      onClick={() => handleReorder(order)}
                      disabled={reorderingId === order.id}
                      className="order-action-btn is-primary"
                    >
                      <RotateCcw size={16} />
                      {reorderingId === order.id ? 'Adding…' : 'Buy again'}
                    </button>
                  )}

                  {['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(order.status) && (
                    <Link to={`/profile/returns/request?orderId=${order.id}`} className="order-action-btn">
                      <RotateCcw size={16} /> Request return
                    </Link>
                  )}

                  {['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(order.status) && (
                    <Link
                      to={`/orders/${order.id}/receipt`}
                      className="order-action-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View receipt
                    </Link>
                  )}

                  {['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(order.status) && order.items?.length > 0 && (
                    order.items.length === 1 ? (
                      <button
                        onClick={() => {
                          const it = order.items[0];
                          setReviewTarget({
                            product: it.product || { id: it.productId, name: it.productName, images: it.product?.images || [] },
                            orderId: order.id,
                          });
                        }}
                        className="order-action-btn"
                      >
                        <Star size={16} />
                        Write review
                      </button>
                    ) : (
                      <button
                        onClick={() => { setSelectedOrder(order); setShowOrderDetails(true); }}
                        className="order-action-btn"
                      >
                        <Star size={16} />
                        Review items
                      </button>
                    )
                  )}

                  {storeId && (
                    <Link to={`/messages?store=${storeId}`} className="order-action-btn">
                      <MessageSquare size={16} />
                      Contact seller
                    </Link>
                  )}
                </div>

                {proofForm?.orderId === order.id && (
                  <form className="order-proof-form" onSubmit={handleProofSubmit}>
                    <p className="order-proof-hint">
                      {order.paymentStatus === 'FAILED'
                        ? 'Your previous proof was rejected. Enter the reference from your payment app and upload a clear screenshot.'
                        : 'Replace the reference and screenshot you submitted; the seller will verify the new one.'}
                    </p>
                    <div className="order-proof-fields">
                      <input
                        type="text"
                        className="order-proof-input"
                        placeholder="Reference / transaction ID"
                        value={proofForm.reference}
                        onChange={(e) => setProofForm((f) => ({ ...f, reference: e.target.value }))}
                        maxLength={64}
                      />
                      {proofForm.url ? (
                        <span className="order-proof-preview">
                          <img src={resolveImg(proofForm.url)} alt="Payment proof" />
                          <button type="button" className="order-action-btn" onClick={() => setProofForm((f) => ({ ...f, url: '' }))}>Remove</button>
                        </span>
                      ) : (
                        <label className="order-action-btn order-proof-upload">
                          <Upload size={16} />
                          <span>{proofForm.uploading ? 'Uploading…' : 'Upload screenshot'}</span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleProofFileChange}
                            disabled={proofForm.uploading}
                            hidden
                          />
                        </label>
                      )}
                    </div>
                    <div className="order-proof-actions">
                      <button type="button" className="order-action-btn" onClick={() => setProofForm(null)} disabled={proofForm.submitting}>Cancel</button>
                      <button type="submit" className="order-action-btn is-primary" disabled={proofForm.submitting || proofForm.uploading}>
                        {proofForm.submitting ? 'Submitting…' : 'Submit proof'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Order Details Modal */}
      {detailsSheet.mounted && selectedOrder && (
        <div className={`modal-overlay ui-sheet-backdrop${detailsSheet.closing ? ' is-closing' : ''}`} onClick={() => setShowOrderDetails(false)}>
          <div className="modal-content order-details-modal ui-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Order Details</h2>
              <button
                onClick={() => setShowOrderDetails(false)}
                className="modal-close"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Order Number and Status */}
              <div className="order-details-header">
                <div>
                  <p className="order-details-number">Order #{selectedOrder.orderNumber}</p>
                  <p className="order-details-date">
                    Placed on {new Date(selectedOrder.createdAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <span className="order-badges">
                  {getPaymentBadge(selectedOrder) && (
                    <span className={`order-status-badge status-${getPaymentBadge(selectedOrder).tone}`}>
                      {getPaymentBadge(selectedOrder).label}
                    </span>
                  )}
                  <span className={`order-status-badge status-${getStatusBadge(selectedOrder.status, selectedOrder.fulfillmentMethod).tone}`}>
                    {getStatusBadge(selectedOrder.status, selectedOrder.fulfillmentMethod).label}
                  </span>
                </span>
              </div>

              {/* Order Timeline */}
              <div className="order-timeline-section">
                <h3>Order Timeline</h3>
                <div className="order-timeline">
                  {getOrderTimeline(selectedOrder).map((step, index) => (
                    <div
                      key={index}
                      className={`timeline-step ${step.active ? 'active' : ''}`}
                    >
                      <div className="timeline-marker"></div>
                      <div className="timeline-content">
                        <p className="timeline-label">{step.label}</p>
                        {step.date && (
                          <p className="timeline-date">
                            {new Date(step.date).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Address */}
              <div className="order-details-section">
                <h3>Delivery Address</h3>
                <div className="delivery-address">
                  <MapPin size={18} />
                  <div>
                    <p>{selectedOrder.deliveryAddress}</p>
                    {selectedOrder.contactNumber && (
                      <p className="delivery-contact">{selectedOrder.contactNumber}</p>
                    )}
                    {selectedOrder.deliveryNotes && (
                      <p className="delivery-notes">Note: {selectedOrder.deliveryNotes}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="order-details-section">
                <h3>Order Items</h3>
                <div className="order-details-items">
                  {selectedOrder.items?.map((item, index) => (
                    <div key={index} className="order-details-item">
                      <ProductImage src={item.product?.images?.[0]} alt={item.productName} />
                      <div className="order-details-item-info">
                        <p className="item-name">{item.productName}</p>
                        <p className="item-quantity">Quantity: {item.quantity}</p>
                      </div>
                      <div className="order-details-item-price">
                        <p>₱{parseFloat(item.price).toFixed(2)}</p>
                        <p className="item-subtotal">
                          Subtotal: ₱{parseFloat(item.subtotal).toFixed(2)}
                        </p>
                        {['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(selectedOrder.status) && (
                          <button
                            type="button"
                            className="order-action-btn"
                            style={{ marginTop: 6 }}
                            onClick={() => {
                              setShowOrderDetails(false);
                              setReviewTarget({
                                product: item.product || { id: item.productId, name: item.productName, images: item.product?.images || [] },
                                orderId: selectedOrder.id,
                              });
                            }}
                          >
                            <Star size={14} />
                            Review
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Order Summary */}
              <div className="order-details-section">
                <h3>Order Summary</h3>
                <div className="order-summary">
                  <div className="summary-row">
                    <span>Subtotal</span>
                    <span>₱{parseFloat(selectedOrder.subtotal).toFixed(2)}</span>
                  </div>
                  <div className="summary-row">
                    <span>Delivery Fee</span>
                    <span>₱{parseFloat(selectedOrder.deliveryFee || 0).toFixed(2)}</span>
                  </div>
                  {Number(selectedOrder.discountAmount) > 0 && (
                    <div className="summary-row">
                      <span>Discount{selectedOrder.voucherCode ? ` (${selectedOrder.voucherCode})` : ''}</span>
                      <span>-₱{parseFloat(selectedOrder.discountAmount).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="summary-row summary-total">
                    <span>Total</span>
                    <span>₱{parseFloat(selectedOrder.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {canConfirmReceipt(selectedOrder) && (
                <button
                  type="button"
                  onClick={() => setReceiveTarget(selectedOrder)}
                  className="order-action-btn is-primary"
                >
                  <CheckCircle size={16} />
                  Order received
                </button>
              )}
              {['PENDING', 'CONFIRMED'].includes(selectedOrder.status) && (
                <button
                  onClick={() => handleCancelOrder(selectedOrder.id)}
                  className="btn-modal-cancel"
                >
                  Cancel Order
                </button>
              )}
              <button
                onClick={() => setShowOrderDetails(false)}
                className="btn-modal-close"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {reviewTarget && (
        <ReviewModal
          product={reviewTarget.product}
          orderId={reviewTarget.orderId}
          initialRating={reviewTarget.initialRating}
          intro={reviewTarget.intro}
          onClose={() => setReviewTarget(null)}
          onSuccess={() => { fetchOrders(); loadPendingReviews(); }}
        />
      )}

      <ConfirmDialog
        open={!!receiveTarget}
        title="Confirm you received this order?"
        message={receiveTarget ? `Order #${receiveTarget.orderNumber} will be marked as completed.${receiveTarget.paymentMethod === 'COD' ? ' This also confirms you paid on delivery / pickup.' : ''}` : ''}
        confirmLabel="Yes, received"
        loading={receiving}
        onConfirm={handleConfirmReceived}
        onCancel={() => { if (!receiving) setReceiveTarget(null); }}
      />
    </div>
  );
};

export default Orders;
