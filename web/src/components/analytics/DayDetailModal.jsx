import { useEffect, useState } from 'react';
import { X } from '../../lib/icons';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import { peso, num } from './format';
import { riderFeeNote, shopTotalOf } from '../../lib/moormove';
import useFocusTrap from '../../hooks/useFocusTrap';
import { statusLabel } from '../../lib/orderProgress';
import { OrderState } from '../orders/OrderLook';
import './analytics.css';

const DayDetailModal = ({ date, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const dialogRef = useFocusTrap(Boolean(date), { onClose });

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
    <div className="an-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" ref={dialogRef}>
      <div className="an-modal" onClick={(e) => e.stopPropagation()}>
        <div className="an-modal-head">
          <h2 className="an-card-title">Sales for {date}</h2>
          <button className="an-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {loading && <div className="an-empty">Loading…</div>}
        {error && <div className="an-empty" style={{ color: 'var(--t-danger-600, #dc2626)' }}>{error}</div>}

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
                {/* Who ordered and when lead; the order number is a reference. */}
                <div className="an-day-order-head">
                  <div className="an-day-order-who">
                    <strong>{o.buyer?.name || 'Guest'}</strong>
                    <span className="an-toplist-sub">
                      {o.createdAt ? `${new Date(o.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })} · ` : ''}#{o.orderNumber}
                    </span>
                  </div>
                  <div className="an-day-order-side">
                    <div className="an-day-order-total">{peso(shopTotalOf(o))}</div>
                    <OrderState status={o.status} label={o.status === 'PENDING' ? 'New' : statusLabel(o.status, o.fulfillmentMethod)} />
                    {riderFeeNote(o) && <div className="an-toplist-sub">{riderFeeNote(o)}</div>}
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
