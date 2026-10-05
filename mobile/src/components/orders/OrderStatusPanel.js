import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ArrowSquareOutIcon, MapPinIcon, MoneyIcon, PhoneIcon, QrCodeIcon, StorefrontIcon,
} from 'phosphor-react-native';
import { font, t } from '../../theme';
import { resolveImg } from '../../lib/media';
import {
  handOver, orderStage, orderSteps, payLabel, peso, when,
} from './orderProgress';

const PAYMENT_STATE = {
  PENDING: 'Not paid yet',
  PENDING_VERIFICATION: 'Being checked by the shop',
  PAID: 'Paid',
  FAILED: 'Proof rejected: send a new one',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partly refunded',
};

/** One section of the order details sheet (.order-details-section). */
export function DetailSection({ title, last = false, children, style }) {
  return (
    <View style={[styles.section, last && styles.sectionLast, style]}>
      {title ? <Text style={styles.h3} accessibilityRole="header">{title}</Text> : null}
      {children}
    </View>
  );
}

/**
 * Where the order stands, its steps as a timeline, where it goes or is
 * collected, and how it is paid (web/src/components/orders/OrderStatusPanel.jsx).
 */
export default function OrderStatusPanel({ order }) {
  const stage = orderStage(order);
  const steps = order.status === 'CANCELLED' ? [] : orderSteps(order);
  const place = handOver(order);
  const codPending = order.paymentMethod === 'COD' && order.paymentStatus === 'PENDING';
  const PlaceIcon = place.pickup ? StorefrontIcon : MapPinIcon;
  const PayIcon = order.paymentMethod === 'COD' ? MoneyIcon : QrCodeIcon;

  return (
    <>
      <DetailSection>
        <Text style={styles.title}>{stage.title}</Text>
        {stage.text ? <Text style={styles.text}>{stage.text}</Text> : null}
        {steps.length > 0 ? (
          <View style={styles.steps} accessibilityLabel="Order progress">
            {steps.map((s, i) => {
              const last = i === steps.length - 1;
              return (
                <View key={s.key} style={[styles.step, last && styles.stepLast]}>
                  {!last ? <View style={styles.line} /> : null}
                  <View style={styles.dotBox}>
                    <View style={s.done ? styles.dotDone : s.current ? styles.dotCurrent : styles.dot} />
                  </View>
                  <View style={styles.stepText}>
                    <Text style={[styles.stepLabel, (s.done || s.current) && styles.stepLabelOn]}>{s.label}</Text>
                    {s.done && s.at ? <Text style={styles.stepTime}>{when(s.at)}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </DetailSection>

      <DetailSection title={place.pickup ? 'Pickup at' : 'Delivery Address'}>
        <View style={styles.box}>
          <PlaceIcon size={20} color={t.primary[600]} style={styles.boxIcon} />
          <View style={styles.boxText}>
            <Text style={styles.boxP}>{place.address}</Text>
            {!place.pickup ? (
              <Text style={styles.sub}>
                Delivered by {place.by}{Number(order.deliveryFee) > 0 ? ` · ${peso(order.deliveryFee)} fee` : ' · free delivery'}
              </Text>
            ) : null}
            {place.note ? <Text style={styles.sub}>{place.pickup ? 'Shop says: ' : 'Your note: '}{place.note}</Text> : null}
            {order.contactNumber ? (
              <View style={styles.line2}>
                <PhoneIcon size={14} color={t.neutral[500]} />
                <Text style={styles.boxP}>{order.contactNumber}</Text>
              </View>
            ) : null}
            {place.mapUrl ? (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(place.mapUrl).catch(() => {})} style={styles.link}>
                <Text style={styles.linkText}>Open in Maps</Text>
                <ArrowSquareOutIcon size={13} color={t.primary[700]} />
              </Pressable>
            ) : null}
          </View>
        </View>
      </DetailSection>

      <DetailSection title="Payment">
        <View style={styles.box}>
          <PayIcon size={20} color={t.primary[600]} style={styles.boxIcon} />
          <View style={styles.boxText}>
            <Text style={styles.boxP}>{payLabel(order.paymentMethod, place.pickup)} · {peso(order.total)}</Text>
            <Text style={styles.sub}>
              {codPending
                ? `Pay when you ${place.pickup ? 'pick it up' : 'receive it'}`
                : PAYMENT_STATE[order.paymentStatus] || order.paymentStatus}
              {order.paymentReference ? ` · ref. ${order.paymentReference}` : ''}
            </Text>
          </View>
        </View>
      </DetailSection>
    </>
  );
}

/** The photo the shop took when handing the order over (ProofPhotoSheet OrderProof). */
export function OrderProof({ order }) {
  if (!order?.fulfillmentProofUrl) return null;
  const pickup = order.fulfillmentMethod === 'PICKUP';
  const src = resolveImg(order.fulfillmentProofUrl);
  const at = order.fulfillmentProofAt ? new Date(order.fulfillmentProofAt) : null;
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const stamp = at ? `${M[at.getMonth()]} ${at.getDate()}, ${at.getFullYear()}, ${at.getHours() % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${at.getHours() < 12 ? 'AM' : 'PM'}` : null;
  return (
    <View style={styles.proof}>
      <View style={styles.proofLabel}>
        <Text style={styles.proofLabelText}>{pickup ? 'Proof of pickup' : 'Proof of delivery'}</Text>
        {stamp ? <Text style={styles.proofTime}>{stamp}</Text> : null}
      </View>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel="Open full photo" onPress={() => Linking.openURL(src).catch(() => {})} style={styles.proofPhoto}>
        <Image source={{ uri: src }} style={styles.proofImg} resizeMode="cover" accessibilityLabel={pickup ? 'Proof of pickup' : 'Proof of delivery'} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingBottom: 17.5, marginBottom: 17.5, borderBottomWidth: 1, borderBottomColor: t.neutral[200] },
  sectionLast: { paddingBottom: 0, marginBottom: 0, borderBottomWidth: 0 },
  h3: { marginBottom: 10.5, fontSize: 16, lineHeight: 18.4, ...font(500), color: t.neutral[900] },

  title: { fontSize: 16, lineHeight: 21.6, ...font(500), color: t.neutral[900] },
  text: { marginTop: 4, fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[500] },
  steps: { marginTop: 16 },
  step: { flexDirection: 'row', gap: 16, minHeight: 40, paddingBottom: 14 },
  stepLast: { minHeight: 0, paddingBottom: 0 },
  line: { position: 'absolute', top: 14, bottom: -2, left: 6, width: 2, backgroundColor: t.neutral[200] },
  dotBox: { width: 14, height: 14, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.neutral[300] },
  dotDone: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 4, borderColor: t.primary[50], backgroundColor: t.primary[600],
  },
  dotCurrent: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: t.primary[600], backgroundColor: t.neutral[0] },
  stepText: { flex: 1, minWidth: 0, gap: 2 },
  stepLabel: { fontSize: 15, lineHeight: 21, ...font(400), color: t.neutral[500] },
  stepLabelOn: { color: t.neutral[900] },
  stepTime: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },

  box: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: t.neutral[50] },
  boxIcon: { marginTop: 2 },
  boxText: { flex: 1, minWidth: 0, gap: 4 },
  boxP: { fontSize: 15, lineHeight: 21.75, ...font(400), color: t.neutral[800] },
  sub: { fontSize: 13.5, lineHeight: 19.575, ...font(400), color: t.neutral[500] },
  line2: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start' },
  linkText: { fontSize: 14, lineHeight: 21, ...font(500), color: t.primary[700] },

  proof: { gap: 8 },
  proofLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  proofLabelText: { fontSize: 13, lineHeight: 20, ...font(500), color: t.neutral[700] },
  proofTime: { fontSize: 12, lineHeight: 18, ...font(400), color: t.neutral[500] },
  proofPhoto: { width: '100%', maxWidth: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[100] },
  proofImg: { width: '100%', height: 240 },
});
