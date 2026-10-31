import { useState } from 'react';
import {
  Linking, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CalendarCheckIcon, CheckCircleIcon, HandshakeIcon, MapPinIcon, PhoneIcon, ReceiptIcon,
} from '../../lib/icons';
import apiClient from '../../api/client';
import ProductImage from '../ProductImage';
import OrderConfirmDialog from '../orders/OrderConfirmDialog';
import { toast } from '../../lib/toast';
import { font, ink, t, themed } from '../../theme';
import {
  TALKING, clock, day, dealStatus, heads, orderPath, peso, telHref, when,
} from './offerText';
import { MeetupSheet, PriceSheet, RecordSheet } from './DealSheets';

/*
 * A livestock deal as a card in the chat (web/src/components/offers/
 * DealCard.jsx, Offers.css .of-deal): the animal, the price on the table and
 * the total, where it stands, and the next steps for this side: accept,
 * answer with another price or decline; set a meetup; mark it as done
 * (seller); confirm it (buyer). The buyer can call the seller, and the
 * seller the buyer once they have agreed.
 *
 * Weights: a buyer's pages have the website's phone weights (bold → 500); the
 * Seller Center keeps its bold ones (dealWeight).
 */

/** A weight as the website draws it on this side's pages. */
export const dealWeight = (side, weight) => font(side === 'seller' ? weight : Math.min(weight, 500));

const TONES = themed(() => ({
  amber: { bg: t.warning[100], fg: t.warning[800] },
  blue: { bg: t.sky[100], fg: '#075985' },
  green: { bg: t.primary[100], fg: t.primary[800] },
  gray: { bg: t.neutral[100], fg: t.neutral[600] },
}));

/** Where a deal stands, as a small pill (.of-badge). */
export function DealBadge({ status, side, style }) {
  const tone = TONES[status.tone] || TONES.gray;
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }, style]}>
      <Text style={[styles.badgeText, dealWeight(side, 700), { color: tone.fg }]} numberOfLines={1}>{status.label}</Text>
    </View>
  );
}

