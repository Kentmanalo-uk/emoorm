import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, MapPin, Eye, ChatText as MessageSquare, ArrowCounterClockwise as RotateCcw, Star, X,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import ReviewModal from '../components/ReviewModal';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import ProductImage from '../components/ProductImage';
import useAuthStore from '../store/authStore';
import './Orders.css';

const Orders = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAuthStore();

  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null); // { product, orderId }

  const orderTabs = [
    { key: 'all', label: 'All' },
    { key: 'PENDING', label: 'To Pay' },
    { key: 'CONFIRMED', label: 'To Ship' },
    { key: 'PREPARING', label: 'Preparing' },
    { key: 'READY', label: 'Ready' },
    { key: 'COMPLETED', label: 'Completed' },
    { key: 'CANCELLED', label: 'Cancelled' },
  ];

  // Every possible order.status must resolve to exactly one tab above.
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

  const handleReorder = (order) => {
    // Add all items from this order to cart
    toast.success('Items added to cart!');
    navigate('/cart');
  };

  const getStatusBadge = (status) => {
    const badges = {
      PENDING: { label: 'Pending Payment', tone: 'neutral' },
      CONFIRMED: { label: 'Confirmed', tone: 'neutral' },
      PREPARING: { label: 'Preparing', tone: 'neutral' },
      TO_SHIP: { label: 'To Ship', tone: 'accent' },
      OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'accent' },
      DELIVERED: { label: 'Delivered', tone: 'accent' },
      READY: { label: 'Ready for Pickup', tone: 'accent' },
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
        label: 'Ready for Pickup',
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
      <div className="orders-loading">
        <div className="loading-spinner"></div>
        <p>Loading orders…</p>
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
            const statusBadge = getStatusBadge(order.status);

            return (
              <div key={order.id} className="order-card">
                <div className="order-card-header">
                  <Link
                    to={`/store/${order.store?.slug}`}
                    className="order-store-name"
                  >
                    {order.store?.name || 'Store'}
                  </Link>
                  <span className={`order-status-badge status-${statusBadge.tone}`}>
                    {statusBadge.label}
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

                <div className="order-card-actions">
                  <button
                    onClick={() => handleViewOrder(order)}
                    className="order-action-btn"
                  >
                    <Eye size={16} />
                    View details
                  </button>

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
                      className="order-action-btn is-primary"
                    >
                      <RotateCcw size={16} />
                      Buy again
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

                  <button className="order-action-btn">
                    <MessageSquare size={16} />
                    Contact seller
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Order Details Modal */}
      {showOrderDetails && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowOrderDetails(false)}>
          <div className="modal-content order-details-modal" onClick={(e) => e.stopPropagation()}>
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
                <span className={`order-status-badge status-${getStatusBadge(selectedOrder.status).tone}`}>
                  {getStatusBadge(selectedOrder.status).label}
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
                  <div className="summary-row summary-total">
                    <span>Total</span>
                    <span>₱{parseFloat(selectedOrder.total).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
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
          onClose={() => setReviewTarget(null)}
          onSuccess={fetchOrders}
        />
      )}
    </div>
  );
};

export default Orders;
