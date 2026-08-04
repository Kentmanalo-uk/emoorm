import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, Clock, Truck, CheckCircle, XCircle,
  Store, MapPin, Eye, MessageSquare, RotateCcw, Star
} from 'lucide-react';
import toast from 'react-hot-toast';
import ReviewModal from '../components/ReviewModal';
import axios from '../lib/axios';
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
    { key: 'all', label: 'All', icon: Package },
    { key: 'PENDING', label: 'To Pay', icon: Clock },
    { key: 'CONFIRMED', label: 'To Ship', icon: Package },
    { key: 'PREPARING', label: 'Preparing', icon: Store },
    { key: 'READY', label: 'Ready', icon: CheckCircle },
    { key: 'COMPLETED', label: 'Completed', icon: CheckCircle },
    { key: 'CANCELLED', label: 'Cancelled', icon: XCircle },
  ];

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

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/orders/my/orders');
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
      setFilteredOrders(orders.filter(order => order.status === activeTab));
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
      PENDING: { label: 'Pending Payment', color: '#f59e0b', bg: '#fef3c7' },
      CONFIRMED: { label: 'Confirmed', color: '#3b82f6', bg: '#dbeafe' },
      PREPARING: { label: 'Preparing', color: '#8b5cf6', bg: '#ede9fe' },
      READY: { label: 'Ready for Pickup', color: '#f97316', bg: '#ffedd5' },
      COMPLETED: { label: 'Completed', color: '#10b981', bg: '#d1fae5' },
      CANCELLED: { label: 'Cancelled', color: '#ef4444', bg: '#fee2e2' },
    };
    return badges[status] || { label: status, color: '#6b7280', bg: '#f3f4f6' };
  };

  const getOrderTimeline = (order) => {
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
        active: ['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'].includes(order.status)
      },
      {
        status: 'PREPARING',
        label: 'Preparing',
        date: order.preparingAt,
        active: ['PREPARING', 'READY', 'COMPLETED'].includes(order.status)
      },
      {
        status: 'READY',
        label: 'Ready for Pickup',
        date: order.readyAt,
        active: ['READY', 'COMPLETED'].includes(order.status)
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
        <p>Loading orders...</p>
      </div>
    );
  }

  return (
    <>
      <div className="profile-section">
        <h1 className="orders-title">My Orders</h1>

        {/* Order Tabs */}
        <div className="orders-tabs">
          {orderTabs.map((tab) => {
            const Icon = tab.icon;
            const count = tab.key === 'all'
              ? orders.length
              : orders.filter(o => o.status === tab.key).length;

            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`order-tab ${activeTab === tab.key ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
                {count > 0 && <span className="order-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <div className="orders-empty">
            <Package size={64} />
            <h3>No orders found</h3>
            <p>You haven't placed any orders yet</p>
            <Link to="/products" className="btn-browse-products">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="orders-list">
            {filteredOrders.map((order) => {
              const statusBadge = getStatusBadge(order.status);

              return (
                <div key={order.id} className="order-card">
                  <div className="order-card-header">
                    <div className="order-card-header-left">
                      <Store size={18} />
                      <Link
                        to={`/store/${order.store?.slug}`}
                        className="order-store-name"
                      >
                        {order.store?.name || 'Store'}
                      </Link>
                    </div>
                    <div className="order-card-header-right">
                      <span
                        className="order-status-badge"
                        style={{
                          color: statusBadge.color,
                          backgroundColor: statusBadge.bg
                        }}
                      >
                        {statusBadge.label}
                      </span>
                    </div>
                  </div>

                  <div className="order-card-body">
                    {/* Order Items */}
                    <div className="order-items">
                      {order.items?.slice(0, 3).map((item, index) => (
                        <div key={index} className="order-item">
                          <img
                            src={item.product?.images?.[0] || '/placeholder-product.png'}
                            alt={item.productName}
                            className="order-item-image"
                          />
                          <div className="order-item-details">
                            <p className="order-item-name">{item.productName}</p>
                            <p className="order-item-quantity">x{item.quantity}</p>
                          </div>
                          <div className="order-item-price">
                            ₱{parseFloat(item.price).toFixed(2)}
                          </div>
                        </div>
                      ))}
                      {order.items?.length > 3 && (
                        <p className="order-items-more">
                          +{order.items.length - 3} more items
                        </p>
                      )}
                    </div>

                    {/* Order Info */}
                    <div className="order-info">
                      <div className="order-info-item">
                        <span className="order-info-label">Order Number:</span>
                        <span className="order-info-value">{order.orderNumber}</span>
                      </div>
                      <div className="order-info-item">
                        <span className="order-info-label">Order Date:</span>
                        <span className="order-info-value">
                          {new Date(order.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </span>
                      </div>
                      <div className="order-info-item">
                        <span className="order-info-label">Total Amount:</span>
                        <span className="order-info-value order-total">
                          ₱{parseFloat(order.total).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Order Actions */}
                  <div className="order-card-actions">
                    <button
                      onClick={() => handleViewOrder(order)}
                      className="order-action-btn btn-view"
                    >
                      <Eye size={16} />
                      View Details
                    </button>

                    {order.status === 'PENDING' && (
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        className="order-action-btn btn-cancel"
                      >
                        <XCircle size={16} />
                        Cancel Order
                      </button>
                    )}

                    {order.status === 'COMPLETED' && (
                      <button
                        onClick={() => handleReorder(order)}
                        className="order-action-btn btn-reorder"
                      >
                        <RotateCcw size={16} />
                        Buy Again
                      </button>
                    )}

                    {order.status === 'COMPLETED' && order.items?.length > 0 && (
                      <button
                        onClick={() => setReviewTarget({ product: order.items[0].product || { id: order.items[0].productId, name: order.items[0].productName, images: [order.items[0].product?.images?.[0]] }, orderId: order.id })}
                        className="order-action-btn btn-review"
                      >
                        <Star size={16} />
                        Write Review
                      </button>
                    )}

                    <button className="order-action-btn btn-message">
                      <MessageSquare size={16} />
                      Contact Seller
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {showOrderDetails && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowOrderDetails(false)}>
          <div className="modal-content order-details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Order Details</h2>
              <button
                onClick={() => setShowOrderDetails(false)}
                className="modal-close"
              >
                ×
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
                <span
                  className="order-status-badge"
                  style={{
                    color: getStatusBadge(selectedOrder.status).color,
                    backgroundColor: getStatusBadge(selectedOrder.status).bg
                  }}
                >
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
                      <img
                        src={item.product?.images?.[0] || '/placeholder-product.png'}
                        alt={item.productName}
                      />
                      <div className="order-details-item-info">
                        <p className="item-name">{item.productName}</p>
                        <p className="item-quantity">Quantity: {item.quantity}</p>
                      </div>
                      <div className="order-details-item-price">
                        <p>₱{parseFloat(item.price).toFixed(2)}</p>
                        <p className="item-subtotal">
                          Subtotal: ₱{parseFloat(item.subtotal).toFixed(2)}
                        </p>
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
              {selectedOrder.status === 'PENDING' && (
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
    </>
  );
};

export default Orders;
