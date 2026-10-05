import { useEffect, useId, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, FeComposite, FeFlood, FeGaussianBlur, FeMerge, FeMergeNode, FeOffset, Filter,
  G, LinearGradient, Path, Rect, Stop,
} from 'react-native-svg';
import { t } from '../../theme';
import ICONS from './guideArtIcons';

/*
 * The pictures on the Seller Center's first-visit sheets (web/src/components/
 * seller/SellerGuideArt.jsx + .css): minimal glass. One frosted shape holding
 * the page's icon in the pink-to-green gradient, a tilted pane behind it and
 * soft glows of colour underneath. The glass floats, the pane sways, the
 * glows drift (all still when the system asks for reduced motion).
 *
 * <SellerGuideArt name="orders" width={280} />
 * name: one of SCENES below (the website's scene names). Decorative.
 *
 * The website animates the parts of one SVG; here each moving part is its own
 * layer (the same 280 × 168 scene) so the movement runs on the native driver.
 */
export const SCENES = {
  home: { icon: 'SquaresFour', shape: 'square', tilt: -10 },
  products: { icon: 'Package', shape: 'square', tilt: 9 },
  newProduct: { icon: 'Camera', shape: 'circle', tilt: 0 },
  orders: { icon: 'ClipboardText', shape: 'phone', tilt: 10 },
  today: { icon: 'CookingPot', shape: 'circle', tilt: 0 },
  // The guided setup (/seller/welcome).
  welcome: { icon: 'Confetti', shape: 'circle', tilt: 0 },
  identity: { icon: 'IdentificationCard', shape: 'wide', tilt: -7 },
  business: { icon: 'Briefcase', shape: 'square', tilt: 9 },
  branding: { icon: 'Image', shape: 'wide', tilt: 7 },
  about: { icon: 'NotePencil', shape: 'bubble', tilt: -8 },
  delivery: { icon: 'Truck', shape: 'wide', tilt: -6 },
  pickup: { icon: 'MapPin', shape: 'circle', tilt: 0 },
  payment: { icon: 'QrCode', shape: 'square', tilt: 8 },
  product: { icon: 'Camera', shape: 'circle', tilt: 0 },
  ready: { icon: 'RocketLaunch', shape: 'circle', tilt: 0 },
  returns: { icon: 'ArrowCounterClockwise', shape: 'circle', tilt: 0 },
  messages: { icon: 'ChatCircleDots', shape: 'bubble', tilt: 8 },
  assistant: { icon: 'Lightbulb', shape: 'bubble', tilt: -8 },
  marketing: { icon: 'Megaphone', shape: 'wide', tilt: -7 },
  decorate: { icon: 'PaintBrush', shape: 'phone', tilt: -10 },
  menu: { icon: 'UserCircle', shape: 'phone', tilt: 9 },
  store: { icon: 'Storefront', shape: 'square', tilt: -9 },
  fulfillment: { icon: 'Truck', shape: 'wide', tilt: 7 },
  analytics: { icon: 'ChartLineUp', shape: 'wide', tilt: -6 },
  finance: { icon: 'Wallet', shape: 'square', tilt: 10 },
  reviews: { icon: 'Star', shape: 'circle', tilt: 0 },
  questions: { icon: 'Question', shape: 'bubble', tilt: -8 },
  notifications: { icon: 'Bell', shape: 'circle', tilt: 0 },
  support: { icon: 'Headset', shape: 'circle', tilt: 0 },
  settings: { icon: 'GearSix', shape: 'square', tilt: 8 },
};

// The front shape, centred on (140, 80) in the 280 × 168 scene, with the box
// the icon sits in. `back` is the pane behind it (before tilting); `pivot`
// the centre of that pane, which the sway turns around.
const SHAPES = {
  square: {
    front: (p) => <Rect x="94" y="34" width="92" height="92" rx="26" {...p} />,
    back: (p) => <Rect x="112" y="24" width="84" height="84" rx="24" {...p} />,
    icon: { cx: 140, cy: 80, s: 66 },
  },
  circle: {
    front: (p) => <Circle cx="140" cy="80" r="48" {...p} />,
    back: (p) => <Circle cx="170" cy="62" r="34" {...p} />,
    icon: { cx: 140, cy: 80, s: 64 },
  },
  bubble: {
    front: (p) => <Path d="M118 38h44a28 28 0 0 1 28 28v18a28 28 0 0 1 -28 28h-30l-24 18l4 -20a28 28 0 0 1 -22 -26v-18a28 28 0 0 1 28 -28Z" {...p} />,
    back: (p) => <Rect x="128" y="26" width="76" height="60" rx="26" {...p} />,
    icon: { cx: 140, cy: 75, s: 58 },
  },
  phone: {
    front: (p) => <Rect x="108" y="20" width="64" height="118" rx="18" {...p} />,
    back: (p) => <Rect x="128" y="28" width="58" height="104" rx="16" {...p} />,
    icon: { cx: 140, cy: 82, s: 50 },
    notch: true,
  },
  wide: {
    front: (p) => <Rect x="80" y="40" width="120" height="80" rx="24" {...p} />,
    back: (p) => <Rect x="100" y="26" width="104" height="68" rx="22" {...p} />,
    icon: { cx: 140, cy: 80, s: 64 },
  },
};

const VW = 280;
const VH = 168;

// One looping animation: 0 → 1 → 0 over `ms`, eased in and out.
function useLoop(ms, still) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) { v.setValue(0); return undefined; }
    const half = { duration: ms / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: true };
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, ...half }),
      Animated.timing(v, { toValue: 0, ...half }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [ms, still, v]);
  return v;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then((on) => { if (alive) setReduced(Boolean(on)); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (on) => setReduced(Boolean(on)));
    return () => { alive = false; sub?.remove?.(); };
  }, []);
  return reduced;
}

