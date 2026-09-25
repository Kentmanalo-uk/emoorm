import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, BellSlash as BellOff, Checks as CheckCheck, Trash as Trash2, Package, ShoppingBag,
  CheckCircle, XCircle, Star, WarningCircle as AlertCircle, Info, ChatCircleDots
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import { notificationHref } from '../lib/notificationLink';
import useAuthStore from '../store/authStore';
import SellerPageHead from '../components/seller/SellerPageHead';
import EmptyArt from '../components/ui/EmptyArt';
import './SellerDashboard.css';
import './Notifications.css';

const TYPE_CONFIG = {
  ORDER_RECEIVED: { icon: ShoppingBag, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'New Order' },
  ORDER_CONFIRMED: { icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Order Confirmed' },
  ORDER_READY: { icon: Package, color: 'var(--t-orange-500, #f97316)', bg: 'var(--t-orange-100, #ffedd5)', label: 'Ready for Pickup' },
  ORDER_COMPLETED: { icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Order Completed' },
  ORDER_CANCELLED: { icon: XCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Order Cancelled' },
  PRODUCT_APPROVED: { icon: Star, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Product Approved' },
  PRODUCT_SUSPENDED: { icon: AlertCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Product Suspended' },
  SELLER_APPROVED: { icon: Star, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Seller Approved' },
  SELLER_SUSPENDED: { icon: XCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Seller Suspended' },
  REPORT_SUBMITTED: { icon: AlertCircle, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Report Submitted' },
  REPORT_RESOLVED: { icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Report Resolved' },
  SUPPORT_MESSAGE: { icon: ChatCircleDots, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Municipal Admin' },
  SYSTEM_ANNOUNCEMENT: { icon: Info, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Announcement' },
  STORE_NEW_PRODUCT: { icon: ShoppingBag, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'New Product' },
  STORE_PROMOTION: { icon: Star, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Promotion' },
  STORE_ANNOUNCEMENT: { icon: Info, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Store Update' },
  RETURN_REQUESTED: { icon: AlertCircle, color: 'var(--t-warning-500, #f59e0b)', bg: 'var(--t-warning-100, #fef3c7)', label: 'Return Requested' },
  RETURN_APPROVED: { icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Return Approved' },
  RETURN_REJECTED: { icon: XCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Return Rejected' },
  RETURN_AWAITING_SHIPMENT: { icon: Package, color: 'var(--t-orange-500, #f97316)', bg: 'var(--t-orange-100, #ffedd5)', label: 'Ship Your Return' },
  RETURN_RECEIVED: { icon: Package, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'Return Received' },
  RETURN_REFUNDED: { icon: CheckCircle, color: 'var(--t-primary-600, #059669)', bg: 'var(--t-primary-100, #d1fae5)', label: 'Refund Issued' },
  RETURN_CANCELLED: { icon: XCircle, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Return Cancelled' },
  RETURN_CLOSED: { icon: CheckCircle, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Return Closed' },
  SELLER_APPLICATION_SUBMITTED: { icon: Info, color: 'var(--t-info-500, #3b82f6)', bg: 'var(--t-info-100, #dbeafe)', label: 'Seller Application' },
  ADMIN_ALERT: { icon: AlertCircle, color: 'var(--t-danger-500, #ef4444)', bg: 'var(--t-danger-100, #fee2e2)', label: 'Alert' },
  DEFAULT: { icon: Info, color: 'var(--t-neutral-500, #6b7280)', bg: 'var(--t-neutral-100, #f3f4f6)', label: 'Notification' },
};

function getConfig(type) {
  return TYPE_CONFIG[type] || TYPE_CONFIG.DEFAULT;
}

/**
 * `bare` says a layout already wraps this page. `shell` says whose layout,
 * because the chrome differs: the Seller Center has its own heading and
 * card, the buyer profile has another. They were the same branch before,
 * so the Seller Center inherited the profile's title styling.
 */
export default function Notifications({ bare = false, mode = 'BUYER', shell } = {}) {
  const chrome = shell || (bare ? 'profile' : 'standalone');
  const isSeller = chrome === 'seller';
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const audience = mode === 'SELLER' ? 'SELLER' : 'BUYER';
  const notificationsPath = audience === 'SELLER' ? '/seller/notifications' : '/notifications';

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unread
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 0, total: 0 });

  useEffect(() => {
    if (!isAuthenticated) { navigate(`/login?redirect=${notificationsPath}`); return; }
    fetchNotifications();
  }, [isAuthenticated, filter, page, audience]);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const params = { page, pageSize: 20, audience };
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

  // The API resolves each notification to a destination (an order, a return,
  // a conversation, the announcement itself). Anything without one stays put.
  const openNotification = (notif) => {
    handleMarkRead(notif);
    const href = notificationHref(notif);
    if (href) navigate(href);
  };

  const handleMarkAllRead = async () => {
    try {
      await axios.put(`/notifications/read-all?audience=${audience}`);
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
    <div className={isSeller ? 'seller-dashboard' : (bare ? 'profile-page-wrap' : 'notif-page')}>
      <div className={isSeller ? 'seller-container' : (bare ? '' : 'notif-container')}>

        {!bare && (
          <div className="notif-breadcrumbs">
            <Link to="/">Home</Link><span>/</span>
            <span>Notifications</span>
          </div>
        )}

        {/* Header */}
        {isSeller ? (
          <SellerPageHead
            title="Notifications"
            subtitle={unreadCount > 0
              ? `${unreadCount} unread · order updates and alerts for your shop`
              : 'Order updates and alerts for your shop'}
            actions={(notifications.length > 0 || unreadCount > 0) && (
              <>
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
              </>
            )}
          />
        ) : bare ? (
          <header className="profile-page-header notif-page-header">
            <h1 className="profile-page-title">Notifications</h1>
            <div className="notif-header-actions">
              {unreadCount > 0 && (
                <button className="notif-action-btn" onClick={handleMarkAllRead} aria-label="Mark all read">
                  <CheckCheck size={15} /> <span className="notif-action-label">Mark all read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button className="notif-action-btn notif-action-danger" onClick={handleDeleteAll} aria-label="Clear all">
                  <Trash2 size={15} /> <span className="notif-action-label">Clear all</span>
                </button>
              )}
            </div>
          </header>
        ) : (
          <div className="notif-header">
            <div className="notif-header-left">
              <h1>Notifications</h1>
              {unreadCount > 0 && (
                <span className="notif-unread-badge">{unreadCount} unread</span>
              )}
            </div>
            <div className="notif-header-actions">
              {unreadCount > 0 && (
                <button className="notif-action-btn" onClick={handleMarkAllRead} aria-label="Mark all read">
                  <CheckCheck size={15} /> <span className="notif-action-label">Mark all read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button className="notif-action-btn notif-action-danger" onClick={handleDeleteAll} aria-label="Clear all">
                  <Trash2 size={15} /> <span className="notif-action-label">Clear all</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className={`notif-body${isSeller ? ' is-seller' : ''}`}>
        <div className={`notif-filters${isSeller ? ' is-seller' : ''}`}>
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
          <div className={`notif-empty${isSeller ? ' is-seller' : ''}`}>
            {isSeller
              ? <EmptyArt name="inbox" size={150} />
              : <BellOff size={48} weight="fill" />}
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
              const href = notificationHref(notif);
              return (
                <div
                  key={notif.id}
                  className={`notif-item ${!notif.isRead ? 'unread' : ''}${href ? ' is-linkable' : ''}`}
                  role={href ? 'link' : undefined}
                  tabIndex={href ? 0 : undefined}
                  onClick={() => openNotification(notif)}
                  onKeyDown={(e) => {
                    if (href && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      openNotification(notif);
                    }
                  }}
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
                    {notif.title && <p className="notif-heading">{notif.title}</p>}
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
    </div>
  );

  return bare ? inner : <Layout>{inner}</Layout>;
}
