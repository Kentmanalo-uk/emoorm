import { useEffect, useState } from 'react';
import {
  Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { CheckCircleIcon, StarIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import ProductImage from '../ProductImage';
import { resolveImg } from '../../lib/media';
import OrderSheetFrame from './OrderSheetFrame';
import OrderStatusPanel, { DetailSection, OrderProof } from './OrderStatusPanel';
import CourierTracking, { CourierPending } from './CourierTracking';
import { OrderBadge, OrderButton } from './OrderBits';
import { longDateTime, pesoPlain } from './orderProgress';

/**
 * "Order Details" (Orders.jsx's details modal, a bottom sheet on phones):
 * the order number and stage, where it stands (OrderStatusPanel), the
 * hand-over photo, the courier, the items (each with Review once received),
 * the totals, and Order received / Cancel Order / Close at the bottom.
 */
export default function OrderDetailsSheet({
  open, order, badge, onClose, canReceive = false, canCancel = false, onReceived, onCancel, onReview,
}) {
  if (!order) return <OrderSheetFrame open={false} />;
  const received = ['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(order.status);

  return (
    <OrderSheetFrame
      open={open}
      title="Order Details"
      onClose={onClose}
      bodyStyle={styles.body}
      footer={(
        <>
          {canReceive ? (
            <OrderButton primary label="Order received" Icon={CheckCircleIcon} onPress={onReceived} style={[styles.footBtn, styles.receivedBtn]} />
          ) : null}
          {canCancel ? (
            <Pressable accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.footBtn, styles.cancel, pressed && styles.cancelPressed]}>
              <Text style={[styles.footText, styles.cancelText]}>Cancel Order</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.footBtn, styles.close, pressed && styles.closePressed]}>
            <Text style={[styles.footText, styles.closeText]}>Close</Text>
          </Pressable>
        </>
      )}
    >
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.number}>Order #{order.orderNumber}</Text>
          <Text style={styles.date}>Placed on {longDateTime(order.createdAt)}</Text>
        </View>
        {badge ? <OrderBadge label={badge.label} tone={badge.tone} /> : null}
      </View>

      <OrderStatusPanel order={order} />

      {order.fulfillmentProofUrl ? (
        <DetailSection><OrderProof order={order} /></DetailSection>
      ) : null}

      {order.trackingNumber ? (
        <DetailSection title="Delivery"><CourierTracking order={order} /></DetailSection>
      ) : order.courierName && order.status !== 'CANCELLED' ? (
        <DetailSection title="Delivery"><CourierPending order={order} /></DetailSection>
      ) : null}

      <DetailSection title="Order Items">
        <View style={styles.items}>
          {(order.items || []).map((item, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <View key={index} style={styles.item}>
              <ItemThumb src={item.product?.images?.[0]} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.productName}</Text>
                <Text style={styles.itemQty}>Quantity: {item.quantity}</Text>
              </View>
              <View style={styles.itemPrice}>
                <Text style={styles.price}>{pesoPlain(item.price)}</Text>
                <Text style={styles.subtotal}>Subtotal: {pesoPlain(item.subtotal)}</Text>
                {received ? (
                  <OrderButton
                    label="Review"
                    Icon={StarIcon}
                    iconSize={14}
                    onPress={() => onReview?.(item)}
                    style={styles.review}
                  />
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </DetailSection>

      <DetailSection title="Order Summary" last>
        <View style={styles.summary}>
          <SummaryRow label="Subtotal" value={pesoPlain(order.subtotal)} />
          <SummaryRow label="Delivery Fee" value={pesoPlain(order.deliveryFee || 0)} />
          {Number(order.discountAmount) > 0 ? (
            <SummaryRow label={`Discount${order.voucherCode ? ` (${order.voucherCode})` : ''}`} value={`-${pesoPlain(order.discountAmount)}`} />
          ) : null}
          <SummaryRow label="Total" value={pesoPlain(order.total)} total />
        </View>
      </DetailSection>
    </OrderSheetFrame>
  );
}

/**
 * The item's photo: a 56px tile. Without one (or when it fails to load) the
 * website shows its placeholder: a full-width grey band with the logo in
 * the middle, the name under it.
 */
function ItemThumb({ src }) {
  const uri = src ? resolveImg(src) : null;
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [uri]);
  if (!uri || failed) {
    return <View style={styles.itemBand}><View style={styles.itemBandMark}><ProductImage /></View></View>;
  }
  return (
    <View style={styles.itemImage}>
      <Image source={{ uri }} style={styles.itemPhoto} resizeMode="cover" onError={() => setFailed(true)} />
    </View>
  );
}

function SummaryRow({ label, value, total = false }) {
  return (
    <View style={[styles.row, total && styles.rowTotal]}>
      <Text style={[styles.rowText, total && styles.totalText]}>{label}</Text>
      <Text style={[styles.rowText, total && styles.totalText]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  head: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
    marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  headText: { flex: 1, minWidth: 0 },
  number: { marginBottom: 4, fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[900] },
  date: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },

  items: { gap: 10.5 },
  item: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 12, padding: 10.5, borderRadius: 4, backgroundColor: t.neutral[50],
  },
  itemBand: { width: '100%', height: 56, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: t.neutral[100] },
  itemBandMark: { width: 80, height: 80 },
  itemImage: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  itemPhoto: { width: '100%', height: '100%' },
  itemInfo: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  itemName: { marginBottom: 4, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  itemQty: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  itemPrice: { width: '100%', paddingLeft: 68, alignItems: 'flex-start' },
  price: { marginBottom: 4, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  // .order-details-item-price p outranks .item-subtotal: the same dark 14px as the price.
  subtotal: { marginBottom: 4, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  review: { marginTop: 6, alignSelf: 'stretch' },

  summary: { gap: 7 },
  // Cart.css's .summary-row padding reaches this sheet too.
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10.5 },
  rowText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700] },
  rowTotal: { marginTop: 7, paddingTop: 10.5, borderTopWidth: 1, borderTopColor: t.neutral[200] },
  totalText: { fontSize: 18, lineHeight: 28.8, ...font(500), color: t.neutral[900] },

  // flex: 1 1 0 on the website: each button's padding stays its own, the rest is shared.
  footBtn: { flexGrow: 1, flexShrink: 1, flexBasis: 35, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 17.5 },
  footText: { fontSize: 14, lineHeight: 22.4, ...font(500) },
  receivedBtn: { flexBasis: 22, paddingHorizontal: 10 },
  // Addresses.css's .btn-modal-cancel loads after Orders.css on the website,
  // so the phone shows the grey outline (10px 20px), not the red one.
  cancel: {
    flexBasis: 42, paddingVertical: 10, paddingHorizontal: 20, borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff',
  },
  cancelPressed: { backgroundColor: t.neutral[50] },
  cancelText: { color: t.neutral[700] },
  close: { backgroundColor: t.primary[600] },
  closePressed: { backgroundColor: t.primary[700] },
  closeText: { color: '#fff' },
});
