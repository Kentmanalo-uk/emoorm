import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, PanResponder, Pressable, StyleSheet, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, {
  Circle, Defs, G, LinearGradient, Path, Rect, Stop,
} from 'react-native-svg';
import { XIcon } from 'phosphor-react-native';
import useAuthStore from '../../store/authStore';
import { floatingTabBar, tabBarTop } from '../Glass';
import { LinearFill, SWEEP } from '../sell/SellArt';
import WeightWaveText from '../WeightWaveText';
import { t } from '../../theme';

/*
 * Home's floating "Start selling" bubble (shopping apps' floating promo
 * icon): a round little shop in the brand's pink-to-green ring, a pill under
 * it, and a small × that tucks it away until Home is shown again. Drag it
 * anywhere; let go and it springs to the nearest side. A bold wave runs
 * through the pill's words.
 * Tapping it opens the seller application (guests sign up first). Always
 * there for guests and buyers (an application under review too); gone once
 * the account has a shop (a seller), and never shown to admins.
 *
 *   <StartSellingBubble />   (last child of the Home screen's root View)
 */

const SIZE = 66; // the round shop
const EDGE = 2; // the frame's gap from the screen's sides (the pill, nearly as wide, stays ~6px in)
const TOP_CLEAR = 150; // below the Home header and search
const ITEM_H = SIZE + 22; // the bubble and its pill
const ITEM_W = 96; // wide enough for the pill (Android only lets touches land inside)

// The little shop: a striped pink awning, a green front with a door and a
// window, a gold coin and two sparkles.
function ShopArt() {
  return (
    <Svg width={SIZE - 10} height={SIZE - 10} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id="ssbFront" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.primary[400]} />
          <Stop offset="1" stopColor={t.primary[600]} />
        </LinearGradient>
        <LinearGradient id="ssbCoin" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#fde68a" />
          <Stop offset="1" stopColor="#f59e0b" />
        </LinearGradient>
        <LinearGradient id="ssbSky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.accent[50]} />
          <Stop offset="1" stopColor={t.primary[50]} />
        </LinearGradient>
      </Defs>
      <Circle cx="32" cy="32" r="32" fill="url(#ssbSky)" />
      {/* Ground shadow */}
      <Rect x="12" y="50" width="40" height="3" rx="1.5" fill={t.primary[900]} opacity="0.12" />
      {/* Sign board */}
      <Rect x="19" y="11" width="26" height="7" rx="2" fill={t.primary[700]} />
      <Rect x="24" y="13.5" width="16" height="2" rx="1" fill="#fff" opacity="0.85" />
      {/* Shop front */}
      <Rect x="15" y="26" width="34" height="25" rx="2.5" fill="url(#ssbFront)" />
      {/* Awning: five stripes, pink and white, with a scalloped edge */}
      <G>
        <Path d="M13 18 H51 L53 27 H11 Z" fill="#fff" />
        {[0, 2, 4].map((i) => (
          <Path key={i} d={`M${13 + i * 7.6} 18 H${20.6 + i * 7.6} L${11 + (i + 1) * 8.4} 27 H${11 + i * 8.4} Z`} fill={t.accent[500]} />
        ))}
        {[0, 1, 2, 3, 4].map((i) => (
          <Circle key={i} cx={15.2 + i * 8.4} cy="27" r="4.2" fill={i % 2 ? '#fff' : t.accent[500]} />
        ))}
      </G>
      {/* Door and window */}
      <Rect x="20" y="35" width="10" height="16" rx="2" fill="#fff" opacity="0.95" />
      <Circle cx="27.6" cy="43.5" r="0.9" fill={t.primary[600]} />
      <Rect x="34" y="35" width="11" height="8" rx="1.8" fill="#e0f2fe" />
      <Path d="M39.5 35 V43 M34 39 H45" stroke={t.primary[500]} strokeWidth="1" />
      {/* Coin */}
      <Circle cx="48" cy="46" r="7" fill="url(#ssbCoin)" stroke="#fff" strokeWidth="1.6" />
      <Path d="M45.7 49.4 V42.6 H48.6 a2 2 0 0 1 0 4 H45.7 M44.4 44 H51 M44.4 45.6 H51" stroke="#92400e" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {/* Sparkles */}
      <Path d="M52 9 l1.2 3 3 1.2 -3 1.2 -1.2 3 -1.2 -3 -3 -1.2 3 -1.2 Z" fill="#fbbf24" />
      <Path d="M10 16 l0.8 2 2 0.8 -2 0.8 -0.8 2 -0.8 -2 -2 -0.8 2 -0.8 Z" fill={t.accent[400]} />
    </Svg>
  );
}