/** A deal's button (.of-btn in .of-deal-actions / .of-row-actions). */
export function DealButton({
  label, Icon, onPress, disabled, variant, side, full = false,
}) {
  const primary = variant === 'primary';
  const quiet = variant === 'quiet';
  const color = primary ? '#fff' : quiet ? t.neutral[500] : t.neutral[800];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn, primary && styles.btnPrimary, quiet && styles.btnQuiet, full && styles.btnFull,
        pressed && !quiet && (primary ? styles.btnPrimaryOn : styles.btnOn), disabled && styles.btnOff,
      ]}
    >
      {Icon ? <Icon size={16} weight="fill" color={color} /> : null}
      <Text style={[styles.btnText, dealWeight(side, 600), { color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function DealCard({ deal, side, onChanged, compact = false }) {
  const router = useRouter();
  const [sheet, setSheet] = useState(null);
  const [asking, setAsking] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = side === 'buyer' ? 'BUYER' : 'SELLER';
  const myTurn = deal.turn === me;
  const talking = TALKING.includes(deal.status);
  const status = dealStatus(deal, side);
  const phone = side === 'buyer' ? deal.sellerPhone : deal.buyerPhone;
  const closed = !['PENDING', 'COUNTERED', 'ACCEPTED', 'CONFIRMING'].includes(deal.status);
  const final = deal.finalTotal != null;
  const green = status.tone === 'green';
  const W = (n) => dealWeight(side, n);
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
      await apiClient.post(`/offers/${deal.id}/${action}`, body || {});
      if (done) toast.success(done);
      setSheet(null);
      onChanged?.();
    } catch (err) {
      toast.error(err?.message || 'Could not update the deal');
      onChanged?.();
      throw err;
    } finally {
      setBusy(false);
    }
  };
  const tap = (action, body, done) => post(action, body, done).catch(() => {});

  // A question first (the website's confirmAction), then the step.
  const ask = (action, question, done) => setAsking({ action, question, done });
  const answer = async () => {
    const { action, done } = asking;
    await post(action, undefined, done).catch(() => {});
    setAsking(null);
  };

  const call = () => Linking.openURL(telHref(phone)).catch(() => toast.error('Could not start the call'));

  return (
    <View style={styles.deal}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={deal.product?.name}
          disabled={!deal.product?.slug}
          onPress={() => router.push(`/product/${deal.product.slug}`)}
          style={styles.img}
        >
          <ProductImage src={deal.product?.image} />
        </Pressable>
        <View style={styles.what}>
          <Text style={[styles.name, W(700)]} numberOfLines={1}>{deal.product?.name}</Text>
          <DealBadge status={status} side={side} />
        </View>
        {phone && !closed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={side === 'buyer' ? 'Call the seller' : 'Call the buyer'}
            onPress={call}
            style={({ pressed }) => [styles.call, pressed && styles.callOn]}
          >
            <PhoneIcon size={18} weight="fill" color={t.primary[700]} />
            <Text style={[styles.callText, W(700)]}>Call</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.price, green && styles.priceGreen]}>
        {final ? (
          <>
            <Text style={styles.priceWhat}>{`${heads(deal.finalQuantity)} · paid in person`}</Text>
            <Text style={[styles.priceSum, W(700), green && styles.priceSumGreen]}>{peso(deal.finalTotal)}</Text>
          </>
        ) : (
          <>
            <Text style={styles.priceWhat}>
              {`${heads(deal.quantity)} × ${peso(deal.price)}`}
              {deal.price < deal.listPrice ? <Text style={styles.priceWas}>{`  ${peso(deal.listPrice)}`}</Text> : null}
            </Text>
            <Text style={[styles.priceSum, W(700), green && styles.priceSumGreen]}>{peso(deal.total)}</Text>
          </>
        )}
      </View>

      {deal.meetAt && ['ACCEPTED', 'CONFIRMING'].includes(deal.status) ? (
        <View style={styles.meet}>
          <CalendarCheckIcon size={15} weight="fill" color={t.primary[600]} />
          <Text style={[styles.meetText, W(600)]}>{`${day(deal.meetAt)}, ${clock(deal.meetAt)}`}</Text>
          <MapPinIcon size={15} weight="fill" color={t.primary[600]} />
          <Text style={[styles.meetText, W(600)]}>{deal.meetPlace}</Text>
        </View>
      ) : null}
      {!compact && deal.status === 'ACCEPTED' ? (
        <Text style={styles.hint}>
          {side === 'buyer'
            ? 'Meet the seller to see the animals and pay in person. The seller then marks it as done for you to confirm.'
            : `Meet the buyer, then tap Mark as done with the heads and total you settled on${deal.meetBy ? ` (by ${day(deal.meetBy)})` : ''}.`}
        </Text>
      ) : null}
      {!compact && deal.status === 'CONFIRMING' ? (
        <Text style={styles.hint}>
          {side === 'buyer'
            ? `Is this right? It confirms itself on ${when(deal.respondBy)} if you don't answer.`
            : `The buyer confirms it, or it confirms itself on ${when(deal.respondBy)}.`}
        </Text>
      ) : null}

      {!closed ? (
        <View style={styles.actions}>
          {talking && myTurn ? (
            <>
              <DealButton side={side} variant="primary" full Icon={HandshakeIcon} label={`Accept ${peso(deal.price)}`} disabled={busy} onPress={() => tap('accept', undefined, 'Deal! Now arrange to meet.')} />
              <DealButton side={side} label="Counter" disabled={busy} onPress={() => setSheet('price')} />
              <DealButton
                side={side}
                variant="quiet"
                label="Decline"
                disabled={busy}
                onPress={() => ask('decline', { title: 'Decline this price?', message: 'This ends the talks on this deal.', confirmLabel: 'Decline' }, 'Declined')}
              />
            </>
          ) : null}
          {talking && !myTurn ? (
            <>
              <DealButton side={side} label="Change my price" disabled={busy} onPress={() => setSheet('price')} />
              {side === 'buyer' ? (
                <DealButton
                  side={side}
                  variant="quiet"
                  label="Withdraw"
                  disabled={busy}
                  onPress={() => ask('decline', { title: 'Withdraw your offer?', message: 'The seller will be told.', confirmLabel: 'Withdraw' }, 'Offer withdrawn')}
                />
              ) : (
                <DealButton
                  side={side}
                  variant="quiet"
                  label="End talks"
                  disabled={busy}
                  onPress={() => ask('decline', { title: 'End the talks?', message: 'The buyer will be told.', confirmLabel: 'End talks' }, 'Talks ended')}
                />
              )}
            </>
          ) : null}
          {deal.status === 'ACCEPTED' ? (
            <>
              {side === 'seller' ? (
                <DealButton side={side} variant="primary" full Icon={ReceiptIcon} label="Mark as done" disabled={busy} onPress={() => setSheet('record')} />
              ) : null}
              <DealButton side={side} label={deal.meetAt ? 'Change meetup' : 'Set a meetup'} disabled={busy} onPress={() => setSheet('meet')} />
              <DealButton
                side={side}
                variant="quiet"
                label="Call off"
                disabled={busy}
                onPress={() => ask('call-off', { title: 'Call off this deal?', message: "The other side will be told. You can't undo this.", confirmLabel: 'Call off' }, 'Deal called off')}
              />
            </>
          ) : null}
          {deal.status === 'CONFIRMING' && side === 'buyer' ? (
            <>
              <DealButton side={side} variant="primary" full Icon={CheckCircleIcon} label="Confirm purchase" disabled={busy} onPress={() => tap('confirm', undefined, 'Purchase confirmed. Thank you!')} />
              <DealButton
                side={side}
                variant="quiet"
                label="Not right"
                disabled={busy}
                onPress={() => ask('not-right', { title: 'Not what you agreed?', message: 'The sale is undone and the seller is asked to record it again.', confirmLabel: "It's not right" }, 'The seller has been told')}
              />
            </>
          ) : null}
        </View>
      ) : null}
      {deal.status === 'SOLD' && deal.orderId ? (
        <View style={styles.actions}>
          <DealButton side={side} label="See the order" onPress={() => router.push(orderPath(deal, side))} />
        </View>
      ) : null}

      {sheet === 'price' ? (
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
      ) : null}
      {sheet === 'meet' ? (
        <MeetupSheet deal={deal} onSubmit={(body) => post('meetup', body, 'Meetup sent')} onClose={() => setSheet(null)} />
      ) : null}
      {sheet === 'record' ? (
        <RecordSheet deal={deal} onSubmit={(body) => post('record', body, 'Marked as done. The buyer will confirm it.')} onClose={() => setSheet(null)} />
      ) : null}
      <OrderConfirmDialog
        open={Boolean(asking)}
        title={asking?.question.title || ''}
        message={asking?.question.message}
        confirmLabel={asking?.question.confirmLabel}
        danger
        loading={busy}
        onConfirm={answer}
        onCancel={() => setAsking(null)}
      />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  deal: {
    width: '100%', maxWidth: 380, gap: 10, padding: 14, borderRadius: 18, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 24, color: ink(0.08) }],
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  img: { width: 48, height: 48, overflow: 'hidden', borderRadius: 12, backgroundColor: t.neutral[100] },
  what: { flex: 1, minWidth: 0, gap: 4, alignItems: 'flex-start' },
  name: { alignSelf: 'stretch', fontSize: 14.5, lineHeight: 23.2, color: t.neutral[900] },
  call: { alignItems: 'center', gap: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 12, backgroundColor: t.primary[50] },
  callOn: { backgroundColor: t.primary[100] },
  callText: { fontSize: 11, lineHeight: 17.6, color: t.primary[700] },

  price: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 12, backgroundColor: t.neutral[50],
  },
  priceGreen: { backgroundColor: t.primary[50] },
  priceWhat: { flexShrink: 1, fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[700] },
  priceWas: { color: t.neutral[400], textDecorationLine: 'line-through' },
  priceSum: { flexShrink: 0, fontSize: 19, lineHeight: 30.4, color: t.neutral[900] },
  priceSumGreen: { color: t.primary[800] },

  meet: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 6 },
  meetText: { flexShrink: 1, fontSize: 13, lineHeight: 20.8, color: t.neutral[800] },
  hint: { fontSize: 12.5, lineHeight: 17.5, ...font(400), color: t.neutral[500] },

  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 999, backgroundColor: t.neutral[100],
  },
  btnOn: { backgroundColor: t.neutral[200] },
  btnPrimary: { backgroundColor: t.primary[600] },
  btnPrimaryOn: { backgroundColor: t.primary[700] },
  btnQuiet: { backgroundColor: 'transparent' },
  btnFull: { flexBasis: '100%', flexGrow: 1 },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 13.5, lineHeight: 21.6 },

  badge: { alignSelf: 'flex-start', maxWidth: '100%', paddingHorizontal: 9, borderRadius: 999 },
  badgeText: { fontSize: 11.5, lineHeight: 18 },
}));
