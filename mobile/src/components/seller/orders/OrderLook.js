import { memo, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Image, StyleSheet, Text, View,
} from 'react-native';
import {
  CheckIcon, ClockIcon, PackageIcon, TruckIcon, XIcon,
} from '../../../lib/icons';
import { resolveImg } from '../../../lib/media';
import { variationImage } from '../../../lib/variationImage';
import { font, t, themed } from '../../../theme';
import { GradientFill } from '../../inbox/InboxGradient';

/*
 * An order in a seller's list (web/src/components/orders/OrderLook.jsx and
 * web/src/lib/orderLook.js): by what was sold, not by its number. A seller
 * knows an order as "the Buko Juice for Ana", so a list leads with the first
 * product's photo and name; the order number is a small reference
 * underneath.
 *
 *   OrderThumb  the product's photo, where the order stands as a solid badge
 *               on its corner
 *   OrderState  the status in coloured words over a short track of its four
 *               steps, the step under way breathing
 *   orderLook / orderStage / orderRef  the facts they are drawn from
 *
 * No pale tinted chips: colour only where it says something.
 */

/** The four steps an order goes through: placed, prepared, on its way or waiting, done. */
export const ORDER_STEPS = 4;

const STAGES = {
  PENDING: { tone: 'amber', Icon: ClockIcon, step: 1 },
  CONFIRMED: { tone: 'blue', Icon: CheckIcon, step: 2 },
  PREPARING: { tone: 'blue', Icon: PackageIcon, step: 2 },
  TO_SHIP: { tone: 'blue', Icon: PackageIcon, step: 3 },
  READY: { tone: 'blue', Icon: PackageIcon, step: 3 },
  READY_FOR_PICKUP: { tone: 'blue', Icon: PackageIcon, step: 3 },
  OUT_FOR_DELIVERY: { tone: 'blue', Icon: TruckIcon, step: 3 },
  SHIPPED: { tone: 'blue', Icon: TruckIcon, step: 3 },
  DELIVERED: { tone: 'green', Icon: CheckIcon, step: 4 },
  PICKED_UP: { tone: 'green', Icon: CheckIcon, step: 4 },
  COMPLETED: { tone: 'green', Icon: CheckIcon, step: 4 },
  CANCELLED: { tone: 'red', Icon: XIcon, step: 0 },
};

/** Where an order stands: its colour, the badge icon, and its step (0 when cancelled). */
export const orderStage = (status) => STAGES[status] || STAGES.PENDING;

/** An order's first product: its photo and name, how many other products, and the count in all. */
export function orderLook(order) {
  const items = order?.items || [];
  const first = items[0];
  return {
    photo: first ? variationImage(first.product, first.selectedVariations) : null,
    name: first?.productName || first?.product?.name || 'Order',
    more: Math.max(0, items.length - 1),
    qty: items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0) || order?.itemsCount || 1,
  };
}

/** The order number as a short reference: "#975870-1". */
export const orderRef = (order) => `#${(order?.orderNumber || order?.id || '').toString().slice(-8)}`;

/* Each tone's two ends (the badge and the track are drawn from one to the
   other) and its ink (the words). The ends are the website's fixed colours;
   the ink is the theme's, so it turns with the mode. */
const TONE_ENDS = {
  green: ['#34d399', '#059669'],
  blue: ['#60a5fa', '#2563eb'],
  amber: ['#fbbf24', '#d97706'],
  red: ['#f87171', '#dc2626'],
};
const TONE_INK = themed(() => ({
  green: t.primary[700],
  blue: t.info[700],
  amber: t.warning[700],
  red: t.danger[700],
}));

/**
 * The product's photo. With a status, its badge sits on the corner; a list
 * that is all one status (the completed orders) leaves it off.
 * size: the photo's side (44 by default); ring: the colour around the badge,
 * the row's own background, so it reads as cut out of the photo.
 */
export const OrderThumb = memo(function OrderThumb({
  photo, status, size = 44, ring, style,
}) {
  const [broken, setBroken] = useState(false);
  const stage = status ? orderStage(status) : null;
  const src = photo && !broken ? resolveImg(photo) : null;
  const ends = stage ? TONE_ENDS[stage.tone] : null;
  const BadgeIcon = stage?.Icon;
  return (
    <View style={[{ width: size, height: size }, styles.thumb, style]}>
      <View style={styles.thumbImg}>
        <GradientFill colors={[t.neutral[50], t.neutral[100]]} />
        {src
          ? <Image source={{ uri: src }} style={styles.photo} resizeMode="cover" onError={() => setBroken(true)} />
          : <PackageIcon size={22} weight="fill" color={t.neutral[300]} />}
      </View>
      {stage ? (
        <View
          style={[styles.badge, { borderColor: ring || t.neutral[0], boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 8, spreadDistance: -3, color: ends[1] }] }]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <GradientFill colors={ends} radius={10} />
          <BadgeIcon size={11} weight="bold" color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
});

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((on) => { reduceMotion = Boolean(on); }).catch(() => {});

/** The step under way: breathes (1.8 s), so an order still moving looks it. */
function NowStep({ ends }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View style={[styles.step, { opacity }]}>
      <GradientFill colors={ends} diagonal={false} radius={2} />
    </Animated.View>
  );
}

/**
 * Where it stands in words, over the track of its four steps: the steps done
 * filled in the status's colour, the one under way breathing. A cancelled
 * order is its words alone.
 */
export const OrderState = memo(function OrderState({ status, label, style }) {
  const { tone, step } = orderStage(status);
  const live = step > 0 && step < ORDER_STEPS;
  const ends = TONE_ENDS[tone];
  return (
    <View style={[styles.state, style]}>
      <Text style={[styles.stateLabel, { color: TONE_INK[tone] }]} numberOfLines={1}>{label}</Text>
      {step > 0 ? (
        <View style={styles.track} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {Array.from({ length: ORDER_STEPS }, (_, i) => {
            if (i < step && i === step - 1 && live) return <NowStep key={i} ends={ends} />;
            if (i < step) {
              return (
                <View key={i} style={styles.step}>
                  <GradientFill colors={ends} diagonal={false} radius={2} />
                </View>
              );
            }
            return <View key={i} style={[styles.step, styles.stepTodo]} />;
          })}
        </View>
      ) : null}
    </View>
  );
});

const styles = themed(() => StyleSheet.create({
  thumb: { position: 'relative', flexShrink: 0 },
  thumbImg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  photo: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  // 20px across inside a 2.5px ring in the row's colour.
  badge: {
    position: 'absolute',
    right: -7.5,
    bottom: -7.5,
    width: 25,
    height: 25,
    borderRadius: 12.5,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  state: { alignItems: 'flex-end', gap: 5 },
  stateLabel: { fontSize: 12, lineHeight: 15, letterSpacing: 0.1, ...font(600) },
  track: { flexDirection: 'row', gap: 3 },
  step: { width: 11, height: 4, borderRadius: 2, overflow: 'hidden' },
  stepTodo: { backgroundColor: t.neutral[200] },
}));
