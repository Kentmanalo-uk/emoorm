import { useEffect, useRef, useState } from 'react';
import {
  Animated, BackHandler, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { GlassView } from 'expo-glass-effect';
import { font, ink, t, themed, veil } from '../theme';
import { liquidGlass } from './Glass';
import GradientIcon from './GradientIcon';

/*
 * Long-press preview ("peek"), as on iPhones and Android launchers: hold a
 * product, shop, chat or notification and it shades a little while the press
 * registers; then the page dims, the item lifts out of its place into a bigger
 * preview in the middle (with a tap of haptics), and its quick actions spring
 * in under it (on iOS 26, a Liquid Glass panel). Tapping the preview opens
 * the item; tapping an action does it; tapping the dimmed page or Android's
 * back sends it back where it came from.
 *
 *   <Pressable {...peekProps(() => ({ content, onOpen, actions }))} onPress={…}>
 *
 *   content   what the preview shows (a card built for it, see peek/*)
 *   onOpen    tapping the preview (usually the same as tapping the item)
 *   actions   [{ key, label, Icon, onPress, destructive }], falsy ones skipped
 *
 * The peek is built when the press is held, so it shows the item as it is
 * then (in the wishlist or not, read or not). Actions run once the peek has
 * closed, so a toast or a new page shows over the page, not under the peek.
 * PeekHost is mounted once, in app/_layout.js, over every page (a layer, not
 * a Modal: an action may open a sheet or a confirm right away, and iOS shows
 * one Modal at a time).
 */

// The motion is springs (mass, stiffness, damping), so it carries on from
// wherever it is when interrupted. The card: a slightly underdamped spring
// (a small, natural overshoot as it lands); the rows: stiffer, one after
// another; closing: a stiff spring that does not overshoot.
const CARD_SPRING = { damping: 19, stiffness: 230, mass: 0.95 };
const ROW_SPRING = { damping: 20, stiffness: 320, mass: 0.8 };
const MENU_SPRING = { damping: 22, stiffness: 280, mass: 0.9 };
const CLOSE_SPRING = { damping: 30, stiffness: 420, mass: 0.9, overshootClamping: true, restDisplacementThreshold: 0.01, restSpeedThreshold: 0.05 };
const MENU_DELAY_MS = 70;
// iOS 26: the glass panel materializes / melts away over these (seconds).
const GLASS_IN_S = 0.34;
const GLASS_OUT_S = 0.2;
// Closing: the rows go first (the last one first), then the panel folds up.
const ROW_OUT_MS = 120;
const ROW_OUT_STAGGER_MS = 22;
const ROW_STAGGER_MS = 32;
const DIM_MS = 260;
// Without the held item's size (a screen reader's "Preview"): how small the card starts.
const CARD_FROM = 0.55;
// How long a press is held before the preview opens (iOS's context menus ≈ 0.5 s),
// and from when the held item starts to shade (a quick tap never shows it).
export const PEEK_DELAY_MS = 380;
const HOLD_SHADE_AFTER_MS = 110;

// Each shortcut's icon colours (a gradient, light to deep), by what it does;
// a destructive one is always red. Unknown kinds take the next colour in turn.
const TINTS = {
  blue: ['#93c5fd', '#2563eb'],
  green: ['#6ee7b7', '#047857'],
  teal: ['#5eead4', '#0f766e'],
  pink: ['#f9a8d4', '#db2777'],
  amber: ['#fcd34d', '#ea580c'],
  violet: ['#c4b5fd', '#7c3aed'],
  sky: ['#7dd3fc', '#0284c7'],
  indigo: ['#a5b4fc', '#4f46e5'],
  red: ['#fca5a5', '#dc2626'],
};
const TINT_OF = {
  open: 'blue', view: 'blue', details: 'blue', edit: 'blue',
  cart: 'green', again: 'green', next: 'green', call: 'green', second: 'green',
  options: 'teal', offer: 'teal', read: 'teal', visibility: 'teal',
  wish: 'pink',
  shop: 'amber',
  share: 'violet',
  chat: 'sky',
  follow: 'indigo', buyer: 'indigo',
};
const ROTATION = ['blue', 'green', 'pink', 'amber', 'violet', 'sky', 'teal', 'indigo'];
const tintFor = (a, i) => TINTS[a.destructive ? 'red' : TINT_OF[a.key] || ROTATION[i % ROTATION.length]];

const usePeekStore = create(() => ({ peek: null, hold: null }));

// Haptics come from expo-haptics; an app build without it just stays silent.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
const buzz = () => {
  try {
    if (!Haptics) return;
    if (Platform.OS === 'android') Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press).catch(() => {});
    else if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  } catch {
    // No haptics on this phone.
  }
};

