import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import { HeartIcon, ShoppingCartIcon } from 'phosphor-react-native';
import { create } from 'zustand';
import { font, t } from '../theme';
import { liquidGlass } from './Glass';

/*
 * "Added to cart" / "Added to wishlist": a small box in the middle of the
 * screen that fades in, stays a moment and fades away (the iPhone's own
 * confirmation). iOS 26: a Liquid Glass box (the glass itself materialises
 * and melts away; glass can't be faded with opacity). Elsewhere: a white
 * frosted box. Taps go through it.
 *
 * showCommerceHud(message): lib/toast sends cart and wishlist successes here.
 */

const IN_MS = 220;
const HOLD_MS = 1400;
const OUT_MS = 240;

const useHud = create(() => ({ hud: null }));

export function showCommerceHud(message) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  const cart = lower.includes('cart');
  const removed = lower.includes('removed') || lower.includes('cleared');
  const title = cart
    ? (removed ? 'Removed from cart' : 'Added to cart')
    : (removed ? 'Wishlist updated' : 'Added to wishlist');
  // The message under the title only when it says more than the title does.
  const detail = text.replace(/\.$/, '').toLowerCase() === title.toLowerCase() ? '' : text;
  useHud.setState({ hud: { id: `${Date.now()}:${Math.random()}`, cart, removed, title, detail } });
}

export function CommerceHudHost() {
  const hud = useHud((s) => s.hud);
  if (!hud) return null;
  return <Hud key={hud.id} hud={hud} />;
}

function Hud({ hud }) {
  const { id, cart, removed, title, detail } = hud;
  // 0 → 1 in, 1 → 2 out.
  const p = useRef(new Animated.Value(0)).current;
  const [glassOn, setGlassOn] = useState(false);

  useEffect(() => {
    setGlassOn(true);
    let hold = null;
    const out = () => {
      setGlassOn(false);
      Animated.timing(p, { toValue: 2, duration: OUT_MS, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
        if (finished && useHud.getState().hud?.id === id) useHud.setState({ hud: null });
      });
    };
    Animated.timing(p, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (finished) hold = setTimeout(out, HOLD_MS);
    });
    return () => clearTimeout(hold);
  }, [id, p]);

  const fade = p.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] });
  const scale = p.interpolate({ inputRange: [0, 1, 2], outputRange: [0.9, 1, 0.96] });
  const Icon = cart ? ShoppingCartIcon : HeartIcon;
  const iconColor = cart ? t.primary[600] : t.accent[500];

  return (
    <View pointerEvents="none" style={styles.layer} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Animated.View style={[styles.box, !liquidGlass && styles.boxPlain, { transform: [{ scale }] }, !liquidGlass && { opacity: fade }]}>
        {liquidGlass ? (
          <GlassView
            pointerEvents="none"
            colorScheme="light"
            glassEffectStyle={{ style: glassOn ? 'regular' : 'none', animate: true, animationDuration: (glassOn ? IN_MS : OUT_MS) / 1000 }}
            style={[StyleSheet.absoluteFill, styles.glass]}
          />
        ) : null}
        <Animated.View style={[styles.content, liquidGlass && { opacity: fade }]}>
          <Icon size={38} weight={cart && removed ? 'regular' : 'fill'} color={iconColor} />
          <Text style={styles.title}>{title}</Text>
          {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 9500, elevation: 9500 },
  box: { width: 184, minHeight: 150, borderRadius: 26 },
  // Not iOS 26: a white frosted box with a soft shadow.
  boxPlain: {
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    boxShadow: [
      { offsetX: 0, offsetY: 16, blurRadius: 40, color: 'rgba(15, 23, 42, 0.16)' },
      { offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(15, 23, 42, 0.06)' },
    ],
  },
  glass: { borderRadius: 26 },
  content: {
    flex: 1,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 22,
    paddingHorizontal: 18,
  },
  title: { marginTop: 3, fontSize: 15, lineHeight: 19, ...font(600), color: t.neutral[900], textAlign: 'center' },
  detail: { fontSize: 12.5, lineHeight: 17, ...font(400), color: t.neutral[600], textAlign: 'center' },
});
