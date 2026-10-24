import { useState } from 'react';
import {
  Pressable, StyleSheet, Text, View,
} from 'react-native';
import apiClient from '../../../api/client';
import { toast } from '../../../lib/toast';
import OrderConfirmDialog from '../../orders/OrderConfirmDialog';
import { peso } from '../../orders/orderProgress';
import { font, t } from '../../../theme';
import {
  feeToAdd, orderPromo, promoSellerLine, redeliveryNote,
} from './sellerOrderLib';

/*
 * The seller's MoorMove steps, each asked first in a sheet
 * (web/src/components/orders/RiderActionSheet.jsx):
 *   book    "Call a rider" / "Call a rider again": the fee, who pays what, the cash the rider brings back
 *   cancel  "Cancel rider" (before pickup)
 *   self    "Deliver it myself"
 *   cash    "Cash received": the rider handed over the buyer's cash
 * (Parcel back and Waive fee have their own sheets on the orders screen.)
 *
 *   <RiderActionSheet ask={{ action: 'book', order }} onClose={…} onDone={(order) => …} />
 *
 * `onDone` gets the updated order from the server, or null when the order
 * had moved on meanwhile (409: show the list again).
 */

const CANCEL_REASONS = [
  "I'll deliver it myself",
  'The rider is taking too long',
  'The order is not ready yet',
  'Something else',
];

const TOASTS = {
  book: 'Rider called. We\'ll let you know when one takes it.',
  cancel: 'Rider cancelled',
  self: 'Deliver it yourself, then mark it delivered with a photo',
  cash: 'Cash received. Thank you!',
};

/** A label and its amount (.rider-sheet-lines > div). */
function Line({ label, value, strong = false }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lineLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.lineValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

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
  // A re-delivery adds the buyer's unpaid fee for the failed trip to this order.
  const added = feeToAdd(order);
  const collect = Number(order.total || 0) + added;
  const cashBack = Math.max(0, collect - fee);
  const held = Number(rd?.codAmount || 0);
  // A MoorMove free-delivery promo: MoorMove pays the rider, the buyer pays no fee.
  const promo = orderPromo(order);
  const bookNote = redeliveryNote(order);
  const selfNote = redeliveryNote(order, { self: true });

  const run = async () => {
    if (!ask || busy) return;
    setBusy(true);
    try {
      const url = `/orders/${order.id}/rider`;
      const res = action === 'book' ? await apiClient.post(url)
        : action === 'cancel' ? await apiClient.delete(url, { data: { reason } })
          : action === 'self' ? await apiClient.post(`${url}/self`)
            : await apiClient.post(`${url}/cash-received`);
      toast.success(TOASTS[action]);
      onDone?.(res?.data || null);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'Something went wrong. Try again.');
      // The order moved on meanwhile: the screen shows it as it is now.
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
        <View style={styles.lines}>
          {promo ? <Text style={styles.promoLine}>{promoSellerLine(order)}</Text> : null}
          <Line label="Delivery fee" value={promo ? 'Free (MoorMove promo)' : peso(fee)} />
          {added > 0 ? <Line label="Unpaid fee from the failed trip" value={peso(added)} /> : null}
          {cod ? (
            <>
              <Line label="The rider collects from the buyer" value={peso(collect)} />
              <Line label="The rider brings back to you" value={peso(cashBack)} strong />
              <Text style={styles.note}>
                {promo ? 'MoorMove pays the rider for this delivery.' : `The rider keeps the ${peso(fee)} delivery fee.`} Tap Cash received once they hand you the money.
              </Text>
            </>
          ) : (
            <Text style={styles.note}>
              {promo
                ? 'The buyer already paid you for the items. You pay the rider nothing; they collect nothing from the buyer.'
                : `The buyer already paid you, delivery fee included. Pay the rider ${peso(fee)} when they pick it up; they collect nothing from the buyer.`}
            </Text>
          )}
          {bookNote ? <Text style={[styles.note, styles.tripNote]}>{bookNote}</Text> : null}
        </View>
      ),
    },
    cancel: {
      title: 'Cancel the rider?',
      message: 'The rider is told not to come. You can call another rider or deliver it yourself.',
      confirm: 'Cancel rider',
      danger: true,
      body: (
        <View style={styles.reasons} accessibilityRole="radiogroup" accessibilityLabel="Why">
          {CANCEL_REASONS.map((label) => {
            const on = reason === label;
            return (
              <Pressable
                key={label}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setReason(label)}
                style={[styles.reason, on && styles.reasonOn]}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <Text style={styles.reasonText}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      ),
    },
    self: {
      title: 'Deliver it yourself?',
      message: `No rider will be called for ${number}. You take it to the buyer, then mark it delivered with a photo as usual. ${promo || !(Number(order.deliveryFee) > 0)
        ? 'Delivery stays free for the buyer.'
        : `The buyer still pays the ${peso(order.deliveryFee)} delivery fee they were quoted, now to you.`}`,
      confirm: 'Deliver it myself',
      body: selfNote ? (
        <View style={styles.lines}>
          <Text style={[styles.note, styles.tripNote]}>{selfNote}</Text>
        </View>
      ) : null,
    },
    cash: {
      title: 'Got the cash from the rider?',
      message: `Only confirm once the rider${rd?.riderName ? `, ${rd.riderName},` : ''} has handed you ${peso(held)} for ${number}.`,
      confirm: 'Cash received',
    },
  };
  const sheet = sheets[action] || sheets.book;

  return (
    <OrderConfirmDialog
      open={Boolean(ask)}
      title={sheet.title}
      message={sheet.message}
      confirmLabel={sheet.confirm}
      cancelLabel={action === 'cancel' ? 'Keep the rider' : 'Not now'}
      danger={Boolean(sheet.danger)}
      loading={busy}
      onConfirm={run}
      onCancel={() => { if (!busy) onClose?.(); }}
    >
      {sheet.body || null}
    </OrderConfirmDialog>
  );
}

const styles = StyleSheet.create({
  // .rider-sheet-lines: a grey box of amounts under the question.
  lines: { gap: 6, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.neutral[50] },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 20, ...font(400), color: t.neutral[600] },
  lineValue: { flexShrink: 0, fontSize: 13.5, lineHeight: 20, ...font(600), color: t.neutral[900] },
  strong: { ...font(700), color: t.primary[700] },
  note: { marginTop: 4, fontSize: 12.5, lineHeight: 18, ...font(400), color: t.neutral[600] },
  tripNote: { ...font(600), color: t.neutral[800] },
  promoLine: {
    marginBottom: 4, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, overflow: 'hidden', backgroundColor: t.primary[50],
    fontSize: 12.5, lineHeight: 18, ...font(500), color: t.primary[800],
  },

  // .rider-sheet-reasons (the cancel-order reasons' look)
  reasons: { gap: 6, marginTop: 12 },
  reason: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8,
  },
  reasonOn: { borderColor: t.danger[300], backgroundColor: t.danger[50] },
  radio: {
    width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: t.neutral[400],
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  radioOn: { borderColor: t.danger[600] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.danger[600] },
  reasonText: { flex: 1, fontSize: 13.5, lineHeight: 20, ...font(400), color: t.neutral[800] },
});
