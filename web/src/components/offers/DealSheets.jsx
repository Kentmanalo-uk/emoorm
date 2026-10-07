import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Minus, Plus, X, Calculator, Scales, TrendUp, Info,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import {
  MIN_SHARE, below, heads, peso,
} from './offerText';
import './Offers.css';

/*
 * The sheets of a livestock deal: naming a price (the first offer, or an
 * answer in the chat), setting a meetup, and recording the sale after
 * meeting. A bottom sheet on phones, a dialog on computers.
 */

const ANIMALS = {
  PIG: 'pigs', COW: 'cattle', CARABAO: 'carabaos', GOAT: 'goats', SHEEP: 'sheep', CHICKEN: 'chickens', DUCK: 'ducks', TURKEY: 'turkeys', RABBIT: 'rabbits', HORSE: 'horses',
};

const amount = (text) => {
  const n = Number(String(text).replace(/,/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const moneyInput = (v) => v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');

/** The frame every sheet shares: backdrop, panel, title and close. */
function Sheet({
  title, label, onClose, onSubmit, children,
}) {
  const isPhone = usePhoneLayout();
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

  return createPortal(
    <div className={`of-backdrop${isPhone ? ' is-sheet' : ''}`} onClick={onClose} role="presentation">
      <form className="of-dialog" role="dialog" aria-modal="true" aria-label={label || title} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} noValidate>
        {isPhone && <span className="of-grip" aria-hidden="true" />}
        <div className="of-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="of-icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </form>
    </div>,
    document.body,
  );
}

/** The animal on the table: photo, name and asking price. */
function DealHead({ deal, listPrice }) {
  return (
    <div className="of-item">
      <img src={resolveImg(deal.image) || '/placeholder-product.png'} alt="" />
      <span>
        <b>{deal.name}</b>
        <small>{`Asking ${peso(listPrice)} per head · ${heads(deal.stock)} available`}</small>
      </span>
    </div>
  );
}

/**
 * Name a price per head for some heads: the first offer (from the product
 * page) or an answer in the chat. Works out the total, how it compares with
 * the asking price, the price per kilo, and what buyers usually pay.
 *
 * deal: { productId, name, image, listPrice, stock, weightKg }
 * initial: { quantity, price }
 */
export function PriceSheet({
  deal, initial = {}, title = 'Make an offer', submitLabel = 'Send offer', side = 'buyer', theirPrice = null, onSubmit, onClose,
}) {
  const listPrice = Number(deal.listPrice) || 0;
  const stock = Math.max(1, Number(deal.stock) || 1);
  const [qty, setQty] = useState(Math.min(stock, Math.max(1, Number(initial.quantity) || 1)));
  const [price, setPrice] = useState(String(initial.price ?? Math.round(listPrice * 0.95)));
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [usual, setUsual] = useState(null);
  const lowest = Math.ceil(listPrice * MIN_SHARE);
  const value = amount(price);
  const valid = value >= lowest && value <= listPrice;
  const weight = Number(deal.weightKg) || 0;

  useEffect(() => {
    if (!deal.productId) return undefined;
    let live = true;
    axios.get('/offers/estimate', { params: { productId: deal.productId }, quiet: true })
      .then((res) => { if (live && res.data?.low) setUsual(res.data); })
      .catch(() => {});
    return () => { live = false; };
  }, [deal.productId]);

  const send = async (e) => {
    e.preventDefault();
    if (!valid || sending) return;
    setError('');
    setSending(true);
    try {
      await onSubmit({ quantity: qty, price: value, note: note.trim() || undefined });
    } catch (err) {
      setError(err.message || 'Could not send it. Try again.');
      setSending(false);
    }
  };

  const diff = listPrice - value;
  return (
    <Sheet title={title} onClose={onClose} onSubmit={send}>
      <DealHead deal={deal} listPrice={listPrice} />

      <div className="of-field">
        <span className="of-label">How many heads</span>
        <div className="of-stepper">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="Fewer heads"><Minus size={14} weight="bold" /></button>
          <span aria-live="polite">{qty}</span>
          <button type="button" onClick={() => setQty((q) => Math.min(stock, q + 1))} disabled={qty >= stock} aria-label="More heads"><Plus size={14} weight="bold" /></button>
        </div>
      </div>

      <label className="of-field" htmlFor="of-price">
        <span className="of-label">
          Your price per head
          {theirPrice != null && <i>{` · they said ${peso(theirPrice)}`}</i>}
        </span>
        <span className="of-money">
          <b>₱</b>
          <input id="of-price" inputMode="decimal" value={price} onChange={(e) => setPrice(moneyInput(e.target.value))} aria-describedby="of-price-help" />
        </span>
      </label>
      <div className="of-chips" role="group" aria-label="Quick prices">
        {[15, 10, 5, 0].map((pct) => {
          const p = Math.round(listPrice * (1 - pct / 100));
          return (
            <button key={pct} type="button" className={`of-chip${value === p ? ' is-on' : ''}`} onClick={() => setPrice(String(p))}>
              {pct ? `−${pct}%` : 'Asking'}
            </button>
          );
        })}
      </div>
      {price !== '' && !valid && (
        <p id="of-price-help" className="of-help is-bad">
          {value > listPrice ? `Up to the asking price, ${peso(listPrice)}.` : `From ${peso(lowest)} per head (half the asking price).`}
        </p>
      )}

      <div className="of-calc" aria-live="polite">
        <div className="of-calc-total">
          <span>
            <Calculator size={16} weight="fill" aria-hidden="true" />
            {valid ? `${heads(qty)} × ${peso(value)}` : 'Total'}
          </span>
          <strong>{valid ? peso(value * qty) : '—'}</strong>
        </div>
        {valid && (
          <ul className="of-calc-lines">
            <li>
              <TrendUp size={15} aria-hidden="true" />
              {diff > 0
                ? `${peso(diff)} less per head than asking (${below(value, listPrice)}% off)${qty > 1 ? ` · ${peso(diff * qty)} less in all` : ''}`
                : 'At the asking price'}
            </li>
            {weight > 0 && (
              <li>
                <Scales size={15} aria-hidden="true" />
                {`About ${peso(Math.round(value / weight))} per kilo live weight (≈${weight} kg each)`}
              </li>
            )}
            {usual && (
              <li className="of-calc-usual">
                <Info size={15} aria-hidden="true" />
                {`Similar ${ANIMALS[usual.animal] || 'animals'}${usual.town ? ` in ${usual.town}` : ''} usually go for ${peso(usual.low)}–${peso(usual.high)} per head`}
              </li>
            )}
          </ul>
        )}
      </div>

      <label className="of-field of-field--stack" htmlFor="of-note">
        <span className="of-label">Message <i>(optional)</i></span>
        <textarea id="of-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={side === 'buyer' ? 'e.g. Can I see them on Saturday?' : 'e.g. They are vaccinated and healthy'} />
      </label>
      {error && <p className="of-error" role="alert">{error}</p>}

      <button type="submit" className="of-send" disabled={!valid || sending}>
        {sending ? 'Sending…' : submitLabel}
      </button>
      <p className="of-fineprint">
        {side === 'buyer'
          ? 'No payment now. You talk it over in chat, meet to see the animals, and pay in person.'
          : 'The buyer can accept, answer with another price, or decline.'}
      </p>
    </Sheet>
  );
}

/** "2026-10-11T09:00" for a datetime-local input, in local time. */
const localInput = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** When and where to meet; the shop's pickup spot is offered first. */
export function MeetupSheet({ deal, onSubmit, onClose }) {
  // Tomorrow at 9 AM, unless a meetup is set already.
  const [at, setAt] = useState(() => {
    if (deal.meetAt) return localInput(new Date(deal.meetAt));
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return localInput(d);
  });
  const [now] = useState(() => localInput(new Date()));
  const [place, setPlace] = useState(deal.meetPlace || deal.store?.pickupAddress || '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async (e) => {
    e.preventDefault();
    if (!at || !place.trim()) { setError('Choose a day and time, and say where.'); return; }
    setSending(true);
    setError('');
    try {
      await onSubmit({ at: new Date(at).toISOString(), place: place.trim() });
    } catch (err) {
      setError(err.message || 'Could not set the meetup.');
      setSending(false);
    }
  };

  return (
    <Sheet title={deal.meetAt ? 'Change the meetup' : 'Set a meetup'} onClose={onClose} onSubmit={send}>
      <p className="of-asking">Meet to see the animals and settle the deal. Both of you see it in the chat.</p>
      <label className="of-field of-field--stack" htmlFor="of-meet-at">
        <span className="of-label">Day and time</span>
        <input id="of-meet-at" className="of-input" type="datetime-local" value={at} min={now} onChange={(e) => setAt(e.target.value)} />
      </label>
      <label className="of-field of-field--stack" htmlFor="of-meet-place">
        <span className="of-label">Place</span>
        <input id="of-meet-place" className="of-input" type="text" maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. the farm, or the town plaza" />
      </label>
      {error && <p className="of-error" role="alert">{error}</p>}
      <button type="submit" className="of-send" disabled={sending}>{sending ? 'Saving…' : 'Send meetup'}</button>
    </Sheet>
  );
}

/**
 * After meeting: the heads and the total agreed in person (filled in from
 * the agreement, and changeable). The buyer confirms it.
 */
export function RecordSheet({ deal, onSubmit, onClose }) {
  const stock = Math.max(1, Number(deal.product?.stock) || deal.quantity || 1);
  const [qty, setQty] = useState(Math.min(stock, deal.quantity));
  const [total, setTotal] = useState(String(Math.round((deal.agreedPrice || deal.price) * Math.min(stock, deal.quantity))));
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const value = amount(total);
  const valid = value > 0;

  const changeQty = (n) => {
    setQty(n);
    // Until the seller types a total, it follows the agreed price per head.
    if (!touched) setTotal(String(Math.round((deal.agreedPrice || deal.price) * n)));
  };

  const send = async (e) => {
    e.preventDefault();
    if (!valid || sending) return;
    setSending(true);
    setError('');
    try {
      await onSubmit({ quantity: qty, total: value, note: note.trim() || undefined });
    } catch (err) {
      setError(err.message || 'Could not mark it as done.');
      setSending(false);
    }
  };

  return (
    <Sheet title="Mark the deal as done" onClose={onClose} onSubmit={send}>
      <p className="of-asking">{`Agreed: ${peso(deal.agreedPrice)} per head for ${heads(deal.quantity)}. Enter what you settled on in person.`}</p>
      <div className="of-field">
        <span className="of-label">Heads sold</span>
        <div className="of-stepper">
          <button type="button" onClick={() => changeQty(Math.max(1, qty - 1))} disabled={qty <= 1} aria-label="Fewer heads"><Minus size={14} weight="bold" /></button>
          <span aria-live="polite">{qty}</span>
          <button type="button" onClick={() => changeQty(Math.min(stock, qty + 1))} disabled={qty >= stock} aria-label="More heads"><Plus size={14} weight="bold" /></button>
        </div>
      </div>
      <label className="of-field" htmlFor="of-total">
        <span className="of-label">Total paid</span>
        <span className="of-money">
          <b>₱</b>
          <input id="of-total" inputMode="decimal" value={total} onChange={(e) => { setTouched(true); setTotal(moneyInput(e.target.value)); }} />
        </span>
      </label>
      {valid && <p className="of-help">{`${peso(value / qty)} per head`}</p>}
      <label className="of-field of-field--stack" htmlFor="of-record-note">
        <span className="of-label">Note <i>(optional)</i></span>
        <textarea id="of-record-note" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Picked up at the farm, paid in cash" />
      </label>
      {error && <p className="of-error" role="alert">{error}</p>}
      <button type="submit" className="of-send" disabled={!valid || sending}>{sending ? 'Saving…' : 'Mark as done'}</button>
      <p className="of-fineprint">The buyer confirms it in the chat. If they don&apos;t answer, it confirms itself after 3 days.</p>
    </Sheet>
  );
}
