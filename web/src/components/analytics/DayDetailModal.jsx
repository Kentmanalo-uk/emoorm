import React, { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import { peso, num } from './format';
import './analytics.css';

const DayDetailModal = ({ date, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!date) return;
    setLoading(true);
    setError(null);
    axios.get('/analytics/seller/day', { params: { date } })
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load day details'))
      .finally(() => setLoading(false));
  }, [date]);

  if (!date) return null;

  return (
    <div className="an-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="an-modal" onClick={(e) => e.stopPropagation()}>
        <div className="an-modal-head">
          <h2 className="an-card-title">Sales for {date}</h2>
          <button className="an-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {loading && <div className="an-empty">Loading…</div>}
        {error && <div className="an-empty" style={{ color: '#dc2626' }}>{error}</div>}

        {data && (
          <>
            <div className="an-modal-summary">
              <div>
                <span className="an-kpi-label">Orders</span>
                <div className="an-kpi-value">{num(data.summary.orders)}</div>
              </div>
              <div>
                <span className="an-kpi-label">Items sold</span>
                <div className="an-kpi-value">{num(data.summary.items)}</div>
              </div>
              <div>
                <span className="an-kpi-label">Revenue</span>
                <div className="an-kpi-value">{peso(data.summary.revenue)}</div>
              </div>
            </div>

            {data.orders.length === 0 && (
              <div className="an-empty">No orders on this date.</div>
            )}

            {data.orders.map((o) => (
              <div key={o.id} className="an-day-order">
                <div className="an-day-order-head">
                  <div>
                    <strong>{o.orderNumber}</strong>
                    <span className={`an-badge an-badge-${o.status.toLowerCase()}`}>{o.status.toLowerCase()}</span>
                  </div>
                  <div>
                    <span className="an-kpi-label">{o.buyer?.name || 'Guest'}</span>
                    <div style={{ textAlign: 'right', fontWeight: 600, color: '#059669' }}>{peso(o.total)}</div>
                  </div>
                </div>
                <ul className="an-day-order-items">
                  {o.items.map((it) => (
                    <li key={it.id}>
                      <span className="an-toplist-thumb">
                        {resolveImg(it.productImage) ? (
                          <img src={resolveImg(it.productImage)} alt="" />
                        ) : (
                          <span className="an-toplist-thumb-fallback" />
                        )}
                      </span>
                      <span className="an-day-order-item-body">
                        <span>{it.productName}</span>
                        <span className="an-toplist-sub">{peso(it.price)} × {it.quantity}</span>
                      </span>
                      <span style={{ fontWeight: 600 }}>{peso(it.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default DayDetailModal;