/**
 * Opens a peek: { content, onOpen, actions, from? }. `from`: where it lifts
 * out of on screen, { x, y } (a finger) or { x, y, width, height } (the item).
 */
export function showPeek(peek) {
  if (!peek?.content) return;
  buzz();
  usePeekStore.setState({ peek: { ...peek, id: `${Date.now()}:${Math.random()}` }, hold: null });
}

export const closePeek = () => usePeekStore.setState({ peek: null });

// The press being held (one at a time): its view, the finger, the shade's timer.
let held = null;
const measureOf = (target, done) => {
  if (typeof target?.measure !== 'function') { done(null); return; }
  try {
    target.measure((fx, fy, width, height, x, y) => done(width > 0 && height > 0 ? { x, y, width, height } : null));
  } catch {
    done(null);
  }
};
const endHold = () => {
  if (held?.timer) clearTimeout(held.timer);
  held = null;
  if (usePeekStore.getState().hold) usePeekStore.setState({ hold: null });
};

/**
 * Props for a Pressable that peeks when held: the held item's shade, the
 * long press and its delay, and the same for screen readers ("Preview").
 * `build` returns the peek, or null for none.
 */
export function peekProps(build) {
  const onPressIn = (e) => {
    endHold();
    const target = e?.currentTarget;
    const press = { target, x: e?.nativeEvent?.pageX, y: e?.nativeEvent?.pageY, timer: null };
    held = press;
    press.timer = setTimeout(() => measureOf(target, (rect) => {
      if (held === press && rect) usePeekStore.setState({ hold: { ...rect, id: `${Date.now()}` } });
    }), HOLD_SHADE_AFTER_MS);
  };
  const open = (e) => {
    const peek = build();
    const press = held;
    if (!peek) { endHold(); return; }
    const finger = Number.isFinite(e?.nativeEvent?.pageX) && Number.isFinite(e?.nativeEvent?.pageY)
      ? { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY }
      : null;
    // Lifts out of the held item itself (its place and size), else the finger's spot.
    measureOf(press?.target, (rect) => {
      endHold();
      showPeek({ ...peek, from: rect || finger || undefined });
    });
  };
  return {
    onPressIn,
    onPressOut: () => { if (!usePeekStore.getState().peek) endHold(); },
    onLongPress: open,
    delayLongPress: PEEK_DELAY_MS,
    accessibilityActions: [{ name: 'longpress', label: 'Preview' }],
    onAccessibilityAction: (e) => { if (e.nativeEvent.actionName === 'longpress') open(null); },
  };
}

export function PeekHost() {
  const peek = usePeekStore((s) => s.peek);
  const hold = usePeekStore((s) => s.hold);
  return (
    <>
      {hold && !peek ? <HoldShade key={hold.id} rect={hold} /> : null}
      {peek ? <PeekLayer key={peek.id} peek={peek} /> : null}
    </>
  );
}

/** The held item's shade: deepens while the press is held, until the preview opens. */
function HoldShade({ rect }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1, duration: PEEK_DELAY_MS - HOLD_SHADE_AFTER_MS, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.shade, {
        left: rect.x, top: rect.y, width: rect.width, height: rect.height, opacity: v,
      }]}
    />
  );
}

