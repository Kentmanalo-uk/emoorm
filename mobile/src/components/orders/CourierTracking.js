import { useEffect, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowSquareOutIcon, CheckIcon, CopyIcon } from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';
import { trackingLink } from './orderProgress';
import copyText from './copyText';

const MONO = 'monospace';

/** A courier's logo on a white chip (1.75 : 1), or its initial on a tint. */
export function CourierMark({ courier, size = 32 }) {
  const name = courier?.name || 'Courier';
  const width = Math.round(size * 1.75);
  if (courier?.logoUrl) {
    return <Image source={{ uri: resolveImg(courier.logoUrl) }} resizeMode="contain" style={[styles.mark, styles.markLogo, { width, height: size }]} />;
  }
  return (
    <View style={[styles.mark, styles.markInitial, { width, height: size }]}>
      <Text style={[styles.markText, { fontSize: Math.round(size * 0.42) }]}>{name.replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'C'}</Text>
    </View>
  );
}

/**
 * A shipped order's courier and tracking number, with Copy and a button to
 * track the parcel (web/src/components/orders/CourierTracking.jsx).
 */
export default function CourierTracking({ order, showTrack = true }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!order?.trackingNumber) return null;
  const courier = order.courier || { name: order.courierName };
  const link = trackingLink(order);

  const copy = async () => {
    if (await copyText(order.trackingNumber)) {
      setCopied(true);
      toast.success('Tracking number copied');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } else {
      toast.error('Could not copy. Select the number to copy it.');
    }
  };

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <CourierMark courier={courier} size={36} />
        <View style={styles.text}>
          <Text style={styles.label}>Shipped with {courier.name || order.courierName}</Text>
          <View style={styles.numberRow}>
            <Text selectable style={styles.number}>{order.trackingNumber}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Copy tracking number" onPress={copy} style={styles.copy}>
              {copied ? <CheckIcon size={15} weight="bold" color={t.neutral[700]} /> : <CopyIcon size={15} color={t.neutral[700]} />}
              <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      {showTrack && link ? (
        <Pressable accessibilityRole="link" onPress={() => Linking.openURL(link).catch(() => {})} style={styles.track}>
          <Text style={styles.trackText}>Track your order here</Text>
          <ArrowSquareOutIcon size={15} weight="bold" color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Before it ships: the courier the buyer chose at checkout. */
export function CourierPending({ order }) {
  return (
    <View style={styles.pending}>
      <CourierMark courier={order.courier || { name: order.courierName }} size={30} />
      <View style={styles.pendingText}>
        <Text style={styles.pendingTitle}>Ships with {order.courierName}</Text>
        <Text style={styles.pendingSub}>The tracking number appears here once the seller hands it to the courier.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { flexShrink: 0, borderRadius: 8, backgroundColor: '#fff' },
  markLogo: { borderWidth: 1, borderColor: t.neutral[200] },
  markInitial: { alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50] },
  markText: { ...font(700), color: t.primary[700] },
  box: {
    gap: 10, padding: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[50],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  label: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[600] },
  numberRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  number: { fontFamily: MONO, fontSize: 15, lineHeight: 24, fontWeight: '500', letterSpacing: 0.45, color: t.neutral[900] },
  copy: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: '#fff',
  },
  copyText: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[700] },
  track: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 42, borderRadius: 12, backgroundColor: t.primary[600] },
  trackText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: '#fff' },
  pending: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[50],
  },
  pendingText: { flex: 1, minWidth: 0, gap: 2 },
  pendingTitle: { fontSize: 14, lineHeight: 20, ...font(500), color: t.neutral[900] },
  pendingSub: { fontSize: 12.5, lineHeight: 18, ...font(400), color: t.neutral[500] },
});
