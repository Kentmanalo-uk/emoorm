import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import UserAvatar from '../components/ui/UserAvatar';
import SellerPageHead from '../components/seller/SellerPageHead';
import {
  below, heads, peso, statusText,
} from '../components/offers/offerText';
import '../components/offers/Offers.css';

/*
 * Seller Center: price offers buyers made on the shop's livestock. Accept,
 * decline, or counter once with a price (and a note); answered offers wait
 * for the buyer, agreed ones for their purchase.
 */

const TABS = [
  { key: 'open', label: 'To answer' },
  { key: 'accepted', label: 'Agreed' },
  { key: 'closed', label: 'Closed' },
];

function Answer({ offer, onDone }) {
  const [mode, setMode] = useState(null);
  const [price, setPrice] = useState(String(Math.round((offer.offerPrice + offer.listPrice) / 2)));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (action) => {
    setBusy(true);
    try {
      await axios.post(`/offers/${offer.id}/respond`, {
        action,
        ...(action === 'counter' ? { price: Number(price) } : {}),
        note: note.trim() || undefined,
      });
      toast.success({ accept: 'Offer accepted. The buyer has 24 hours to buy.', decline: 'Offer declined', counter: 'Counteroffer sent' }[action]);
      onDone();
    } catch (err) {
      toast.error(err.message || 'Could not answer the offer');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'counter' || mode === 'decline') {
    return (
      <div className="of-counter">
        {mode === 'counter' && (
          <span className="of-money">
            <b>₱</b>
            <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Your price per head" />
          </span>
        )}
        <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'counter' ? 'Note (optional)' : 'Reason (optional)'} aria-label="Note" />
        <button type="button" className={`of-btn ${mode === 'counter' ? 'of-btn--primary' : 'of-btn--danger'}`} disabled={busy} onClick={() => send(mode)}>
          {mode === 'counter' ? 'Send counter' : 'Decline'}
        </button>
        <button type="button" className="of-btn of-btn--quiet" onClick={() => setMode(null)}>Back</button>
      </div>
    );
  }
  return (
    <div className="of-row-actions">
      <button type="button" className="of-btn of-btn--primary" disabled={busy} onClick={() => send('accept')}>
        {`Accept ${peso(offer.offerPrice)}`}
      </button>
      <button type="button" className="of-btn" disabled={busy} onClick={() => setMode('counter')}>Counter</button>
      <button type="button" className="of-btn of-btn--quiet" disabled={busy} onClick={() => setMode('decline')}>Decline</button>
    </div>
  );
}

export default function SellerOffers() {
  const [tab, setTab] = useState('open');
  const [data, setData] = useState(null);

  const load = useCallback(() => axios.get('/offers/store', { params: { status: tab } })
    .then((res) => setData(res.data))
    .catch((err) => { setData({ offers: [], pending: 0 }); toast.error(err.message || 'Could not load offers'); }), [tab]);
  useEffect(() => { load(); }, [load]);

  const offers = data?.offers || [];

  return (
    <div className="seller-dashboard">
      <div className="seller-container of-page">
        <SellerPageHead title="Offers" subtitle="Prices buyers offered on your livestock. Answer within 48 hours, or the offer expires." />

      <div className="of-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`of-tab${tab === t.key ? ' is-on' : ''}`}
            onClick={() => { setData(null); setTab(t.key); }}
          >
            {t.label}
            {t.key === 'open' && data?.pending > 0 && <b>{data.pending}</b>}
          </button>
        ))}
      </div>

      {data === null ? (
        <p className="of-empty">Loading…</p>
      ) : offers.length === 0 ? (
        <p className="of-empty">
          {tab === 'open' ? 'No offers to answer. Buyers can make offers on your livestock listings.' : 'Nothing here yet.'}
        </p>
      ) : (
        <ul className="of-list">
          {offers.map((o) => (
            <li key={o.id} className="of-row">
              <Link to={o.product?.slug ? `/product/${o.product.slug}` : '#'}>
                <img className="of-row-img" src={resolveImg(o.product?.image) || '/placeholder-product.png'} alt="" />
              </Link>
              <div className="of-row-body">
                <span className="of-row-title">{o.product?.name}</span>
                <span className="of-row-meta of-row-buyer">
                  <UserAvatar src={o.buyer?.profilePhoto} name={o.buyer?.fullName?.[0]} imgClassName="of-mini-avatar" fallbackClassName="of-mini-avatar of-mini-avatar--fallback" />
                  {`${o.buyer?.fullName || 'A buyer'} · ${heads(o.quantity)}`}
                </span>
                <span className="of-row-prices">
                  <s>{peso(o.listPrice)}</s>
                  <span>{`Offered ${peso(o.offerPrice)} per head (${below(o.offerPrice, o.listPrice)}% less)`}</span>
                  {o.counterPrice != null && <span>{`You: ${peso(o.counterPrice)}`}</span>}
                  {o.agreedPrice != null && <strong>{`Agreed ${peso(o.agreedPrice)} · ${peso(o.agreedPrice * o.quantity)} in all`}</strong>}
                </span>
                {o.note && <span className="of-row-note">{`“${o.note}”`}</span>}
                <span className={`of-row-status is-${o.status.toLowerCase()}`}>{statusText(o, 'seller')}</span>
                {o.status === 'PENDING' && <Answer offer={o} onDone={load} />}
                {o.status === 'USED' && o.orderId && (
                  <div className="of-row-actions"><Link to={`/seller/orders?id=${o.orderId}`} className="of-btn">See the order</Link></div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