export default function SellerGuideArt({ name, width = VW, style }) {
  const uid = `sga${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const url = (part) => `url(#${uid}-${part})`;
  const { icon, shape, tilt } = SCENES[name] || SCENES.home;
  const geo = SHAPES[shape];
  const k = width / VW;
  const height = VH * k;
  const still = useReducedMotion();

  const float = useLoop(4200, still);
  const sway = useLoop(6000, still);
  const driftA = useLoop(7000, still);
  const driftB = useLoop(8000, still);

  const glass = { fill: url('glass'), stroke: url('edge'), strokeWidth: 1.5 };
  const { cx, cy, s } = geo.icon;
  const box = { width, height };
  const layer = [StyleSheet.absoluteFill, box];
  const svg = (children, defs) => (
    <Svg width={width} height={height} viewBox={`0 0 ${VW} ${VH}`} style={styles.svg}>
      {defs ? <Defs>{defs}</Defs> : null}
      {children}
    </Svg>
  );
  const blur = (
    <Filter id={`${uid}-blur`} x="-60%" y="-60%" width="220%" height="220%">
      <FeGaussianBlur stdDeviation="14" />
    </Filter>
  );
  const glassDefs = (
    <>
      <LinearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0.7" y2="1">
        <Stop offset="0" stopColor="#ffffff" stopOpacity="0.92" />
        <Stop offset="1" stopColor="#ffffff" stopOpacity="0.42" />
      </LinearGradient>
      <LinearGradient id={`${uid}-edge`} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
        <Stop offset="1" stopColor="#ffffff" stopOpacity="0.2" />
      </LinearGradient>
    </>
  );

  // The pane's centre after the static tilt (it turns around (150, 70)).
  const backBox = { square: [154, 66], circle: [170, 62], bubble: [166, 56], phone: [157, 80], wide: [152, 60] }[shape];
  const pivotPct = (x, y) => `${(x / VW) * 100}% ${(y / VH) * 100}%`;

  return (
    <View style={[{ width, height }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Colour behind the glass: two drifting glows. */}
      <Animated.View style={[layer, { transform: [
        { translateX: driftA.interpolate({ inputRange: [0, 1], outputRange: [0, 10 * k] }) },
        { translateY: driftA.interpolate({ inputRange: [0, 1], outputRange: [0, 6 * k] }) },
      ] }]}>
        {svg(<G filter={url('blur')}><Circle cx="112" cy="70" r="46" fill={t.primary[300]} opacity={0.7} /></G>, blur)}
      </Animated.View>
      <Animated.View style={[layer, { transform: [
        { translateX: driftB.interpolate({ inputRange: [0, 1], outputRange: [0, -10 * k] }) },
        { translateY: driftB.interpolate({ inputRange: [0, 1], outputRange: [0, -6 * k] }) },
      ] }]}>
        {svg(<G filter={url('blur')}><Circle cx="178" cy="100" r="36" fill={t.accent[300]} opacity={0.8} /></G>, blur)}
      </Animated.View>

      {/* The ground shadow breathes with the float. */}
      <Animated.View style={[layer, {
        transformOrigin: pivotPct(140, 152),
        opacity: float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.625] }),
        transform: [{ scaleX: float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
      }]}>
        {svg(<Ellipse cx="140" cy="152" rx="56" ry="6" fill={t.primary[900]} opacity={0.08} />)}
      </Animated.View>

      {/* The pane behind, tilted, swaying. */}
      <Animated.View style={[layer, {
        transformOrigin: pivotPct(...backBox),
        transform: [
          { translateY: sway.interpolate({ inputRange: [0, 1], outputRange: [0, 3 * k] }) },
          { rotate: sway.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-3deg'] }) },
        ],
      }]}>
        {svg(
          <G transform={`rotate(${tilt || 12} 150 70)`} opacity={0.6}>{geo.back(glass)}</G>,
          glassDefs,
        )}
      </Animated.View>

      {/* The glass with the icon, floating. */}
      <Animated.View style={[layer, { transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -6 * k] }) }] }]}>
        {svg(
          <>
            {geo.front({ ...glass, filter: url('lift') })}
            <Path d="M60 10h110L60 120Z" fill="#ffffff" opacity={0.28} clipPath={url('clip')} />
            {geo.notch ? <Rect x="130" y="27" width="20" height="4" rx="2" fill="#ffffff" opacity={0.9} /> : null}
            <G transform={`translate(${cx - s / 2} ${cy - s / 2}) scale(${s / 256})`} fill={url('icon')}>
              {(ICONS[icon] || []).map((d) => <Path key={d.slice(0, 24)} d={d} />)}
            </G>
          </>,
          <>
            {glassDefs}
            {/* The bright brand sweep, as on Profile's My Purchase icons. */}
            <LinearGradient id={`${uid}-icon`} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ff4fa7" />
              <Stop offset="1" stopColor="#14d27c" />
            </LinearGradient>
            {/* feDropShadow dy 8, blur 8, deep green at 14%, from its parts. */}
            <Filter id={`${uid}-lift`} x="-40%" y="-40%" width="180%" height="190%">
              <FeGaussianBlur in="SourceAlpha" stdDeviation="8" result="b" />
              <FeOffset in="b" dx="0" dy="8" result="o" />
              <FeFlood floodColor={t.primary[900]} floodOpacity="0.14" result="c" />
              <FeComposite in="c" in2="o" operator="in" result="s" />
              <FeMerge>
                <FeMergeNode in="s" />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>
            <ClipPath id={`${uid}-clip`}>{geo.front({})}</ClipPath>
          </>,
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  svg: { overflow: 'visible' },
});
