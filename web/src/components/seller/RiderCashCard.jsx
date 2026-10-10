import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Money, Phone } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import RiderActionSheet from '../orders/RiderActionSheet';
import '../orders/RiderDelivery.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (d) => (d
  ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

/**
 * Seller Finance, "Rider cash": cash-on-delivery money a MoorMove rider
 * collected from buyers and still has to bring to the shop (with Cash
 * received for each), and the cash already handed over.
 *
 * Shows while riders are on for the site, or while a rider still holds cash.
 */
export default function RiderCashCard({ ridersOn }) {
  const [tab, setTab] = useState('held');
  const [data, setData] = useState(null); // { heldTotal, items }
  const [held, setHeld] = useState(null); // the held total, whichever tab is open
  const [reload, setReload] = useState(0);
  const [ask, setAsk] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get('/orders/store/rider-cash', { params: { status: tab }, quiet: true })
      .then((res) => {
        if (cancelled) return;
        setData(res.data || { heldTotal: 0, items: [] });
        setHeld(Number(res.data?.heldTotal || 0));
      })
      .catch(() => { if (!cancelled) setData({ heldTotal: 0, items: [], failed: true }); });
    return () => { cancelled = true; };
  }, [tab, reload]);

  // Nothing to show: riders are off and no rider holds any cash.
  if (!ridersOn && !(held > 0)) return null;
  if (data?.failed && held === null) return null;

  const items = data?.items || [];
  return (
    <div className="seller-card rider-cash" style={{ marginBottom: 16 }}>
      <div className="seller-card-header">
        <h2><Money size={16} /> Rider cash</h2>
        <div className="rider-cash-tabs" role="tablist" aria-label="Rider cash">
          {[['held', 'With riders'], ['received', 'Received']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={`rider-cash-tab${tab === key ? ' is-on' : ''}`}
              onClick={() => { if (tab !== key) { setData(null); setTab(key); } }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rider-cash-total">
        <span>Cash riders still have to bring you</span>
        <strong>{held === null ? '…' : peso(held)}</strong>
        <small>Cash on delivery money a MoorMove rider collected from buyers, without the delivery fee (the rider keeps that).</small>
      </div>

      {data === null ? (
        <p className="rider-cash-empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rider-cash-empty">
          {tab === 'held' ? 'No rider is holding cash for you.' : 'No rider cash received yet.'}
        </p>
      ) : (
        <ul className="rider-cash-list">
          {items.map((it) => (
            <li key={it.orderId}>
              <div className="rider-cash-main">
                <Link to={`/seller/orders?id=${it.orderId}`} className="rider-cash-order">#{it.orderNumber}</Link>
                <span className="rider-cash-meta">
                  {it.riderName || 'Rider'}
                  {it.deliveredAt ? ` · delivered ${when(it.deliveredAt)}` : ''}
                  {it.codReturnedAt ? ` · received ${when(it.codReturnedAt)}` : ''}
                </span>
              </div>
              <strong className="rider-cash-amount">{peso(it.amount)}</strong>
              {!it.codReturnedAt && (
                <div className="rider-cash-actions">
                  {it.riderPhone && (
                    <a className="rider-card-btn" href={`tel:${String(it.riderPhone).replace(/[^\d+]/g, '')}`} aria-label={`Call ${it.riderName || 'the rider'}`}>
                      <Phone size={15} weight="fill" /> Call
                    </a>
                  )}
                  <button
                    type="button"
                    className="rider-cash-btn"
                    onClick={() => setAsk({
                      action: 'cash',
                      order: {
                        id: it.orderId,
                        orderNumber: it.orderNumber,
                        riderDelivery: { codAmount: it.amount, riderName: it.riderName },
                      },
                    })}
                  >
                    Cash received
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <RiderActionSheet ask={ask} onClose={() => setAsk(null)} onDone={() => setReload((n) => n + 1)} />
    </div>
  );
}
