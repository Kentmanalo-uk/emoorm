import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowCounterClockwise, CaretRight } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import ProductImage from '../components/ProductImage';
import './Orders.css';
import './Returns.css';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'REQUESTED', label: 'Requested' },
  { key: 'AWAITING_SHIPMENT', label: 'Ship back' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'REFUNDED', label: 'Refunded' },
  { key: 'REJECTED', label: 'Rejected' },
];

// Same badge tones as My Orders.
const STATUS_BADGES = {
  REQUESTED: { label: 'Requested', tone: 'neutral' },
  APPROVED: { label: 'Approved', tone: 'accent' },
  AWAITING_SHIPMENT: { label: 'Ship items back', tone: 'accent' },
  RECEIVED: { label: 'Received', tone: 'accent' },
  REFUNDED: { label: 'Refunded', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
};

const formatDate = (value) => new Date(value).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});

export default function Returns() {
  const [returns, setReturns] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    axios.get('/returns/my', { params: { pageSize: 50 } })
      .then((res) => active && setReturns(res.data || []))
      .catch((err) => toast.error(err.message || 'Unable to load returns'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const visible = tab === 'all' ? returns : returns.filter((item) => item.status === tab);

  if (loading) {
    return (
      <div className="profile-loading">
        <div className="profile-loading-spinner"></div>
        <p>Loading return requests...</p>
      </div>
    );
  }

  return (
    <div className="profile-page-wrap">
      <header className="profile-page-header returns-page-header">
        <h1 className="profile-page-title">Returns &amp; Refunds</h1>
        <Link to="/profile/orders" className="profile-section-link">Start from an order</Link>
      </header>

      <div className="orders-tabs" role="tablist">
        {TABS.map(({ key, label }) => {
          const count = key === 'all' ? returns.length : returns.filter((item) => item.status === key).length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`order-tab ${tab === key ? 'active' : ''}`}
              onClick={() => setTab(key)}
            >
              <span>{label}</span>
              {count > 0 && <span className="order-tab-count">{count}</span>}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="profile-section">
          <div className="empty-state">
            <ArrowCounterClockwise size={40} weight="fill" />
            <p className="empty-state-text">No return requests found</p>
            <p className="empty-state-hint">
              Completed orders can be returned within the seller&apos;s return policy window.
            </p>
            <Link to="/profile/orders" className="empty-state-button">View My Orders</Link>
          </div>
        </div>
      ) : (
        <div className="orders-list">
          {visible.map((item) => {
            const badge = STATUS_BADGES[item.status] || { label: item.status, tone: 'neutral' };
            const amount = Number(item.refundedAmount || item.approvedAmount || item.requestedAmount || 0);
            const lines = item.items || [];
            return (
              <Link key={item.id} to={`/profile/returns/${item.id}`} className="order-card return-card-link">
                <div className="order-card-header">
                  <span className="order-store-name">{item.store?.name || item.order?.store?.name || 'Store'}</span>
                  <span className={`order-status-badge status-${badge.tone}`}>{badge.label}</span>
                </div>

                <div className="order-card-body">
                  <div className="order-items">
                    {lines.slice(0, 3).map((line) => (
                      <div key={line.id} className="order-item">
                        <ProductImage
                          src={line.orderItem?.product?.images?.[0]}
                          alt={line.orderItem?.productName}
                          className="order-item-image"
                        />
                        <div className="order-item-details">
                          <p className="order-item-name">{line.orderItem?.product?.name || line.orderItem?.productName}</p>
                          <p className="order-item-quantity">Qty: {line.quantity}</p>
                        </div>
                      </div>
                    ))}
                    {lines.length > 3 && (
                      <p className="order-items-more">
                        +{lines.length - 3} more item{lines.length - 3 > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>

                  <div className="order-info">
                    <div className="order-info-item">
                      <span className="order-info-label">Return number</span>
                      <span className="order-info-value">{item.requestNumber}</span>
                    </div>
                    <div className="order-info-item">
                      <span className="order-info-label">Order number</span>
                      <span className="order-info-value">{item.order?.orderNumber || '—'}</span>
                    </div>
                    <div className="order-info-item">
                      <span className="order-info-label">Requested on</span>
                      <span className="order-info-value">{formatDate(item.createdAt)}</span>
                    </div>
                    <div className="order-info-item">
                      <span className="order-info-label">Refund amount</span>
                      <span className="order-info-value order-total">
                        ₱{amount.toFixed(2)}
                        <CaretRight size={16} className="return-card-caret" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
