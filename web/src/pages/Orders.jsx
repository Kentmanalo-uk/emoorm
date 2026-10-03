import { useState, useEffect, useRef } from 'react';
import { rangeLabel } from '../lib/eta';
import EmptyArt from '../components/ui/EmptyArt';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Eye, ChatText as MessageSquare, ArrowCounterClockwise as RotateCcw, Star, X,
  UploadSimple as Upload, CheckCircle, QrCode, Copy,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import ReviewModal from '../components/ReviewModal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import axios from '../lib/axios';
import { resolveImg, parseImages } from '../lib/media';
import { uploadImage } from '../lib/upload';
import ProductImage from '../components/ProductImage';
import useAuthStore from '../store/authStore';
import useCartStore, { cartKeyFor } from '../store/cartStore';
import './Orders.css';
import { useSheetPresence } from '../hooks/useSheetMotion';
import useEntryState from '../hooks/useEntryState';
import { OrderCardsSkeleton } from '../components/ui/PageSkeletons';
import { OrderProof } from '../components/orders/ProofPhotoSheet';
import CourierTracking, { CourierMark } from '../components/orders/CourierTracking';
import OrderStatusPanel from '../components/orders/OrderStatusPanel';
import {
  BUYER_TABS, buyerBucket, buyerTabFrom, countBuyerTabs, needsPayment,
} from '../lib/orderProgress';
import Spinner, { BusyLabel } from '../components/ui/Spinner';
import GcashPhonePay from '../components/checkout/GcashPhonePay';
import { qrMethod, formatAccountNumber } from '../lib/qrPayment';
import { isTouchPhone } from '../lib/device';
import { readCache, writeCache } from '../lib/pageCache';

// The DB stores `images` as JSON; some rows come back stringified. Normalize.

// Same reference rule the server applies.
const PAYMENT_REFERENCE_RE = /^[A-Za-z0-9 -]{4,64}$/;

