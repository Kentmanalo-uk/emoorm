import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, CheckCheck, Trash2, Package, ShoppingBag,
  CheckCircle, XCircle, Star, AlertCircle, Info
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import './Notifications.css';

const TYPE_CONFIG = {
  ORDER_RECEIVED: { icon: ShoppingBag, color: '#3b82f6', bg: '#dbeafe', label: 'New Order' },
  ORDER_CONFIRMED: { icon: CheckCircle, color: '#059669', bg: '#d1fae5', label: 'Order Confirmed' },
  ORDER_READY: { icon: Package, color: '#f97316', bg: '#ffedd5', label: 'Ready for Pickup' },
  ORDER_COMPLETED: { icon: CheckCircle, color: '#059669', bg: '#d1fae5', label: 'Order Completed' },
  ORDER_CANCELLED: { icon: XCircle, color: '#ef4444', bg: '#fee2e2', label: 'Order Cancelled' },
  PRODUCT_APPROVED: { icon: Star, color: '#f59e0b', bg: '#fef3c7', label: 'Product Approved' },
  PRODUCT_SUSPENDED: { icon: AlertCircle, color: '#ef4444', bg: '#fee2e2', label: 'Product Suspended' },
  SELLER_APPROVED: { icon: Star, color: '#059669', bg: '#d1fae5', label: 'Seller Approved' },
  SELLER_REJECTED: { icon: XCircle, color: '#ef4444', bg: '#fee2e2', label: 'Seller Rejected' },
  DEFAULT: { icon: Info, color: '#6b7280', bg: '#f3f4f6', label: 'Notification' },
};

function getConfig(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.DEFAULT;
}

export default function Notifications({ bare = false } = {}) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unread
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 0, total: 0 });

  useEffect(() => {
    if (!isAuthenticated) { navigate('/login?redirect=/notifications'); return; }
    fetchNotifications();
  }, [isAuthenticated, filter, page]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const params = { page, pageSize: 20 };
      if (filter === 'unread') params.isRead = false;

      const response = await axios.get('/notifications', { params });
      setNotifications(response.data || []);
      setUnreadCount(response.unreadCount ?? 0);
      if (response.pagination) setPagination(response.pagination);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarkRead = async (notif) => {
    if (notif.isRead) return;
    try {
      await axios.put(`/notifications/${notif.id}/read`);
      setNotifications((prev) =>
        prev.map((n) => n.id === notif.id ? { ...n, isRead: true } : n)
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error('Failed to mark all as read');
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification deleted');
    } catch (err) {
      toast.error('Failed to delete notification');
    }
  };

  const handleDeleteAll = async () => {
    if (!window.confirm('Delete all notifications?')) return;
    try {
      await axios.delete('/notifications');
      setNotifications([]);
      setUnreadCount(0);
      toast.success('All notifications deleted');
    } catch (err) {
      toast.error('Failed to delete notifications');
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  };

  const inner = (
    <div className={bare ? 'profile-section' : 'notif-page'}>
      <div className={bare ? '' : 'notif-container'}>

        {!bare && (
          <div className="notif-breadcrumbs">
            <Link to="/">Home</Link><span>/</span>
            <span>Notifications</span>
          </div>
        )}

        {/* Header */}
        <div className="notif-header">
          <div className="notif-header-left">
            <h1>Notifications</h1>
            {unreadCount > 0 && (
              <span className="notif-unread-badge">{unreadCount} unread</span>
            )}
          </div>
          <div className="notif-header-actions">
            {unreadCount > 0 && (
              <button className="notif-action-btn" onClick={handleMarkAllRead}>
                <CheckCheck size={15} /> Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button className="notif-action-btn notif-action-danger" onClick={handleDeleteAll}>
                <Trash2 size={15} /> Clear all
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="notif-filters">
          <button
            className={`notif-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => { setFilter('all'); setPage(1); }}
          >
            All
          </button>
          <button
            className={`notif-filter-btn ${filter === 'unread' ? 'active' : ''}`}
            onClick={() => { setFilter('unread'); setPage(1); }}
          >
            Unread
            {unreadCount > 0 && <span className="notif-filter-count">{unreadCount}</span>}
          </button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="notif-loading">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="notif-skeleton" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="notif-empty">
            <BellOff size={48} />
            <h2>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</h2>
            <p>You'll see order updates and important alerts here.</p>
            {filter === 'unread' && (
              <button className="notif-show-all-btn" onClick={() => setFilter('all')}>
                View all notifications
              </button>
            )}
          </div>
        ) : (
          <div className="notif-list">
            {notifications.map((notif) => {
              const cfg = getConfig(notif.type);
              const Icon = cfg.icon;
              return (
                <div
                  key={notif.id}
                  className={`notif-item ${!notif.isRead ? 'unread' : ''}`}
                  onClick={() => handleMarkRead(notif)}
                >
                  <div
                    className="notif-icon-wrap"
                    style={{ background: cfg.bg, color: cfg.color }}
                  >
                    <Icon size={18} />
                  </div>

                  <div className="notif-content">
                    <div className="notif-title-row">
                      <span className="notif-type-label" style={{ color: cfg.color }}>
                        {cfg.label}
                      </span>
                      {!notif.isRead && <span className="notif-dot" />}
                    </div>
                    <p className="notif-message">{notif.message}</p>
                    <span className="notif-time">{formatTime(notif.createdAt)}</span>
                  </div>

                  <div className="notif-item-actions">
                    {!notif.isRead && (
                      <button
                        className="notif-read-btn"
                        title="Mark as read"
                        onClick={(e) => { e.stopPropagation(); handleMarkRead(notif); }}
                      >
                        <CheckCheck size={14} />
                      </button>
                    )}
                    <button
                      className="notif-del-btn"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); handleDelete(notif.id); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="notif-pagination">
            <button
              className="notif-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ← Prev
            </button>
            <span>Page {page} of {pagination.totalPages}</span>
            <button
              className="notif-page-btn"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </button>
          </div>
        )}

      </div>
    </div>
  );

  return bare ? inner : <Layout>{inner}</Layout>;
}