export default function StartSellingBubble() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [hidden, setHidden] = useState(false); // the × (until Home is shown again)
  const [box, setBox] = useState(null); // the screen's size

  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const at = useRef({ x: 0, y: 0 });
  const appear = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  // When the last drag ended: the finger lifting off a drag is not a tap.
  const draggedAt = useRef(0);

  // Everyone without a shop: guests and buyers. A seller has one; admins don't sell.
  const canSell = !isAuthenticated || user?.role === 'BUYER';
  const placed = useRef(false);

  // Back on Home: a sticker tucked away with × comes back.
  useFocusEffect(useCallback(() => { setHidden(false); }, []));

  const bounds = (b = box) => {
    if (!b) return null;
    const bottomClear = (floatingTabBar ? tabBarTop(insets) : 0) + 14;
    return {
      left: EDGE,
      right: b.width - ITEM_W - EDGE,
      top: Math.min(TOP_CLEAR + insets.top * 0.2, b.height / 2),
      bottom: b.height - ITEM_H - bottomClear,
    };
  };

  // First place: the right side, a little below the middle. When it comes
  // back after ×, it pops in where it was.
  useEffect(() => {
    if (!box || hidden || !canSell) return;
    if (!placed.current) {
      const b = bounds();
      const start = { x: b.right, y: Math.max(b.top, Math.min(b.bottom, box.height * 0.6)) };
      at.current = start;
      pos.setValue(start);
      placed.current = true;
    }
    Animated.spring(appear, { toValue: 1, delay: 700, friction: 5, tension: 70, useNativeDriver: true }).start();
  }, [box, hidden, canSell]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = useRef(null);
  pan.current = PanResponder.create({
    // Taps go to the bubble and the ×; a real drag takes over.
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onPanResponderGrant: () => {
      draggedAt.current = Infinity;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      Animated.spring(lift, { toValue: 1, friction: 6, tension: 160, useNativeDriver: false }).start();
    },
    onPanResponderMove: (_, g) => {
      const b = bounds();
      if (!b) return;
      pos.setValue({
        x: Math.max(b.left - 6, Math.min(b.right + 6, at.current.x + g.dx)),
        y: Math.max(b.top, Math.min(b.bottom, at.current.y + g.dy)),
      });
    },
    onPanResponderRelease: (_, g) => {
      draggedAt.current = Date.now();
      const b = bounds();
      if (!b) return;
      const x = at.current.x + g.dx + g.vx * 60;
      const y = Math.max(b.top, Math.min(b.bottom, at.current.y + g.dy + g.vy * 40));
      const side = x + ITEM_W / 2 < box.width / 2 ? b.left : b.right;
      at.current = { x: side, y };
      Animated.parallel([
        Animated.spring(pos, { toValue: at.current, friction: 7, tension: 60, useNativeDriver: false }),
        Animated.spring(lift, { toValue: 0, friction: 6, tension: 120, useNativeDriver: false }),
      ]).start();
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { draggedAt.current = Date.now(); },
  });

  if (!canSell) return null;

  const open = () => {
    if (Date.now() - draggedAt.current < 350) return;
    Haptics.selectionAsync().catch(() => {});
    if (isAuthenticated) router.push('/seller-apply');
    else router.push({ pathname: '/register', params: { redirect: '/seller-apply' } });
  };

  const dismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(appear, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true })
      .start(() => setHidden(true));
  };

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {box && !hidden ? (
        <Animated.View
          {...pan.current.panHandlers}
          style={[styles.item, { transform: pos.getTranslateTransform() }]}
        >
          <Animated.View
            style={{
              width: ITEM_W,
              alignItems: 'center',
              opacity: appear,
              transform: [{ scale: appear }],
            }}
          >
            <View style={styles.stage}>
              <Pressable
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel="Start selling on E-MOORM"
                accessibilityHint="Opens the seller application. Drag to move it."
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Animated.View style={[styles.ring, {
                  transform: [{ scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
                }]}
                >
                  <LinearFill stops={SWEEP} radius={SIZE / 2} diagonal />
                  <View style={styles.face}><ShopArt /></View>
                </Animated.View>
              </Pressable>
              <Pressable
                onPress={dismiss}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Hide Start selling for now"
                style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
              >
                <XIcon size={10} weight="bold" color="#fff" />
              </Pressable>
            </View>
            <Pressable onPress={open} accessibilityElementsHidden importantForAccessibility="no" style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
              <LinearFill stops={SWEEP} radius={11} />
              <WeightWaveText text="Start selling" style={styles.pillText} paused={hidden} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { position: 'absolute', left: 0, top: 0, width: ITEM_W, alignItems: 'center' },
  stage: { width: SIZE, height: SIZE },
  ring: {
    width: SIZE, height: SIZE, borderRadius: SIZE / 2, padding: 3, overflow: 'hidden',
    boxShadow: [{ offsetX: 0, offsetY: 6, blurRadius: 14, color: 'rgba(4, 120, 87, 0.30)' }],
  },
  face: {
    flex: 1, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#fff', overflow: 'hidden',
  },
  pressed: { transform: [{ scale: 0.94 }] },
  pill: {
    zIndex: 1, alignSelf: 'center', marginTop: -9, height: 22, paddingHorizontal: 9, borderRadius: 11,
    justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(219, 39, 119, 0.28)' }],
  },
  pillText: { fontSize: 11, lineHeight: 14, color: '#fff' },
  close: {
    zIndex: 2, position: 'absolute', top: -4, right: -6, width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.62)',
    borderWidth: 1.5, borderColor: '#fff',
  },
  closePressed: { backgroundColor: 'rgba(15, 23, 42, 0.85)' },
});
