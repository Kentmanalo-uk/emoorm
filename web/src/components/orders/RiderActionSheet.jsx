import { useState } from 'react';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';
import ConfirmDialog from '../ui/ConfirmDialog';
import { orderPromo, promoSellerLine } from '../../lib/moormove';
import './RiderDelivery.css';

const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CANCEL_REASONS = [
  "I'll deliver it myself",
  'The rider is taking too long',
  'The order is not ready yet',
  'Something else',
];

/**
 * The seller's MoorMove steps, each asked first in a sheet:
 *   book    "Call a rider": the fee, who pays what, the cash the rider brings back
 *   cancel  "Cancel rider" (before pickup)
 *   self    "Deliver it myself" (after a rider cancelled or the delivery failed)
 *   cash    "Cash received": the rider handed over the buyer's cash
 *
 *   <RiderActionSheet ask={{ action: 'book', order }} onClose={…} onDone={(order) => …} />
 *
 * `onDone` gets the updated order from the server.
 */
export default function RiderActionSheet({ ask, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [askedFor, setAskedFor] = useState(null);
  // A fresh choice each time the sheet opens.
  const key = ask ? `${ask.action}:${ask.order?.id}` : null;
  if (key !== askedFor) {
    setAskedFor(key);
    setReason(CANCEL_REASONS[0]);
  }

  const order = ask?.order || {};
  const action = ask?.action;
  const rd = order.riderDelivery || null;
  const number = order.orderNumber ? `#${order.orderNumber}` : 'this order';
  const fee = Number(rd?.fee ?? order.deliveryFee ?? 0);
  const cod = order.paymentMethod === 'COD';
  const cashBack = Math.max(0, Number(order.total || 0) - fee);
  const held = Number(rd?.codAmount || 0);
  // A MoorMove free-delivery promo: MoorMove pays the rider, the buyer pays no fee.
  const promo = orderPromo(order);

  const run = async () => {
    if (!ask || busy) return;
    setBusy(true);
    try {
      const url = `/orders/${order.id}/rider`;
      const res = action === 'book' ? await axios.post(url)
        : action === 'cancel' ? await axios.delete(url, { data: { reason } })
          : action === 'self' ? await axios.post(`${url}/self`)
            : await axios.post(`${url}/cash-received`);
      toast.success({
        book: 'Rider called. We\'ll let you know when one takes it.',
        cancel: 'Rider cancelled',
        self: 'Deliver it yourself, then mark it delivered with a photo',
        cash: 'Cash received. Thank you!',
      }[action]);
      onDone?.(res?.data || null);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'Something went wrong. Try again.');
      // The order moved on meanwhile: the page shows it as it is now.
      if (err?.status === 409) {
        onDone?.(null);
        onClose?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const sheets = {
    book: {
      title: 'Call a MoorMove rider?',
      message: 'A rider near your shop picks up the parcel at your shop pin and brings it to the buyer. Have it packed and ready.',
      confirm: 'Call a rider',
      body: (
        <dl className="rider-sheet-lines">
          {promo && <p className="rider-promo-line">{promoSellerLine(order)}</p>}
          <div>
            <dt>Delivery fee</dt>
            <dd>{promo ? 'Free (MoorMove promo)' : peso(fee)}</dd>
          </div>
          {cod ? (
            <>
              <div>
                <dt>The rider collects from the buyer</dt>
                <dd>{peso(order.total)}</dd>
              </div>
              <div className="is-strong">
                <dt>The rider brings back to you</dt>
                <dd>{peso(cashBack)}</dd>
              </div>
              <p className="rider-sheet-note">
                {promo ? 'MoorMove pays the rider for this delivery.' : `The rider keeps the ${peso(fee)} delivery fee.`} Tap Cash received once they hand you the money.
              </p>
            </>
          ) : (
            <p className="rider-sheet-note">
              {promo
                ? 'The buyer already paid you for the items. You pay the rider nothing; they collect nothing from the buyer.'
                : `The buyer already paid you, delivery fee included. Pay the rider ${peso(fee)} when they pick it up; they collect nothing from the buyer.`}
            </p>
          )}
        </dl>
      ),
    },
    cancel: {
      title: 'Cancel the rider?',
      message: 'The rider is told not to come. You can call another rider or deliver it yourself.',
      confirm: 'Cancel rider',
      danger: true,
      body: (
        <div className="rider-sheet-reasons" role="radiogroup" aria-label="Why">
          {CANCEL_REASONS.map((label) => (
            <label key={label} className={reason === label ? 'is-on' : ''}>
              <input type="radio" name="rider-cancel-reason" checked={reason === label} onChange={() => setReason(label)} />
              {label}
            </label>
          ))}
        </div>
      ),
    },
    self: {
      title: 'Deliver it yourself?',
      message: `No rider will be called for ${number}. You take it to the buyer, then mark it delivered with a photo as usual. ${promo ? 'The buyer still pays no delivery fee.' : `The buyer's delivery fee (${peso(order.deliveryFee)}) stays the same.`}`,
      confirm: 'Deliver it myself',
    },
    cash: {
      title: 'Got the cash from the rider?',
      message: `Only confirm once the rider${rd?.riderName ? `, ${rd.riderName},` : ''} has handed you ${peso(held)} for ${number}.`,
      confirm: 'Cash received',
    },
  };
  const sheet = sheets[action] || sheets.book;

  return (
    <ConfirmDialog
      open={Boolean(ask)}
      title={sheet.title}
      message={sheet.message}
      confirmLabel={sheet.confirm}
      cancelLabel={action === 'cancel' ? 'Keep the rider' : 'Not now'}
      danger={Boolean(sheet.danger)}
      loading={busy}
      onConfirm={run}
      onCancel={() => !busy && onClose?.()}
    >
      {sheet.body || null}
    </ConfirmDialog>
  );
}
