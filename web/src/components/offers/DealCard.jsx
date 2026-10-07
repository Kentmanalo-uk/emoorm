import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Phone, Handshake, CalendarCheck, MapPin, CheckCircle, Receipt,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import { confirmAction } from '../../lib/confirm';
import {
  TALKING, dealStatus, heads, peso, telHref, when, day,
} from './offerText';
import { PriceSheet, MeetupSheet, RecordSheet } from './DealSheets';
import './Offers.css';

/*
 * A livestock deal as a card in the chat: the animal, the price on the table
 * and the total, where it stands, and the next steps for this side: accept,
 * answer with another price or decline; set a meetup; mark it as done
 * (seller); confirm it (buyer). The buyer can call the seller, and the
 * seller the buyer once they have agreed.
 */

export default function DealCard({ deal, side, onChanged, compact = false }) {
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = side === 'buyer' ? 'BUYER' : 'SELLER';
  const myTurn = deal.turn === me;
  const talking = TALKING.includes(deal.status);
  const status = dealStatus(deal, side);
  const phone = side === 'buyer' ? deal.sellerPhone : deal.buyerPhone;
  const closed = !['PENDING', 'COUNTERED', 'ACCEPTED', 'CONFIRMING'].includes(deal.status);
  const final = deal.finalTotal != null;
  const sheetDeal = {
    productId: deal.product?.id,
    name: deal.product?.name,
    image: deal.product?.image,
    listPrice: deal.listPrice,
    stock: deal.product?.stock,
    weightKg: deal.product?.weightKg,
  };

  const post = async (action, body, done) => {
    setBusy(true);
    try {
      await axios.post(`/offers/${deal.id}/${action}`, body || {});
      if (done) toast.success(done);
      setSheet(null);
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Could not update the deal');
      onChanged?.();
      throw err;
    } finally {
      setBusy(false);
    }
  };
  const tap = (action, body, done) => post(action, body, done).catch(() => {});

  const ask = async (action, question, done) => {
    if (!(await confirmAction(question))) return;
    tap(action, undefined, done);
  };

  return (
    <div className={`of-deal${compact ? ' is-compact' : ''} is-${status.tone}`}>
      <div className="of-deal-top">
        <Link to={deal.product?.slug ? `/product/${deal.product.slug}` : '#'} className="of-deal-img">
          <img src={resolveImg(deal.product?.image) || '/placeholder-product.png'} alt="" />
        </Link>
        <div className="of-deal-what">
          <span className="of-deal-name">{deal.product?.name}</span>
          <span className={`of-badge is-${status.tone}`}>{status.label}</span>
        </div>
        {phone && !closed && (
          <a className="of-call" href={telHref(phone)} aria-label={side === 'buyer' ? 'Call the seller' : 'Call the buyer'}>
            <Phone size={18} weight="fill" aria-hidden="true" />
            <span>Call</span>
          </a>
        )}
      </div>

      <div className="of-deal-price">
        {final ? (
          <>
            <span>{`${heads(deal.finalQuantity)} · paid in person`}</span>
            <strong>{peso(deal.finalTotal)}</strong>
          </>
        ) : (
          <>
            <span>
              {`${heads(deal.quantity)} × ${peso(deal.price)}`}
              {deal.price < deal.listPrice && <s>{peso(deal.listPrice)}</s>}
            </span>
            <strong>{peso(deal.total)}</strong>
          </>
        )}
      </div>

      {deal.meetAt && ['ACCEPTED', 'CONFIRMING'].includes(deal.status) && (
        <p className="of-deal-meet">
          <CalendarCheck size={15} weight="fill" aria-hidden="true" />
          <span>{`${day(deal.meetAt)}, ${new Date(deal.meetAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`}</span>
          <MapPin size={15} weight="fill" aria-hidden="true" />
          <span>{deal.meetPlace}</span>
        </p>
      )}
      {!compact && deal.status === 'ACCEPTED' && (
        <p className="of-deal-hint">
          {side === 'buyer'
            ? 'Meet the seller to see the animals and pay in person. The seller then marks it as done for you to confirm.'
            : `Meet the buyer, then tap Mark as done with the heads and total you settled on${deal.meetBy ? ` (by ${day(deal.meetBy)})` : ''}.`}
        </p>
      )}
      {!compact && deal.status === 'CONFIRMING' && (
        <p className="of-deal-hint">
          {side === 'buyer'
            ? `Is this right? It confirms itself on ${when(deal.respondBy)} if you don't answer.`
            : `The buyer confirms it, or it confirms itself on ${when(deal.respondBy)}.`}
        </p>
      )}

      {!closed && (
        <div className="of-deal-actions">
          {talking && myTurn && (
            <>
              <button type="button" className="of-btn of-btn--primary" disabled={busy} onClick={() => tap('accept', undefined, 'Deal! Now arrange to meet.')}>
                <Handshake size={16} weight="fill" aria-hidden="true" />
                {`Accept ${peso(deal.price)}`}
              </button>
              <button type="button" className="of-btn" disabled={busy} onClick={() => setSheet('price')}>Counter</button>
              <button
                type="button"
                className="of-btn of-btn--quiet"
                disabled={busy}
                onClick={() => ask('decline', { title: 'Decline this price?', message: 'This ends the talks on this deal.', confirmLabel: 'Decline', danger: true }, 'Declined')}
              >
                Decline
              </button>
            </>
          )}
          {talking && !myTurn && (
            <>
              <button type="button" className="of-btn" disabled={busy} onClick={() => setSheet('price')}>Change my price</button>
              {side === 'buyer' ? (
                <button
                  type="button"
                  className="of-btn of-btn--quiet"
                  disabled={busy}
                  onClick={() => ask('decline', { title: 'Withdraw your offer?', message: 'The seller will be told.', confirmLabel: 'Withdraw', danger: true }, 'Offer withdrawn')}
                >
                  Withdraw
                </button>
              ) : (
                <button
                  type="button"
                  className="of-btn of-btn--quiet"
                  disabled={busy}
                  onClick={() => ask('decline', { title: 'End the talks?', message: 'The buyer will be told.', confirmLabel: 'End talks', danger: true }, 'Talks ended')}
                >
                  End talks
                </button>
              )}
            </>
          )}
          {deal.status === 'ACCEPTED' && (
            <>
              {side === 'seller' && (
                <button type="button" className="of-btn of-btn--primary" disabled={busy} onClick={() => setSheet('record')}>
                  <Receipt size={16} weight="fill" aria-hidden="true" />
                  Mark as done
                </button>
              )}
              <button type="button" className="of-btn" disabled={busy} onClick={() => setSheet('meet')}>
                {deal.meetAt ? 'Change meetup' : 'Set a meetup'}
              </button>
              <button
                type="button"
                className="of-btn of-btn--quiet"
                disabled={busy}
                onClick={() => ask('call-off', { title: 'Call off this deal?', message: "The other side will be told. You can't undo this.", confirmLabel: 'Call off', danger: true }, 'Deal called off')}
              >
                Call off
              </button>
            </>
          )}
          {deal.status === 'CONFIRMING' && side === 'buyer' && (
            <>
              <button type="button" className="of-btn of-btn--primary" disabled={busy} onClick={() => tap('confirm', undefined, 'Purchase confirmed. Thank you!')}>
                <CheckCircle size={16} weight="fill" aria-hidden="true" />
                Confirm purchase
              </button>
              <button
                type="button"
                className="of-btn of-btn--quiet"
                disabled={busy}
                onClick={() => ask('not-right', { title: "Not what you agreed?", message: 'The sale is undone and the seller is asked to record it again.', confirmLabel: "It's not right", danger: true }, 'The seller has been told')}
              >
                Not right
              </button>
            </>
          )}
        </div>
      )}
      {deal.status === 'SOLD' && deal.orderId && (
        <div className="of-deal-actions">
          <Link className="of-btn" to={side === 'buyer' ? `/profile/orders?id=${deal.orderId}` : `/seller/orders?id=${deal.orderId}`}>See the order</Link>
        </div>
      )}

      {sheet === 'price' && (
        <PriceSheet
          deal={sheetDeal}
          side={side}
          title={myTurn ? 'Answer with your price' : 'Change your price'}
          submitLabel={myTurn ? 'Send my price' : 'Change price'}
          theirPrice={myTurn ? deal.price : null}
          initial={{ quantity: deal.quantity, price: Math.round(deal.price) }}
          onSubmit={(body) => post('price', body, 'Price sent')}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'meet' && (
        <MeetupSheet deal={deal} onSubmit={(body) => post('meetup', body, 'Meetup sent')} onClose={() => setSheet(null)} />
      )}
      {sheet === 'record' && (
        <RecordSheet deal={deal} onSubmit={(body) => post('record', body, 'Marked as done. The buyer will confirm it.')} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
