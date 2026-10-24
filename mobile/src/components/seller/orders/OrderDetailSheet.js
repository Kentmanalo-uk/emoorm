import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircleIcon, FileTextIcon, FlagIcon, MoneyIcon, MotorcycleIcon, PackageIcon, TruckIcon, XCircleIcon,
} from 'phosphor-react-native';
import apiClient from '../../../api/client';
import { resolveImg } from '../../../lib/media';
import { momentLabel, spanLabel } from '../../../lib/availability';
import CourierTracking from '../../orders/CourierTracking';
import { SheetFrame } from '../../Sheet';
import { font, t } from '../../../theme';
import { STATUS_FILL } from './OrderCard';
import {
  carriedFeeLines, payLabel, peso, unpaidFeeStatus,
} from '../../orders/orderProgress';
import {
  ACTION_LABELS, isRiderOrder, statusOf, canCancel, canMarkRefunded, canWaiveFee, cookingFor, etaLabel, faultLabel, kgLabel, lineNote, mediumStamp, money,
  nextStep, orderNo, paymentBadge, qrUnpaid, qtyLabel, riderActions, riderFeeNote, sellerFallbackLine, sellerNext,
} from './sellerOrderLib';

const native = Platform.OS !== 'web';

/*
 * One order's details on phones: the website's detail panel as a bottom
 * sheet (web/src/pages/SellerOrders.jsx "Order detail panel",
 * SellerOrders.css "Order detail: bottom sheet above the tab bar",
 * OrderStatusPanel.css .osp for the next-step panel). A sticky title row
 * ("Order #…" and a close button), then the rows: status, Today/paluto
 * timing, what to do now, buyer (their record, Report), contact, how it is
 * handed over, payment and its review, proofs, tracking, address, notes,
 * items, totals, the next step, Cancel this order and View Receipt.
 *
 * Shown in the app's one sheet look (the sign-in sheet's: Sheet.js SheetFrame)
 * on every phone.
 */

/** The buyer's last year at a glance: finished orders, and any that fell through on their side. */
function BuyerRecord({ orderId }) {
  const [record, setRecord] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    apiClient.get(`/orders/${orderId}/buyer-record`)
      .then((res) => { if (!cancelled) setRecord(res.data || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [orderId]);
  if (!record) return null;
  const issues = [
    record.noShows && `${record.noShows} no-show${record.noShows === 1 ? '' : 's'}`,
    record.refused && `${record.refused} refused`,
    record.unpaid && `${record.unpaid} unpaid`,
  ].filter(Boolean);
  return (
    <Text
      style={[styles.record, issues.length > 0 && styles.recordWarn]}
      accessibilityHint="This buyer's orders in the last 12 months, at any shop"
    >
      {record.completed} order{record.completed === 1 ? '' : 's'} completed{issues.length ? ` · ${issues.join(' · ')}` : ''}{record.phoneVerified ? ' · verified number' : ''}
    </Text>
  );
}

/** A label and its value on one line (.detail-row). */
function Row({ label, children }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof children === 'string' ? <Text style={styles.rowValue}>{children}</Text> : children}
    </View>
  );
}

/** A small capital label over its content (.detail-row--col). */
function ColRow({ label, children, style }) {
  return (
    <View style={[styles.col, style]}>
      {label ? <Text style={styles.colLabel}>{label}</Text> : null}
      {children}
    </View>
  );
}

/** A solid status pill (.seller-badge.seller-badge--solid). */
function Badge({ label, cls }) {
  return <Text style={[styles.badge, { backgroundColor: STATUS_FILL[cls] || t.neutral[500] }]}>{label}</Text>;
}

const TONES = {
  amber: { line: 'rgba(217, 119, 6, 0.22)', soft: '#fffbeb', ink: '#92400e' },
  blue: { line: 'rgba(37, 99, 235, 0.22)', soft: '#eff6ff', ink: '#1e3a8a' },
  green: { line: 'rgba(5, 150, 105, 0.22)', soft: '#ecfdf5', ink: '#065f46' },
  red: { line: 'rgba(220, 38, 38, 0.22)', soft: '#fef2f2', ink: '#991b1b' },
  grey: { line: 'rgba(107, 114, 128, 0.22)', soft: '#f9fafb', ink: '#374151' },
};

