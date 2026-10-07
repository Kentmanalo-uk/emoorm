import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import EmptyArt from '../components/ui/EmptyArt';
import {
  heads, peso, statusText,
} from '../components/offers/offerText';
import '../components/offers/Offers.css';

/*
 * The buyer's price offers on livestock: open ones (waiting, or a
 * counteroffer to answer), agreed ones (buy within 24 hours) and closed ones.
 */

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'accepted', label: 'Agreed' },
  { key: 'closed', label: 'Closed' },
];

export default function ProfileOffers() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('open');
  const [offers, setOffers] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => axios.get('/offers/mine', { params: { status: tab } })
    .then((res) => setOffers(res.data || []))
    .catch((err) => { setOffers([]); toast.error(err.message || 'Could not load your offers'); }), [tab]);
  useEffect(() => { load(); }, [load]);

  const act = async (offer, path, body, done) => {
    setBusy(offer.id);
    try {
      await axios.post(`/offers/${offer.id}/${path}`, body);
      toast.success(done);
      load();
    } catch (err) {
      toast.error(err.message || 'Could not update the offer');
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="profile-page-wrap of-page">
      <header className="profile-page-header">
        <h1 className="profile-page-title">My Offers</h1>
        <p className="profile-page-subtitle">Prices you offered on livestock, and what the sellers said.</p>
      </header>

      <div className="of-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`of-tab${tab === t.key ? ' is-on' : ''}`}
            onClick={() => { setOffers(null); setTab(t.key); }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {offers === null ? (
        <p className="of-empty">Loading…</p>
      ) : offers.length === 0 ? (
        <div className="empty-state">
          <EmptyArt name="shopping" size={96} />
          <p className="empty-state-text">{tab === 'closed' ? 'No closed offers' : 'No offers here'}</p>
          <p className="empty-state-hint">On a livestock listing, tap Make an offer to name your price per head.</p>
          <Link to="/products" className="empty-state-button">Browse products</Link>
        </div>
      ) : (
        <ul className="of-list">
          {offers.map((o) => (
            <li key={o.id} className="of-row">
              <Link to={o.product?.slug ? `/product/${o.product.slug}` : '#'}>
                <img className="of-row-img" src={resolveImg(o.product?.image) || '/placeholder-product.png'} alt="" />
              </Link>
              <div className="of-row-body">
                <span className="of-row-title">{o.product?.name}</span>
                <span className="of-row-meta">{`${o.store?.name} · ${heads(o.quantity)}`}</span>
                <span className="of-row-prices">
                  <s>{`${peso(o.listPrice)}`}</s>
                  <span>{`You offered ${peso(o.offerPrice)}`}</span>
                  {o.counterPrice != null && <span>{`Seller: ${peso(o.counterPrice)}`}</span>}
                  {o.agreedPrice != null && <strong>{`Agreed ${peso(o.agreedPrice)} per head`}</strong>}
                </span>
                <span className={`of-row-status is-${o.status.toLowerCase()}`}>{statusText(o, 'buyer')}</span>
                {o.sellerNote && <span className="of-row-note">{`“${o.sellerNote}”`}</span>}
                <div className="of-row-actions">
                  {o.status === 'ACCEPTED' && (
                    <button type="button" className="of-btn of-btn--primary" onClick={() => navigate('/checkout', { state: { offerId: o.id } })}>
                      {`Buy for ${peso(o.agreedPrice * o.quantity)}`}
                    </button>
                  )}
                  {o.status === 'COUNTERED' && (
                    <>
                      <button type="button" className="of-btn of-btn--primary" disabled={busy === o.id} onClick={() => act(o, 'answer', { action: 'accept' }, 'Agreed. You have 24 hours to buy.')}>
                        {`Accept ${peso(o.counterPrice)}`}
                      </button>
                      <button type="button" className="of-btn" disabled={busy === o.id} onClick={() => act(o, 'answer', { action: 'decline' }, 'Counteroffer declined')}>Decline</button>
                    </>
                  )}
                  {(o.status === 'PENDING' || o.status === 'ACCEPTED') && (
                    <button type="button" className="of-btn of-btn--quiet" disabled={busy === o.id} onClick={() => act(o, 'cancel', undefined, 'Offer withdrawn')}>Withdraw</button>
                  )}
                  {o.status === 'USED' && o.orderId && (
                    <Link to={`/profile/orders?id=${o.orderId}`} className="of-btn">See the order</Link>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