function PeekLayer({ peek }) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const dim = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const menu = useRef(new Animated.Value(0)).current;
  const actions = (peek.actions || []).filter(Boolean);
  const rows = useRef(actions.map(() => new Animated.Value(0))).current;
  // From where it lifts out of to the card's place, and how small it starts
  // (set once the card is laid out).
  const offX = useRef(new Animated.Value(0)).current;
  const offY = useRef(new Animated.Value(0)).current;
  const from = useRef(new Animated.Value(CARD_FROM)).current;
  const started = useRef(false);
  const leaving = useRef(false);
  // iOS 26: whether the menu's glass is there (it materializes, it can't fade).
  const [glassOn, setGlassOn] = useState(false);
  const glassTimer = useRef(null);
  useEffect(() => () => clearTimeout(glassTimer.current), []);
  const width = Math.min(screenW - 40, 360);

  useEffect(() => {
    Animated.timing(dim, { toValue: 1, duration: DIM_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [dim]);

  // The card's place is known: it lifts out of the held item into it.
  const onCardLayout = (e) => {
    if (started.current) return;
    started.current = true;
    const { y, height } = e.nativeEvent.layout;
    const src = peek.from;
    if (src) {
      const cx = src.width ? src.x + src.width / 2 : src.x;
      const cy = src.height ? src.y + src.height / 2 : src.y;
      offX.setValue(cx - screenW / 2);
      offY.setValue(cy - (y + height / 2));
      // The item's own width, as a share of the card's (kept between a third and nearly whole).
      if (src.width) from.setValue(Math.max(0.32, Math.min(0.94, src.width / width)));
    }
    Animated.spring(card, { toValue: 1, ...CARD_SPRING, useNativeDriver: true }).start();
    if (liquidGlass) glassTimer.current = setTimeout(() => setGlassOn(true), MENU_DELAY_MS);
    Animated.sequence([
      Animated.delay(MENU_DELAY_MS),
      Animated.parallel([
        Animated.spring(menu, { toValue: 1, ...MENU_SPRING, useNativeDriver: true }),
        Animated.stagger(ROW_STAGGER_MS, rows.map((r) => Animated.spring(r, { toValue: 1, ...ROW_SPRING, useNativeDriver: true }))),
      ]),
    ]).start();
  };

  // Android's back closes the preview, not the page under it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(); return true; });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back where it came from, then do `then` (open the item, run an action).
  const close = (then) => {
    if (leaving.current) return;
    leaving.current = true;
    [card, menu, ...rows].forEach((v) => v.stopAnimation());
    clearTimeout(glassTimer.current);
    setGlassOn(false);
    const rowOut = (r) => Animated.timing(r, { toValue: 0, duration: ROW_OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true });
    Animated.parallel([
      Animated.stagger(ROW_OUT_STAGGER_MS, [...rows].reverse().map(rowOut)),
      Animated.sequence([
        Animated.delay(Math.min(80, rows.length * ROW_OUT_STAGGER_MS)),
        Animated.spring(menu, { toValue: 0, ...CLOSE_SPRING, useNativeDriver: true }),
      ]),
      Animated.spring(card, { toValue: 0, ...CLOSE_SPRING, useNativeDriver: true }),
      Animated.timing(dim, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      if (usePeekStore.getState().peek?.id === peek.id) closePeek();
      if (then) requestAnimationFrame(then);
    });
  };

  // 0 → 1: from the held item (its place, its size) to the middle, full size.
  const away = Animated.subtract(1, card);
  const cardStyle = {
    opacity: card.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [
      { translateX: Animated.multiply(offX, away) },
      { translateY: Animated.multiply(offY, away) },
      { scale: Animated.add(from, Animated.multiply(Animated.subtract(1, from), card)) },
    ],
  };
  // The menu unfolds from under the card (Liquid Glass can't fade: there it only unfolds).
  const menuStyle = {
    transformOrigin: 'top left',
    transform: [
      { translateY: menu.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
      { scale: menu.interpolate({ inputRange: [0, 1], outputRange: [0.84, 1] }) },
    ],
    ...(liquidGlass ? null : { opacity: menu.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }) }),
  };
  const rowStyle = (r) => ({
    opacity: r.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: r.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  });

  return (
    <View style={styles.layer} accessibilityViewIsModal>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, liquidGlass ? styles.dimGlass : styles.dim, { opacity: dim }]} />
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={[
          styles.stage,
          { minHeight: screenH, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Taps beside the card close it too. */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityRole="button" accessibilityLabel="Close preview" />
        <Animated.View onLayout={onCardLayout} style={[{ width }, cardStyle]}>
          <Pressable
            onPress={peek.onOpen ? () => close(peek.onOpen) : undefined}
            accessibilityRole={peek.onOpen ? 'button' : undefined}
            accessibilityHint={peek.onOpen ? 'Opens it' : undefined}
            style={({ pressed }) => [styles.card, pressed && peek.onOpen && styles.cardPressed]}
          >
            {peek.content}
          </Pressable>
        </Animated.View>
        {actions.length ? (
          // As wide as the longest label, lined up with the card's left edge.
          <View style={[{ width }, styles.menuLane]}>
          <Animated.View style={[styles.menuBox, menuStyle]}>
            {/* iOS 26: real Liquid Glass that materializes, answers the finger and melts away;
                elsewhere the white panel. */}
            <MenuPanel glassOn={glassOn}>
              {actions.map((a, i) => (
                <Animated.View key={a.key || a.label} style={rowStyle(rows[i] || menu)}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => close(a.onPress)}
                    style={({ pressed }) => [
                      styles.action,
                      i > 0 && (liquidGlass ? styles.actionRuleGlass : styles.actionRule),
                      pressed && (liquidGlass ? styles.actionPressedGlass : styles.actionPressed),
                    ]}
                  >
                    {a.Icon ? <GradientIcon Icon={a.Icon} colors={tintFor(a, i)} size={24} /> : null}
                    <Text style={[styles.actionText, a.destructive && styles.destructive]} numberOfLines={1}>{a.label}</Text>
                  </Pressable>
                </Animated.View>
              ))}
            </MenuPanel>
          </Animated.View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

/** The shortcuts' panel: Liquid Glass on iOS 26 (materializing with `glassOn`), the white panel elsewhere. */
function MenuPanel({ glassOn, children }) {
  if (!liquidGlass) return <View style={[styles.menu, styles.menuPlain]}>{children}</View>;
  return (
    <GlassView
      isInteractive
      colorScheme="light"
      glassEffectStyle={{ style: glassOn ? 'regular' : 'none', animate: true, animationDuration: glassOn ? GLASS_IN_S : GLASS_OUT_S }}
      style={[styles.menu, styles.menuGlass]}
    >
      {children}
    </GlassView>
  );
}

/* ── Shared pieces for the preview cards (peek/*) ───────────────────────── */

/** A preview's text block under its picture. */
export function PeekBody({ children, style }) {
  return <View style={[styles.body, style]}>{children}</View>;
}

export const peekText = themed(() => StyleSheet.create({
  title: { fontSize: 17, lineHeight: 22, ...font(500), color: t.neutral[900] },
  sub: { fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[500] },
  body: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[700] },
}));

const styles = themed(() => StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 9000, elevation: 9000 },
  dim: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  // iOS 26: lighter, so the glass menu reads as glass.
  dimGlass: { backgroundColor: 'rgba(15, 23, 42, 0.28)' },
  // The held item's shade (most items are cards or rows with soft corners).
  shade: { position: 'absolute', borderRadius: 12, backgroundColor: 'rgba(15, 23, 42, 0.08)', zIndex: 8999, elevation: 8999 },
  stage: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  card: {
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 18, blurRadius: 44, color: ink(0.28) }],
  },
  cardPressed: { opacity: 0.92 },
  body: { gap: 4, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14 },

  menuLane: { alignItems: 'flex-start' },
  menuBox: { minWidth: 210 },
  menu: { overflow: 'hidden', borderRadius: 18 },
  // Not iOS 26: the white panel with a soft shadow.
  menuPlain: { backgroundColor: t.neutral[0], boxShadow: [{ offsetX: 0, offsetY: 10, blurRadius: 30, color: ink(0.2) }] },
  menuGlass: { backgroundColor: 'transparent' },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 48, paddingLeft: 14, paddingRight: 20,
  },
  actionRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink(0.14) },
  actionRuleGlass: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink(0.1) },
  actionPressed: { backgroundColor: ink(0.06) },
  actionPressedGlass: { backgroundColor: veil(0.35) },
  actionText: { flexShrink: 1, fontSize: 16, lineHeight: 20, ...font(400), color: t.neutral[900] },
  destructive: { color: t.danger[600] },
}));
