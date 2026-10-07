import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Handshake, Minus, Plus, X } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import {
  OPEN, below, heads, peso, statusText,
} from './offerText';
import './Offers.css';

/*
 * On a livestock page: "Make an offer" (a price per head for some heads),
 * or, once there is one, where it stands: waiting, a counteroffer to answer,
 * or an agreed price to buy at.
 */

const MIN_SHARE = 0.5;

function MakeOffer({ product, listPrice, onClose, onMade }) {
  const isPhone = usePhoneLayout();
  const stock = Math.max(1, Number(product.stock) || 1);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(String(Math.round(listPrice * 0.9)));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const lowest = Math.ceil(listPrice * MIN_SHARE);
  const value = Number(price);
  const valid = Number.isFinite(value) && value >= lowest && value < listPrice;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const res = await axios.post('/offers', {
        productId: product.id, quantity: qty, price: value, note: note.trim() || undefined,
      });
      toast.success('Offer sent. The seller answers within 48 hours.');
      onMade(res.data);
    } catch (err) {
      setError(err.message || 'Could not send the offer.');
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className={`of-backdrop${isPhone ? ' is-sheet' : ''}`} onClick={onClose} role="presentation">
      <form className="of-dialog" role="dialog" aria-modal="true" aria-label="Make an offer" onClick={(e) => e.stopPropagation()} onSubmit={send}>
        <div className="of-dialog-head">
          <h2>Make an offer</h2>
          <button type="button" className="of-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="of-asking">{`Asking ${peso(listPrice)} per head · ${heads(stock)} available`}</p>

        <div className="of-field">
          <span className="of-label">Heads</span>
          <div className="of-stepper">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Fewer"><Minus size={14} /></button>
            <span aria-live="polite">{qty}</span>
            <button type="button" onClick={() => setQty((q) => Math.min(stock, q + 1))} disabled={qty >= stock} aria-label="More"><Plus size={14} /></button>
          </div>
        </div>

        <label className="of-field" htmlFor="of-price">
          <span className="of-label">Your price per head</span>
          <span className="of-money">
            <b>₱</b>
            <input
              id="of-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
              aria-describedby="of-price-help"
            />
          </span>
        </label>
        <div className="of-chips" role="group" aria-label="Quick prices">
          {[5, 10, 15, 20].map((pct) => {
            const p = Math.round(listPrice * (1 - pct / 100));
            return (
              <button key={pct} type="button" className={`of-chip${value === p ? ' is-on' : ''}`} onClick={() => setPrice(String(p))}>
                {`−${pct}%`}
              </button>
            );
          })}
        </div>
        <p id="of-price-help" className={`of-help${price && !valid ? ' is-bad' : ''}`}>
          {!price || valid
            ? `${peso(lowest)} up to ${peso(listPrice - 1)}`
            : value >= listPrice ? "That's the asking price or more: just buy it." : `Offers start at ${peso(lowest)} per head.`}
        </p>

        <label className="of-field of-field--stack" htmlFor="of-note">
          <span className="of-label">Note to the seller <i>(optional)</i></span>
          <textarea id="of-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. For a fiesta on Sunday, I can pick up Saturday" />
        </label>

        {valid && (
          <div className="of-total">
            <span>{`${heads(qty)} × ${peso(value)}`}</span>
            <strong>{peso(value * qty)}</strong>
            <small>{`${below(value, listPrice)}% below asking`}</small>
          </div>
        )}
        {error && <p className="of-error">{error}</p>}

        <button type="submit" className="of-send" disabled={!valid || sending}>
          {sending ? 'Sending…' : 'Send offer'}
        </button>
        <p className="of-fineprint">The seller can accept, decline or counter once. Agreed, you have 24 hours to buy at that price.</p>
      </form>
    </div>,
    document.body,
  );
}

export default function OfferPanel({ product, listPrice, cannotBuy = false }) {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [offer, setOffer] = useState(null);
  const [making, setMaking] = useState(false);
  const [busy, setBusy] = useState(false);
  const own = Boolean(user?.id && product?.store?.owner?.id === user.id);
  const offerable = product?.productType === 'LIVESTOCK' && product?.acceptsOffers !== false && !own;
  const productId = product?.id;

  const load = useCallback(() => {
    if (!offerable || !isAuthenticated) return undefined;
    let live = true;
    axios.get('/offers/mine', { quiet: true })
      .then((res) => {
        if (!live) return;
        const mine = (res.data || []).find((o) => o.product?.id === productId && OPEN.includes(o.status));
        setOffer(mine || null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [offerable, isAuthenticated, productId]);
  useEffect(() => load(), [load]);

  if (!offerable) return null;

  const start = () => {
    if (!isAuthenticated) {
      navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setMaking(true);
  };

  const act = async (path, body, done) => {
    setBusy(true);
    try {
      const res = await axios.post(`/offers/${offer.id}/${path}`, body);
      setOffer(OPEN.includes(res.data.status) ? res.data : null);
      if (done) toast.success(done);
    } catch (err) {
      toast.error(err.message || 'Could not update the offer.');
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="of-panel">
      {!offer ? (
        <>
          <button type="button" className="of-make" onClick={start} disabled={cannotBuy}>
            <Handshake size={20} weight="fill" aria-hidden="true" /> Make an offer
          </button>
          <span className="of-panel-hint">Name your price per head. The seller answers within 48 hours.</span>
        </>
      ) : (
        <div className={`of-state of-state--${offer.status.toLowerCase()}`}>
          <div className="of-state-text">
            <strong>
              {offer.status === 'COUNTERED' && `Counteroffer: ${peso(offer.counterPrice)} per head`}
              {offer.status === 'ACCEPTED' && `Agreed: ${peso(offer.agreedPrice)} per head × ${offer.quantity}`}
              {offer.status === 'PENDING' && `Your offer: ${peso(offer.offerPrice)} per head × ${offer.quantity}`}
            </strong>
            <span>{statusText(offer, 'buyer')}</span>
            {offer.sellerNote && offer.status !== 'PENDING' && <em>{`“${offer.sellerNote}”`}</em>}
          </div>
          <div className="of-state-actions">
            {offer.status === 'ACCEPTED' && (
              <button type="button" className="of-btn of-btn--primary" onClick={() => navigate('/checkout', { state: { offerId: offer.id } })}>
                Buy at agreed price
              </button>
            )}
            {offer.status === 'COUNTERED' && (
              <>
                <button type="button" className="of-btn of-btn--primary" disabled={busy} onClick={() => act('answer', { action: 'accept' }, 'Agreed. You have 24 hours to buy.')}>Accept</button>
                <button type="button" className="of-btn" disabled={busy} onClick={() => act('answer', { action: 'decline' }, 'Counteroffer declined')}>Decline</button>
              </>
            )}
            {offer.status !== 'COUNTERED' && (
              <button type="button" className="of-btn of-btn--quiet" disabled={busy} onClick={() => act('cancel', undefined, 'Offer withdrawn')}>Withdraw</button>
            )}
          </div>
          <Link to="/profile/offers" className="of-all">My offers</Link>
        </div>
      )}
      {making && (
        <MakeOffer
          product={product}
          listPrice={listPrice}
          onClose={() => setMaking(false)}
          onMade={(made) => { setMaking(false); setOffer(made); }}
        />
      )}
    </div>
  );
}
