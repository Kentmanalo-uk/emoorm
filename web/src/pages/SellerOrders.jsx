import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag, Eye, CheckCircle, XCircle,
  Clock, Package, Truck, ChevronDown, FileText, Store as StoreIcon
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import { resolveImg } from '../lib/media';
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

// Fulfillment-aware next-status resolution
const DELIVERY_FLOW = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['TO_SHIP', 'CANCELLED'],
  PREPARING: ['TO_SHIP'],
  TO_SHIP: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['DELIVERED'],
  DELIVERED: [],
};

const PICKUP_FLOW = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['READY_FOR_PICKUP', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP'],
  READY: ['PICKED_UP'],
  READY_FOR_PICKUP: ['PICKED_UP'],
  PICKED_UP: [],
};

function getNextStatuses(order) {
  const flow = order?.fulfillmentMethod === 'PICKUP' ? PICKUP_FLOW : DELIVERY_FLOW;
  return flow[order?.status] || [];
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
  COMPLETED: { label: 'Complete', cls: 'action-complete' },
  CANCELLED: { label: 'Cancel', cls: 'action-cancel' },
};

export default function SellerOrders() {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    loadOrders();
  }, [activeTab]);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const params = activeTab !== 'all' ? { status: activeTab, pageSize: 50 } : { pageSize: 50 };
      const res = await axios.get('/orders/store/orders', { params });
      setOrders(res.data || []);
    } catch (err) {
      toast.error('Failed to load orders');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      await axios.put(`/orders/${orderId}/status`, { status: newStatus });
      toast.success(`Order marked as ${STATUS_MAP[newStatus]?.label || newStatus}`);
      // Update local state
      setOrders(prev =>
        prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o)
      );
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to update order');
    } finally {
      setUpdatingId(null);
    }
  };

  const displayed = activeTab === 'all'
    ? orders
    : orders.filter(o => o.status === activeTab);

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Orders</h1>
            <p className="seller-welcome">Manage incoming orders from buyers</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="seller-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`seller-tab ${activeTab === t.key ? 'seller-tab--active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="orders-layout">
          {/* Order list */}
          <div className="seller-card orders-list-card">
            {isLoading ? (
              <Skeleton.Table cols={6} rows={6} />
            ) : displayed.length === 0 ? (
              <div className="seller-empty">
                <ShoppingBag size={40} />
                <p>No orders in this category.</p>
              </div>
            ) : (
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
                            <span className="so-buyer-name">{order.buyer?.fullName || 'Buyer'}</span>
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
                                        onClick={() => handleStatusChange(order.id, ns)}
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
                  <strong>{selectedOrder.buyer?.fullName || '—'}</strong>
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
                      <span>{item.product?.name || item.productId}</span>
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
                          onClick={() => handleStatusChange(selectedOrder.id, ns)}
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
    </div>
  );
}