/** The hand-over photo (ProofPhotoSheet.jsx OrderProof), opening on the whole screen. */
function HandOverProof({ order, onView }) {
  const pickup = order.fulfillmentMethod === 'PICKUP';
  const src = resolveImg(order.fulfillmentProofUrl);
  const label = pickup ? 'Proof of pickup' : 'Proof of delivery';
  return (
    <View style={styles.proof}>
      <View style={styles.proofHead}>
        <Text style={styles.proofLabel}>{label}</Text>
        {order.fulfillmentProofAt ? <Text style={styles.proofTime}>{mediumStamp(order.fulfillmentProofAt)}</Text> : null}
      </View>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open full photo" onPress={() => onView?.(src, label)} style={styles.proofPhoto}>
        <Image source={{ uri: src }} style={styles.proofImg} resizeMode="cover" accessibilityLabel={label} />
      </Pressable>
    </View>
  );
}

const ACTION_STYLE = {
  confirm: { border: t.info[600], ink: t.info[600] },
  prepare: { border: t.primary[600], ink: t.primary[600] },
  ready: { border: t.violet[600], ink: t.violet[600] },
  complete: { border: t.primary[600], ink: '#fff', fill: t.primary[600] },
  cancel: { border: t.danger[600], ink: t.danger[600] },
};

/**
 * The MoorMove buttons under the next step (web SellerRiderPanel): Parcel
 * back, Cash received, Call a rider (again), Deliver it myself, Cancel rider,
 * and the note about who delivers. Each asks first (the screen's sheets).
 */
function RiderButtons({
  order, ridersOn, busy, onParcelBack, onRider,
}) {
  const ra = riderActions(order, ridersOn);
  if (!ra) return null;
  const any = ra.parcel || ra.cash || ra.book || ra.self || ra.cancel;
  if (!any && !ra.note && !ra.promoLine) return null;
  const ask = (action) => onRider?.(order, action);
  return (
    <View style={styles.riderBox}>
      {ra.promoLine ? <Text style={styles.promoLine}>{ra.promoLine}</Text> : null}
      {any ? (
        <View style={styles.riderRow}>
          {ra.parcel ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onParcelBack?.(order)}
              style={({ pressed }) => [styles.parcelBtn, styles.riderBtn, (pressed || busy) && styles.actionOff]}
            >
              <PackageIcon size={16} weight="fill" color="#fff" />
              <Text style={styles.parcelText}>Parcel back</Text>
            </Pressable>
          ) : null}
          {ra.cash ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => ask('cash')}
              style={({ pressed }) => [styles.parcelBtn, styles.riderBtn, (pressed || busy) && styles.actionOff]}
            >
              <MoneyIcon size={16} weight="fill" color="#fff" />
              <Text style={styles.parcelText}>Cash received</Text>
            </Pressable>
          ) : null}
          {ra.book ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => ask('book')}
              style={({ pressed }) => [styles.parcelBtn, styles.riderBtn, (pressed || busy) && styles.actionOff]}
            >
              <MotorcycleIcon size={16} weight="fill" color="#fff" />
              <Text style={styles.parcelText}>{ra.bookLabel}</Text>
            </Pressable>
          ) : null}
          {ra.self ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => ask('self')}
              style={({ pressed }) => [styles.selfBtn, styles.riderBtn, (pressed || busy) && styles.actionOff]}
            >
              <TruckIcon size={16} weight="fill" color={t.neutral[700]} />
              <Text style={styles.selfText}>Deliver it myself</Text>
            </Pressable>
          ) : null}
          {ra.cancel ? (
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => ask('cancel')}
              style={({ pressed }) => [styles.quietBtn, (pressed || busy) && styles.actionOff]}
            >
              <Text style={styles.quietText}>Cancel rider</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {ra.note ? (
        <Text style={styles.riderNote}>
          {ra.note}
          {ra.selfLink ? (
            <>
              {' '}
              <Text
                accessibilityRole="button"
                disabled={busy}
                onPress={busy ? undefined : () => ask('self')}
                style={styles.riderLink}
              >
                Deliver it myself instead
              </Text>
            </>
          ) : null}
        </Text>
      ) : null}
    </View>
  );
}