// "To Pay" (needsPayment): a QR order the buyer has to pay now, once the
// seller has confirmed it, or when a proof was rejected (lib/orderProgress).

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

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const canConfirmReceipt = (order) => ['DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(order.status);

// While the shop checks a payment the order is held, until that check is
// overdue (the backend's paymentCheck deadline); then the buyer may cancel.
const canBuyerCancel = (order) => order.paymentStatus !== 'PENDING_VERIFICATION'
  || (order.deadline?.kind === 'paymentCheck' && new Date(order.deadline.at) <= new Date());

const Orders = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();
  const addItem = useCartStore((s) => s.addItem);

  // The list as it showed last time: shown at once while it is asked for again.
  const [orders, setOrders] = useState(() => readCache('orders') || []);
  const [ordersFresh, setOrdersFresh] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !readCache('orders'));
  // The tab this visit was on (Back finds it again); a link can name one.
  const statusParam = searchParams.get('status');
  const [savedTab, setActiveTab] = useEntryState('tab', buyerTabFrom(statusParam));
  // A tab saved by an older version (e.g. 'PENDING') still finds its place.
  const activeTab = buyerTabFrom(savedTab);
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
  // The list could not be loaded (and nothing was shown from before).
  const [loadFailed, setLoadFailed] = useState(false);
  // Orders come 50 at a time; "Show more" loads the next page.
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null); // order id
  const [cancelling, setCancelling] = useState(false);

  const orderMatchesTab = (order, tabKey) => tabKey === 'all' || buyerBucket(order) === tabKey;
  const tabCounts = countBuyerTabs(orders);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    fetchOrders();
  }, [isAuthenticated, navigate, searchParams]);

  const filteredOrders = activeTab === 'all' ? orders : orders.filter((order) => orderMatchesTab(order, activeTab));

  useEffect(() => {
    if (isAuthenticated) loadPendingReviews();
  }, [isAuthenticated]);

  const ORDERS_PAGE = 50;
  const fetchOrders = async () => {
    // Nothing on screen yet: the skeleton. Otherwise the list stays while it refreshes.
    if (!readCache('orders')) setIsLoading(true);
    try {
      const response = await axios.get('/orders/my/orders', { params: { page: 1, pageSize: ORDERS_PAGE } });
      setOrders(response.data || []);
      setPage(1);
      setHasMore(Boolean(response.pagination?.hasNext));
      setOrdersFresh(true);
      setLoadFailed(false);
      writeCache('orders', response.data || []);
    } catch {
      setLoadFailed(true);
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreOrders = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const response = await axios.get('/orders/my/orders', { params: { page: next, pageSize: ORDERS_PAGE } });
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

  // Cancel asks first (the app's dialog), then stays locked until it is done.
  const handleCancelOrder = (orderId) => setCancelTarget(orderId);
  const confirmCancelOrder = async () => {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    try {
      await axios.post(`/orders/${cancelTarget}/cancel`);
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
            image: parseImages(product.images)[0] || '/placeholder-product.png',
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
      // Straight to checkout with these items.
      navigate('/checkout', { state: { selectedIds: keys } });
    } catch (error) {
      toast.error(error.message || 'Failed to add items to cart');
    } finally {
      setReorderingId(null);
    }
  };

  // The shop's QR and account come from its public profile, as at checkout.
  // `store` is undefined while loading and null when it could not load.
  const openProofForm = (order) => {
    setProofForm({ orderId: order.id, reference: order.paymentReference || '', url: '', uploading: false, submitting: false, store: undefined });
    const storeId = order.storeId || order.store?.id;
    if (!storeId) return;
    axios.get(`/stores/${storeId}`)
      .then((res) => setProofForm((f) => (f?.orderId === order.id ? { ...f, store: res.data || null } : f)))
      .catch(() => setProofForm((f) => (f?.orderId === order.id ? { ...f, store: null } : f)));
  };

  const copyNumber = async (number) => {
    try {
      await navigator.clipboard.writeText(number);
      toast.success('Number copied');
    } catch {
      toast.error('Could not copy. Select the number and copy it instead.');
    }
  };

  // Deep link from a notification: /profile/orders?id=<orderId> opens that
  // order once the list has loaded. The id is remembered rather than stripped
  // from the URL, so closing the panel does not immediately reopen it while a
  // different order arriving from another notification still does.
  const openedOrderId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    // The fresh list, not the saved one: the order may have moved on.
    if (!targetId || !ordersFresh || orders.length === 0 || openedOrderId.current === targetId) return;
    openedOrderId.current = targetId;
    const match = orders.find((order) => order.id === targetId);
    if (!match) return;
    // "Order confirmed: please pay now" lands on the payment, in To Pay.
    if (needsPayment(match)) {
      setActiveTab('to_pay');
      openProofForm(match);
      requestAnimationFrame(() => document.getElementById(`order-${match.id}`)?.scrollIntoView({ block: 'center' }));
      return;
    }
    // Its own tab, so the card is in the list behind the details.
    setActiveTab(buyerBucket(match));
    setSelectedOrder(match);
    setShowOrderDetails(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the list or link changes
  }, [orders, ordersFresh, searchParams]);

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
      toast.success('Payment sent. The seller will check it and then prepare your order.');
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
        {BUYER_TABS.map((tab) => {
          // Counts on the tabs that need something from the buyer (as on Shopee).
          const count = ['to_pay', 'to_ship', 'to_receive', 'to_pickup'].includes(tab.key) ? (tabCounts[tab.key] || 0) : 0;

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

      {loadFailed && orders.length === 0 ? (
        <div className="profile-section">
          <div className="empty-state">
            <EmptyArt name="orders" size={96} />
            <p className="empty-state-text">Your orders couldn&rsquo;t be loaded</p>
            <p className="empty-state-hint">Check your connection and try again.</p>
            <button type="button" className="empty-state-button" onClick={fetchOrders}>Try again</button>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="profile-section">
          <div className="empty-state">
            <EmptyArt name="orders" size={96} />
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
            const statusBadge = stageBadge(order);
            const storeId = order.storeId || order.store?.id;

            return (
              <div key={order.id} id={`order-${order.id}`} className="order-card">
                <div className="order-card-header">
                  <Link
                    to={`/store/${order.store?.slug}`}
                    className="order-store-name"
                  >
                    {order.store?.name || 'Store'}
                  </Link>
                  <span className="order-badges">
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
                    {order.etaFrom && !['COMPLETED', 'CANCELLED', 'DELIVERED', 'PICKED_UP'].includes(order.status) && (
                      <div className="order-info-item">
                        <span className="order-info-label">{order.fulfillmentMethod === 'PICKUP' ? 'Ready for pickup' : 'Expected'}</span>
                        <span className="order-info-value order-eta">{rangeLabel({ from: order.etaFrom, to: order.etaTo || order.etaFrom })}</span>
                      </div>
                    )}
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

                {order.status === 'SHIPPED' && order.trackingNumber && (
                  <CourierTracking order={order} />
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
                      {order.paymentStatus === 'PENDING_VERIFICATION' ? <Upload size={16} /> : <QrCode size={16} />}
                      {payActionLabel(order)}
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

                  {['PENDING', 'CONFIRMED'].includes(order.status) && canBuyerCancel(order) && (
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
                      {reorderingId === order.id ? <BusyLabel>Adding…</BusyLabel> : 'Buy again'}
                    </button>
                  )}

                  {['COMPLETED', 'DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(order.status) && (
                    <Link to={`/profile/returns/request?orderId=${order.id}`} className="order-action-btn">
                      <RotateCcw size={16} /> Request return
                    </Link>
                  )}

                  {['COMPLETED', 'DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(order.status) && (
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
                    {order.paymentStatus !== 'PENDING_VERIFICATION' && (
                      <PayPanel order={order} store={proofForm.store} onCopy={copyNumber} />
                    )}
                    <p className="order-proof-hint">
                      {order.paymentStatus === 'FAILED'
                        ? 'Your previous proof was rejected. Pay if you haven\'t, then enter the reference from your payment app and upload a clear screenshot.'
                        : order.paymentStatus === 'PENDING'
                          ? 'After paying, enter the reference number from your payment app and upload a screenshot of the payment.'
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
                          {proofForm.uploading ? <Spinner size={16} /> : <Upload size={16} />}
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
                        {proofForm.submitting ? <BusyLabel>Submitting…</BusyLabel> : order.paymentStatus === 'PENDING' ? 'I have paid' : 'Submit proof'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Older orders, 50 at a time. */}
      {hasMore && !loadFailed && (
        <button type="button" className="orders-more" onClick={loadMoreOrders} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Show more orders'}
        </button>
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
                  <span className={`order-status-badge status-${stageBadge(selectedOrder).tone}`}>
                    {stageBadge(selectedOrder).label}
                  </span>
                </span>
              </div>

              <OrderStatusPanel order={selectedOrder} />

              {selectedOrder.fulfillmentProofUrl && (
                <div className="order-details-section">
                  <OrderProof order={selectedOrder} resolve={resolveImg} />
                </div>
              )}

              {selectedOrder.trackingNumber ? (
                <div className="order-details-section">
                  <h3>Delivery</h3>
                  <CourierTracking order={selectedOrder} />
                </div>
              ) : selectedOrder.courierName && selectedOrder.status !== 'CANCELLED' && (
                <div className="order-details-section">
                  <h3>Delivery</h3>
                  <div className="order-courier-pending">
                    <CourierMark courier={selectedOrder.courier || { name: selectedOrder.courierName }} size={30} />
                    <p>
                      <strong>Ships with {selectedOrder.courierName}</strong>
                      <span>The tracking number appears here once the seller hands it to the courier.</span>
                    </p>
                  </div>
                </div>
              )}

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
              {['PENDING', 'CONFIRMED'].includes(selectedOrder.status) && canBuyerCancel(selectedOrder) && (
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
        open={!!cancelTarget}
        title="Cancel this order?"
        message="The shop will be told, and anything you paid will be refunded by the shop."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        danger
        loading={cancelling}
        onConfirm={confirmCancelOrder}
        onCancel={() => { if (!cancelling) setCancelTarget(null); }}
      />

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

/**
 * How to pay a confirmed QR order: the shop's QR and account with the amount,
 * or on a phone paying a GCash shop, its number and a button that opens GCash.
 * @param {Object} order
 * @param {Object|null|undefined} store - The shop's public profile (undefined while loading)
 * @param {Function} onCopy - Copies the account number
 */
function PayPanel({ order, store, onCopy }) {
  if (store === undefined) {
    return <p className="order-pay-loading"><Spinner size={16} /> Loading the shop&apos;s QR…</p>;
  }
  if (!store?.paymentQrImage) {
    return (
      <p className="order-pay-missing">
        The shop&apos;s QR isn&apos;t available right now. Message the seller to ask how to pay {peso(order.total)}.
      </p>
    );
  }
  const method = qrMethod(store.paymentQrType);
  if (isTouchPhone() && store.paymentQrType === 'GCASH' && store.paymentAccountNumber) {
    return (
      <GcashPhonePay
        amount={peso(order.total)}
        number={store.paymentAccountNumber}
        accountName={store.paymentAccountName}
        qrImage={resolveImg(store.paymentQrImage)}
        instructions={store.paymentInstructions}
      />
    );
  }
  return (
    <div className="order-pay-panel">
      <img className="order-pay-qr" src={resolveImg(store.paymentQrImage)} alt={`${store.name || 'Shop'} ${method.label} QR code`} />
      <div className="order-pay-details">
        <h4>Scan to pay {peso(order.total)}</h4>
        <p className="order-pay-sub">with {method.label}, to {store.name || 'the shop'}</p>
        {(store.paymentAccountName || store.paymentAccountNumber) && (
          <dl className="order-pay-payee">
            {store.paymentAccountName && (
              <div><dt>Account name</dt><dd>{store.paymentAccountName}</dd></div>
            )}
            {store.paymentAccountNumber && (
              <div>
                <dt>{method.numberLabel}</dt>
                <dd>
                  <span>{formatAccountNumber(store.paymentAccountNumber)}</span>
                  <button type="button" className="order-pay-copy" onClick={() => onCopy(store.paymentAccountNumber)}>
                    <Copy size={13} /> Copy
                  </button>
                </dd>
              </div>
            )}
          </dl>
        )}
        {store.paymentInstructions && <p className="order-pay-note">{store.paymentInstructions}</p>}
      </div>
    </div>
  );
}
