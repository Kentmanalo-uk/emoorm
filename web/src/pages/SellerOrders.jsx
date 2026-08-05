import React, { useState, useEffect } from 'react';
import {
  ShoppingBag, Eye, CheckCircle, XCircle,
  Clock, Package, Truck, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import './SellerDashboard.css';
import './SellerOrders.css';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'PENDING', label: 'New' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const STATUS_MAP = {
  PENDING: { label: 'New Order', cls: 'status-pending', icon: <Clock size={13} /> },
  CONFIRMED: { label: 'Confirmed', cls: 'status-confirmed', icon: <CheckCircle size={13} /> },
  PREPARING: { label: 'Preparing', cls: 'status-preparing', icon: <Package size={13} /> },
  READY: { label: 'Ready', cls: 'status-ready', icon: <Truck size={13} /> },
  COMPLETED: { label: 'Completed', cls: 'status-completed', icon: <CheckCircle size={13} /> },
  CANCELLED: { label: 'Cancelled', cls: 'status-cancelled', icon: <XCircle size={13} /> },
};

// What actions a seller can take from each status
const NEXT_STATUS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY'],
  READY: ['COMPLETED'],
};

const ACTION_LABELS = {
  CONFIRMED: { label: 'Confirm Order', cls: 'action-confirm' },
  PREPARING: { label: 'Start Preparing', cls: 'action-prepare' },
  READY: { label: 'Mark Ready', cls: 'action-ready' },
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
              <table className="seller-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Buyer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(order => {
                    const s = STATUS_MAP[order.status] || { label: order.status, cls: '' };
                    const nextStatuses = NEXT_STATUS[order.status] || [];
                    const isUpdating = updatingId === order.id;
                    return (
                      <tr
                        key={order.id}
                        className={selectedOrder?.id === order.id ? 'row-selected' : ''}
                      >
                        <td className="order-num">
                          #{order.orderNumber || order.id.slice(-6).toUpperCase()}
                        </td>
                        <td>{order.buyer?.fullName || 'Buyer'}</td>
                        <td>{order.items?.length ?? 0}</td>
                        <td>₱{Number(order.total).toFixed(2)}</td>
                        <td>
                          <span className={`seller-badge ${s.cls}`}>
                            {s.icon} {s.label}
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
                  <span className={`seller-badge ${STATUS_MAP[selectedOrder.status]?.cls}`}>
                    {STATUS_MAP[selectedOrder.status]?.icon}
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

                {/* Address */}
                <div className="detail-row detail-row--col">
                  <span>Delivery Address</span>
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
                {NEXT_STATUS[selectedOrder.status]?.length > 0 && (
                  <div className="detail-actions">
                    {NEXT_STATUS[selectedOrder.status].map(ns => {
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