function DetailBody({
  order, updatingId, verifyingId, onStep, onPayment, onReject, onRefund, onReport, onView, onLeave, onParcelBack, onWaive,
  ridersOn, onRider,
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const status = statusOf(order);
  const next = sellerNext(order);
  const step = nextStep(order);
  const pay = paymentBadge(order);
  const pickup = order.fulfillmentMethod === 'PICKUP';
  const tone = TONES[next.tone] || TONES.grey;
  const actionLook = ACTION_STYLE[ACTION_LABELS[step]?.cls] || {};
  const verifying = verifyingId === order.id;
  const fallback = pickup ? '' : sellerFallbackLine(order);
  const feeNote = riderFeeNote(order);
  // A rider trip that failed, and the delivery fee the buyer owes for it.
  const ft = order.failedTrip || null;
  const fee = order.unpaidFee || null;
  // Leaving for another page closes the sheet first, so it is not left over it.
  const go = (href) => { onLeave?.(); router.push(href); };

  return (
    <View style={[styles.body, { paddingBottom: 20 + insets.bottom }]}>
      <Row label="Status">
        <Badge label={status?.label || order.status} cls={status?.cls} />
      </Row>

      {order.respondBy ? (
        <ColRow label="Available Today">
          <Text style={styles.todayText}>
            {order.status === 'PENDING' ? `Confirm by ${momentLabel(order.respondBy)}, or it cancels on its own. ` : ''}
            {order.etaFrom ? `The buyer expects it ${spanLabel(order.etaFrom, order.etaTo || order.etaFrom)}.` : ''}
          </Text>
        </ColRow>
      ) : null}

      {cookingFor(order) ? (
        <ColRow label="Paluto">
          <Text style={styles.todayText}>Cooked to order. The buyer expects it {etaLabel(order)}.</Text>
        </ColRow>
      ) : null}

      {next.title ? (
        <View style={[styles.osp, { borderColor: tone.line, backgroundColor: tone.soft }]}>
          <View style={styles.ospHead}>
            <Text style={[styles.ospTitle, { color: tone.ink }]}>{next.title}</Text>
            {next.text ? <Text style={styles.ospText}>{next.text}</Text> : null}
          </View>
          <RiderButtons
            order={order}
            ridersOn={ridersOn}
            busy={updatingId === order.id}
            onParcelBack={onParcelBack}
            onRider={onRider}
          />
        </View>
      ) : null}

      <Row label="Buyer">
        <View style={styles.buyerCell}>
          {order.buyer?.id ? (
            <Text style={styles.rowValue} accessibilityRole="link" accessibilityHint="View buyer profile" onPress={() => go(`/u/${order.buyer.id}`)}>
              {order.buyer.fullName || '—'}
            </Text>
          ) : (
            <Text style={styles.rowValue}>{order.buyer?.fullName || '—'}</Text>
          )}
          <BuyerRecord orderId={order.id} />
          {order.buyer?.id ? (
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Report this buyer to their municipal admin"
              onPress={() => onReport?.(order.buyer)}
              style={styles.report}
            >
              <FlagIcon size={14} color={t.neutral[500]} />
              <Text style={styles.reportText}>Report</Text>
            </Pressable>
          ) : null}
        </View>
      </Row>

      <Row label="Contact">{order.contactNumber || '—'}</Row>
      <Row label="Fulfillment">{pickup ? 'Store Pickup' : 'Delivery'}</Row>
      {!pickup ? (
        <Row label="Delivered by">
          {order.courierId
            ? `${order.courierName || order.courier?.name} (buyer's choice)${order.shippingWeightGrams ? ` · ${kgLabel(order.shippingWeightGrams)} kg` : ''}`
            : isRiderOrder(order) ? "A MoorMove rider (buyer's choice)" : 'You'}
        </Row>
      ) : null}
      {fallback ? <Text style={styles.note}>{fallback}</Text> : null}
      {ft || fee ? (
        <ColRow label="Failed delivery">
          {ft ? (
            <>
              <Text style={styles.address}>{ft.failReason || 'No reason given'}</Text>
              <Text style={[styles.fault, ft.buyerFault && styles.faultBuyer]}>{faultLabel(ft)}</Text>
            </>
          ) : null}
          {fee ? (
            <View style={styles.feeRow}>
              <Text style={styles.feeText}>
                Unpaid fee {peso(fee.amount)} · <Text style={styles.feeStatus}>{unpaidFeeStatus(order)}</Text>
              </Text>
              {canWaiveFee(order) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityHint="The buyer won't pay this fee"
                  disabled={updatingId === order.id}
                  onPress={() => onWaive?.(order)}
                  style={({ pressed }) => [styles.waive, (pressed || updatingId === order.id) && styles.actionOff]}
                >
                  <Text style={styles.waiveText}>Waive</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </ColRow>
      ) : null}
      <Row label="Payment">
        {`${payLabel(order.paymentMethod || 'COD', pickup)}${order.paymentReference ? ` — Ref: ${order.paymentReference}` : ''}`}
      </Row>
      {order.paymentStatus ? (
        <Row label="Payment status">
          <Badge label={pay?.label || order.paymentStatus} cls={pay?.cls} />
        </Row>
      ) : null}

      {qrUnpaid(order) && order.status === 'PENDING' ? (
        <View style={styles.review}>
          <Text style={styles.reviewText}>The buyer pays with your QR after you confirm this order. Confirm it if you can fill it; they&apos;ll be told to pay right away.</Text>
        </View>
      ) : null}

      {qrUnpaid(order) && order.status === 'CONFIRMED' ? (
        <View style={styles.review}>
          <Text style={styles.reviewText}>Waiting for the buyer to pay with your QR. You&apos;ll be notified when they send the reference and screenshot, then you confirm the payment and prepare the order. If they don&apos;t pay within 48 hours, the order is cancelled and its stock comes back.</Text>
        </View>
      ) : null}

      {order.paymentStatus === 'PENDING_VERIFICATION' && order.status !== 'CANCELLED' ? (
        <View style={styles.review}>
          <Text style={styles.reviewText}>The buyer says they paid. Check the reference number and screenshot below against your GCash or bank records, then confirm the payment.</Text>
          <View style={styles.payActions}>
            <Pressable accessibilityRole="button" disabled={verifying} onPress={() => onPayment?.(order.id, 'PAID')} style={[styles.payBtn, styles.approve, verifying && styles.payOff]}>
              <CheckCircleIcon size={16} color="#fff" />
              <Text style={[styles.payText, styles.approveText]}>Confirm payment</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={verifying} onPress={() => onReject?.(order.id)} style={[styles.payBtn, styles.reject, verifying && styles.payOff]}>
              <XCircleIcon size={16} color={t.danger[700]} />
              <Text style={[styles.payText, styles.rejectText]}>Reject payment</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {order.paymentStatus === 'FAILED' && order.status !== 'CANCELLED' ? (
        <View style={styles.review}>
          <Text style={styles.reviewText}>The proof was rejected. The order and its stock are kept while the buyer uploads a new one; it expires automatically if they don&apos;t.</Text>
        </View>
      ) : null}

      {canMarkRefunded(order) ? (
        <View style={styles.review}>
          <Text style={styles.reviewText}>This prepaid order was cancelled. If the buyer's payment reached you, return it, then record the refund here.</Text>
          <View style={styles.payActions}>
            <Pressable accessibilityRole="button" disabled={verifying} onPress={() => onRefund?.(order.id)} style={[styles.payBtn, styles.approve, verifying && styles.payOff]}>
              <CheckCircleIcon size={16} color="#fff" />
              <Text style={[styles.payText, styles.approveText]}>Mark refunded</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {order.paymentProofUrl ? (
        <ColRow label="Payment Proof">
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel="Payment proof"
            onPress={() => onView?.(resolveImg(order.paymentProofUrl), 'Payment proof')}
            style={styles.payProof}
          >
            <Image source={{ uri: resolveImg(order.paymentProofUrl) }} style={styles.payProofImg} resizeMode="cover" />
            <Text style={styles.payProofZoom}>Tap to open</Text>
          </Pressable>
        </ColRow>
      ) : null}

      {order.fulfillmentProofUrl ? (
        <ColRow><HandOverProof order={order} onView={onView} /></ColRow>
      ) : null}

      {order.trackingNumber ? (
        <ColRow><CourierTracking order={order} /></ColRow>
      ) : null}

      <ColRow label={pickup ? 'Pickup Location' : 'Delivery Address'}>
        <Text style={styles.address}>{order.deliveryAddress || '—'}</Text>
        {order.deliveryLatitude != null ? (
          <Text
            style={styles.mapLink}
            accessibilityRole="link"
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${order.deliveryLatitude},${order.deliveryLongitude}`).catch(() => {})}
          >
            Open the buyer&apos;s pin in Maps
          </Text>
        ) : null}
      </ColRow>

      {order.deliveryNotes ? (
        <ColRow label="Notes">
          <Text style={styles.address}>{order.deliveryNotes}</Text>
        </ColRow>
      ) : null}

      <View style={styles.items}>
        <Text style={styles.itemsTitle}>Items</Text>
        {(order.items || []).map((item, i) => {
          const variations = item.selectedVariations && Object.keys(item.selectedVariations).length > 0
            ? Object.entries(item.selectedVariations).map(([name, value]) => `${name}: ${value}`).join(' · ')
            : '';
          const note = lineNote(item);
          return (
            <View key={item.id || i} style={styles.item}>
              <View style={styles.itemName}>
                <Text style={styles.itemText}>{item.product?.name || item.productName || item.productId}</Text>
                {variations ? <Text style={styles.itemSmall}>{variations}</Text> : null}
                {note ? <Text style={styles.itemSmall}>{note}</Text> : null}
              </View>
              <Text style={styles.itemText}>{qtyLabel(item)}</Text>
              <Text style={styles.itemText}>{money(Number(item.price) * item.quantity)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>Subtotal</Text>
          <Text style={styles.totalText}>{money(order.subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>Delivery fee</Text>
          <Text style={styles.totalText}>{money(order.deliveryFee || 0)}</Text>
        </View>
        {Number(order.discountAmount) > 0 ? (
          <View style={styles.totalRow}>
            <Text style={styles.totalText}>Discount{order.voucherCode ? ` (${order.voucherCode})` : ''}</Text>
            <Text style={styles.totalText}>−₱{Number(order.discountAmount).toFixed(2)}</Text>
          </View>
        ) : null}
        {carriedFeeLines(order).map((line) => (
          <View key={line.key} style={styles.totalRow}>
            <Text style={[styles.totalText, styles.totalLabel]}>{line.label}</Text>
            <Text style={styles.totalText}>{money(line.amount)}</Text>
          </View>
        ))}
        <View style={[styles.totalRow, styles.totalBold]}>
          <Text style={styles.totalBoldText}>Total</Text>
          <Text style={styles.totalBoldText}>{money(order.total)}</Text>
        </View>
        {feeNote ? (
          <View style={styles.totalRow}>
            <View style={styles.saleLabel}>
              <Text style={styles.totalText}>Your sale</Text>
              <Text style={styles.saleNote}>{feeNote}</Text>
            </View>
            <Text style={styles.totalText}>{money(order.shopTotal ?? order.total)}</Text>
          </View>
        ) : null}
      </View>

      {step ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            disabled={updatingId === order.id}
            onPress={() => onStep?.(order.id, step)}
            style={[
              styles.actionBtn,
              actionLook.border && { borderColor: actionLook.border },
              actionLook.fill && { backgroundColor: actionLook.fill },
              updatingId === order.id && styles.actionOff,
            ]}
          >
            {updatingId === order.id ? <ActivityIndicator size={14} color={actionLook.ink || t.neutral[700]} style={styles.spin} /> : null}
            <Text style={[styles.actionText, actionLook.ink && { color: actionLook.ink }]}>{ACTION_LABELS[step]?.label || step}</Text>
          </Pressable>
        </View>
      ) : null}
      {canCancel(order) ? (
        <Pressable accessibilityRole="button" onPress={() => onStep?.(order.id, 'CANCELLED')} style={styles.cancelLink}>
          <Text style={styles.cancelLinkText}>Cancel this order</Text>
        </Pressable>
      ) : null}

      {['COMPLETED', 'DELIVERED', 'PICKED_UP', 'SHIPPED'].includes(order.status) ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="link"
            onPress={() => go(`/receipt/${order.id}`)}
            style={[styles.actionBtn, { borderColor: t.primary[600], backgroundColor: t.primary[600] }]}
          >
            <FileTextIcon size={14} color="#fff" style={styles.receiptIcon} />
            <Text style={[styles.actionText, { color: '#fff' }]}>View Receipt</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/**
 * <OrderDetailSheet order={selected} onClose updatingId verifyingId
 *   onStep(orderId, status) onPayment(orderId, 'PAID') onReject(orderId)
 *   onRefund(orderId) onReport(buyer) onView(uri, title) onParcelBack(order) onWaive(order)
 *   ridersOn onRider(order, 'book' | 'self' | 'cancel' | 'cash') />
 * Open while `order` is set; it keeps the last order on screen while it slides away.
 */
export default function OrderDetailSheet({ order, onClose, ...actions }) {
  const { height: screenH } = useWindowDimensions();
  const open = Boolean(order);
  const [shown, setShown] = useState(order);
  const [panelH, setPanelH] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  // Keep the last order while the sheet goes down.
  useEffect(() => { if (order) setShown(order); }, [order]);

  useEffect(() => {
    // The shared sheet frame animates itself; this keeps the order shown until then.
    return undefined;
    if (open) {
      if (!panelH) return undefined;
      const anim = Animated.timing(progress, { toValue: 1, duration: 240, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: native });
      anim.start();
      return () => anim.stop();
    }
    if (!shown) return undefined;
    const anim = Animated.timing(progress, { toValue: 0, duration: 200, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native });
    anim.start(({ finished }) => { if (finished) { setShown(null); setPanelH(0); } });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelH]);

  const current = order || shown;
  if (!current) return null;

  // The app's one sheet look on every phone (the sign-in sheet's: Sheet.js).
  return (
    <SheetFrame safeBottom={false} open={open} onClose={onClose} title={`Order #${orderNo(current)}`} scroll={false} padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.scroll} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
        <DetailBody order={current} onLeave={onClose} {...actions} />
      </ScrollView>
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: { width: '100%', backgroundColor: t.neutral[0], borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  scroll: { flexGrow: 0, flexShrink: 1 },

  // .seller-card-header (sticky): 14px 16px, a hairline under it.
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.neutral[100], backgroundColor: t.neutral[0],
  },
  headGlass: { backgroundColor: 'transparent', paddingTop: 0 },
  headTitle: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 25.6, ...font(500), color: t.neutral[900] },
  close: {
    width: 36, height: 36, borderRadius: 6, borderWidth: 1, borderColor: t.neutral[200], alignItems: 'center', justifyContent: 'center',
  },

  body: { gap: 12, paddingTop: 14, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 },
  rowLabel: { flexShrink: 0, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
  rowValue: { flexShrink: 1, minWidth: 0, textAlign: 'right', fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  col: { alignItems: 'flex-start', gap: 4 },
  colLabel: { fontSize: 12, lineHeight: 19.2, letterSpacing: 0.6, textTransform: 'uppercase', ...font(400), color: t.neutral[500] },
  badge: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden',
    fontSize: 11.5, lineHeight: 18.4, letterSpacing: 0.1, ...font(600), color: '#fff',
  },
  todayText: { marginTop: 4, fontSize: 13.5, lineHeight: 20.25, ...font(400), color: t.neutral[700] },

  // .osp.is-full.so-next-panel
  osp: { gap: 12, marginBottom: 16, padding: 12, borderWidth: 1, borderRadius: 14 },
  ospTitle: { fontSize: 15, lineHeight: 19.5, ...font(700) },
  ospHead: { gap: 2, minWidth: 0 },
  ospText: { fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[700] },
  // The panel's own button (Parcel back), like the website's .rider-actions .is-primary.
  parcelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: t.primary[600],
  },
  parcelText: { fontSize: 14, lineHeight: 20, ...font(600), color: '#fff' },
  // The rider buttons (web .rider-actions): side by side, wrapping; Deliver it
  // myself outlined, Cancel rider a quiet red word.
  riderBox: { gap: 8 },
  riderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  riderBtn: { flexGrow: 1, flexShrink: 1, flexBasis: 140 },
  selfBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0],
  },
  selfText: { fontSize: 14, lineHeight: 20, ...font(600), color: t.neutral[700] },
  quietBtn: { minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14 },
  quietText: { fontSize: 14, lineHeight: 20, ...font(500), color: t.danger[600] },
  riderNote: { fontSize: 12.5, lineHeight: 18, ...font(400), color: t.neutral[600] },
  riderLink: { ...font(600), color: t.primary[700], textDecorationLine: 'underline' },
  promoLine: {
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, overflow: 'hidden', backgroundColor: t.primary[50],
    fontSize: 12.5, lineHeight: 18, ...font(500), color: t.primary[800],
  },
  note: { marginTop: -4, fontSize: 12.5, lineHeight: 18, ...font(400), color: t.neutral[600] },

  // The failed trip: whose fault, and the fee the buyer owes for it (Waive while unpaid).
  fault: { fontSize: 12.5, lineHeight: 18, ...font(600), color: t.neutral[600] },
  faultBuyer: { color: t.warning[800] },
  feeRow: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 4,
  },
  feeText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[700] },
  feeStatus: { ...font(600), color: t.neutral[900] },
  waive: {
    minHeight: 36, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  waiveText: { fontSize: 13, lineHeight: 18, ...font(600), color: t.neutral[700] },

  // .so-buyer-cell on phones: the name, their record and Report from the left, wrapping.
  buyerCell: {
    flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10,
  },
  record: { marginTop: 2, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  recordWarn: { color: t.warning[800] },
  report: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 9,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999,
  },
  reportText: { fontSize: 12, lineHeight: 14.4, ...font(600), color: t.neutral[500] },

  review: { gap: 10, padding: 12, borderRadius: 10, backgroundColor: t.warning[50] },
  reviewText: { fontSize: 13, lineHeight: 19.5, ...font(400), color: t.warning[800] },
  payActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  payBtn: {
    flex: 1, flexBasis: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: 'transparent',
  },
  payOff: { opacity: 0.6 },
  approve: { backgroundColor: t.primary[600] },
  reject: { backgroundColor: t.neutral[0], borderColor: t.danger[300] },
  payText: { fontSize: 13, lineHeight: 20, ...font(600) },
  approveText: { color: '#fff' },
  rejectText: { color: t.danger[700] },

  payProof: { alignItems: 'flex-start', gap: 6 },
  payProofImg: { width: 120, height: 120, borderRadius: 10, borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[50] },
  payProofZoom: { fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.neutral[500] },

  proof: { alignSelf: 'stretch', gap: 8 },
  proofHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  proofLabel: { fontSize: 13, lineHeight: 20.8, ...font(600), color: t.neutral[700] },
  proofTime: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  proofPhoto: { width: '100%', maxWidth: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[100] },
  proofImg: { width: '100%', aspectRatio: 4 / 3, maxHeight: 240 },

  address: { fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[700] },
  mapLink: { marginTop: 4, fontSize: 13, lineHeight: 20.8, ...font(500), color: t.primary[700], textDecorationLine: 'underline' },

  items: { paddingTop: 12, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  itemsTitle: {
    marginBottom: 8, fontSize: 12, lineHeight: 19.2, letterSpacing: 0.6, textTransform: 'uppercase', ...font(600), color: t.neutral[500],
  },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  itemName: { flex: 1, minWidth: 0 },
  itemText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[700] },
  itemSmall: { marginTop: 3, fontSize: 11, lineHeight: 17.6, ...font(400), color: t.neutral[500] },

  totals: { gap: 6, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  totalText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[700] },
  totalLabel: { flex: 1, minWidth: 0 },
  totalBold: { marginTop: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: t.neutral[200] },
  totalBoldText: { fontSize: 15, lineHeight: 24, ...font(700), color: t.neutral[900] },
  saleLabel: { flex: 1, minWidth: 0 },
  saleNote: { fontSize: 11.5, lineHeight: 17, ...font(400), color: t.neutral[500] },

  actions: { gap: 8, paddingTop: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 46, paddingVertical: 10, paddingHorizontal: 16,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10, backgroundColor: t.neutral[0],
  },
  actionOff: { opacity: 0.5 },
  actionText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[700] },
  spin: { marginRight: 6 },
  receiptIcon: { marginRight: 6 },
  cancelLink: { alignSelf: 'center', marginTop: 10, paddingVertical: 6, paddingHorizontal: 10 },
  cancelLinkText: { fontSize: 13, lineHeight: 20.8, ...font(600), color: t.danger[600] },
});
