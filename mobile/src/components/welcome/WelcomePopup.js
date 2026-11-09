import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import { useIsFocused, useRouter } from 'expo-router';
import Svg, {
  Circle, Defs, G, LinearGradient, Mask, Path, Pattern, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import AuthScene from '../art/AuthScenes';
import {
  ChatCircleIcon, MoneyIcon, PlusIcon, SparkleIcon, StorefrontIcon, TruckIcon, WalletIcon, XIcon,
} from '../../lib/icons';
import useAuthStore from '../../store/authStore';
import {
  markVisitorWelcomeSeen, setPromotionShowing, visitorWelcomeSeen, welcomeReady,
} from '../../lib/welcome';
import stopPaint from '../../lib/stopPaint';
import { font, t, useScheme } from '../../theme';

/*
 * The welcome pop-up (web components/welcome/WelcomePopup.jsx + .css): a pink
 * card with the sign-up gift box bursting out of its top, two "tickets" (what
 * every shopper gets), one button, and three small promises under it. Only
 * what is true of E-MOORM: no vouchers, no peso amounts, no free shipping.
 *
 *   variant="visitor"  Home, signed out (VisitorWelcome below): "Create my account"
 *   variant="new"      just made an account (NewAccountWelcome.js): "Start shopping"
 *
 * It springs open (small, past its size, settled) over a plain dim (no blur),
 * and closes by swelling a touch then shrinking away while the dim fades.
 * onAction runs after the card has closed; onClose for ×, the dim and Back.
 *
 * The gift box is the sign-up sheet's scene (art/AuthScenes signUp, the same
 * drawing as the website's PopArt AuthSignUp in the emerald tone) without
 * its pale disc, as the website hides it here.
 */

const TICKETS = [
  {
    key: 'cod', Icon: MoneyIcon, title: 'Cash on\ndelivery', sub: 'Pay when it arrives',
    back: ['#fbcfe8', '#f472b6'], pocket: ['#f472b6', '#be185d'], tint: '#fdf2f8', tone: '#db2777',
  },
  {
    key: 'fulfil', Icon: TruckIcon, title: 'Delivery\nor pickup', sub: 'Choose at checkout',
    back: ['#a7f3d0', '#34d399'], pocket: ['#10b981', '#047857'], tint: '#ecfdf5', tone: '#047857',
  },
];

const PERKS = [
  { key: 'local', Icon: StorefrontIcon, lines: ['Local', 'shops'] },
  { key: 'chat', Icon: ChatCircleIcon, lines: ['Chat with', 'sellers'] },
  { key: 'pay', Icon: WalletIcon, lines: ['Cash or', 'GCash'] },
];

const CLOSE_MS = 340;
const ART = 168;
const native = Platform.OS !== 'web';

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotion = Boolean(v); }).catch(() => {});

let uid = 0;
const useUid = (prefix) => {
  const ref = useRef(null);
  if (!ref.current) { uid += 1; ref.current = `${prefix}${uid}`; }
  return ref.current;
};

/** A vertical gradient filling its parent, clipped to `radius`. */
function Wash({ stops, radius = 0, style }) {
  const id = useUid('wpw');
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            {stops.map(([o, c]) => <Stop key={o} offset={o} {...stopPaint(c)} />)}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** A halftone corner, top right, fading out toward the middle (.wp-card::before). */
function Halftone() {
  const id = useUid('wph');
  return (
    <View pointerEvents="none" style={styles.halftone}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`${id}p`} patternUnits="userSpaceOnUse" x="0" y="0" width="9" height="9">
            <Circle cx="4.5" cy="4.5" r="1.3" fill="#fff" fillOpacity={0.32} />
          </Pattern>
          {/* radial-gradient(ellipse at 100% 0%): farthest-corner, √2 × the box. */}
          <RadialGradient id={`${id}g`} cx="1" cy="0" r="1.414" fx="1" fy="0">
            <Stop offset="0" stopColor="#fff" stopOpacity={1} />
            <Stop offset="0.38" stopColor="#fff" stopOpacity={0.5} />
            <Stop offset="0.72" stopColor="#fff" stopOpacity={0} />
          </RadialGradient>
          <Mask id={`${id}m`}>
            <Rect width="100%" height="100%" fill={`url(#${id}g)`} />
          </Mask>
        </Defs>
        <G mask={`url(#${id}m)`}>
          <Rect width="100%" height="100%" fill={`url(#${id}p)`} />
        </G>
      </Svg>
    </View>
  );
}

/** The warm glow behind the gift box (.wp-art::before). */
function Glow() {
  const id = useUid('wpg');
  return (
    <Svg width={ART} height={ART} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
          <Stop offset="0.42" stopColor="#ffecf6" stopOpacity={0.28} />
          <Stop offset="0.7" stopColor="#ffecf6" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={ART / 2} cy={ART / 2} r={ART / 2 - 14} fill={`url(#${id})`} />
    </Svg>
  );
}

/** A ticket: a coloured back, the white card standing in it, the coloured pocket in front. */
function Ticket({ ticket, face }) {
  const id = useUid('wpt');
  const { Icon } = ticket;
  return (
    <View style={[styles.ticket, { backgroundColor: ticket.back[1] }]}>
      <Wash stops={[[0, ticket.back[0]], [1, ticket.back[1]]]} radius={16} />
      <View style={styles.ticketRim} pointerEvents="none" />
      <View style={[styles.ticketFace, { backgroundColor: face }]}>
        <View style={[styles.ticketIcon, { backgroundColor: ticket.tint }]}>
          <Icon size={18} weight="fill" color={ticket.tone} />
        </View>
        <Text style={styles.ticketTitle}>{ticket.title}</Text>
      </View>
      {/* The pocket: its top edge dips to a V, a soft shadow above it. */}
      <View style={styles.pocket} pointerEvents="none">
        <Svg width="100%" height="48" viewBox="0 0 100 48" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={id} x1="0" y1="4" x2="0" y2="48" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={ticket.pocket[0]} />
              <Stop offset="1" stopColor={ticket.pocket[1]} />
            </LinearGradient>
          </Defs>
          <Path d="M0 2.5L50 15.5L100 2.5V48H0Z" fill="#000" fillOpacity={0.07} />
          <Path d="M0 4L50 17L100 4V48H0Z" fill={`url(#${id})`} />
        </Svg>
        <Text style={styles.pocketText} numberOfLines={1}>{ticket.sub}</Text>
      </View>
    </View>
  );
}

export default function WelcomePopup({
  variant = 'visitor', name = '', onClose, onAction,
}) {
  const dark = useScheme() === 'dark';
  const { width: vw } = useWindowDimensions();
  const [shown, setShown] = useState(true);
  const done = useRef(false);

  const fade = useRef(new Animated.Value(0)).current; // the whole layer
  const pop = useRef(new Animated.Value(0)).current; // 0 → 1 open, 1 → 2 close
  const art = useRef(new Animated.Value(0)).current;
  const perks = useRef(new Animated.Value(0)).current;
  const closeBtn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      [fade, art, perks, closeBtn].forEach((v) => v.setValue(1));
      pop.setValue(1);
      return;
    }
    const ease = Easing.bezier(0.25, 0.9, 0.3, 1);
    const fadeIn = (v, ms, delay) => Animated.timing(v, {
      toValue: 1, duration: ms, delay, easing: Easing.out(Easing.ease), useNativeDriver: native,
    });
    Animated.parallel([
      fadeIn(fade, 220, 0),
      // wp-spring-in: 0.6 → 1.05 (55%) → 0.985 (80%) → 1, 0.52s.
      Animated.sequence([
        Animated.timing(pop, { toValue: 0.55, duration: 286, easing: ease, useNativeDriver: native }),
        Animated.timing(pop, { toValue: 0.8, duration: 130, easing: ease, useNativeDriver: native }),
        Animated.timing(pop, { toValue: 1, duration: 104, easing: ease, useNativeDriver: native }),
      ]),
      Animated.timing(art, {
        toValue: 1, duration: 600, delay: 80, easing: Easing.bezier(0.2, 1.2, 0.35, 1), useNativeDriver: native,
      }),
      fadeIn(perks, 400, 180),
      fadeIn(closeBtn, 400, 240),
    ]).start();
  }, [fade, pop, art, perks, closeBtn]);

  // Swell a touch, shrink away while the dim fades a beat later; then hand back.
  const finish = (then) => {
    if (done.current) return;
    done.current = true;
    const after = () => { setShown(false); (then || onClose)?.(); };
    if (reduceMotion) { after(); return; }
    const ease = Easing.bezier(0.4, 0, 0.2, 1);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.3, duration: 96, easing: ease, useNativeDriver: native }),
        Animated.timing(pop, { toValue: 2, duration: 224, easing: ease, useNativeDriver: native }),
      ]),
      Animated.timing(fade, {
        toValue: 0, duration: 260, delay: 80, easing: Easing.in(Easing.ease), useNativeDriver: native,
      }),
    ]).start();
    setTimeout(after, CLOSE_MS);
  };
  const close = () => finish(onClose);

  const isNew = variant === 'new';
  const first = String(name || '').trim().split(/\s+/)[0];
  const kicker = isNew ? (first ? `Welcome, ${first}!` : 'Welcome to E-MOORM!') : 'Welcome to E-MOORM';
  // Broken where the website's text-wrap: balance breaks them.
  const big = isNew ? 'Your account is ready' : 'Shop local,\nMindoro-made';

  // Dark mode reads the same pinks from the other end of the ramp, a step deeper.
  const card = dark ? [t.accent[300], t.accent[400], t.accent[500]] : [t.accent[600], t.accent[500], t.accent[400]];
  const face = dark ? '#fdf7fa' : '#fff';
  const stackW = Math.min(340, vw - 32);

  const scale = pop.interpolate({ inputRange: [0, 0.55, 0.8, 1, 1.3, 2], outputRange: [0.6, 1.05, 0.985, 1, 1.05, 0.6] });
  const opacity = pop.interpolate({ inputRange: [0, 0.55, 1, 1.3, 2], outputRange: [0, 1, 1, 1, 0] });

  return (
    <Modal
      visible={shown}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <Animated.View style={[styles.backdrop, { backgroundColor: dark ? 'rgba(0, 0, 0, 0.68)' : 'rgba(10, 14, 25, 0.6)', opacity: fade }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          overScrollMode="never"
          bounces={false}
        >
          <Pressable style={styles.outside} onPress={close} accessible={false}>
            <Animated.View
              accessibilityViewIsModal
              accessibilityLabel={`${kicker}. ${big.replace('\n', ' ')}`}
              style={[styles.stack, { width: stackW, opacity, transform: [{ scale }] }]}
            >
              <Pressable onPress={() => {}} accessible={false} style={styles.cardPress}>
                <View style={[styles.card, { backgroundColor: card[1] }]}>
                  <Wash stops={[[0, card[0]], [0.52, card[1]], [1, card[2]]]} radius={24} />
                  <Halftone />
                  <View style={styles.rim} pointerEvents="none" />

                  <Animated.View
                    pointerEvents="none"
                    style={[styles.art, {
                      opacity: art.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }),
                      transform: [
                        { translateY: art.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                        { scale: art.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
                      ],
                    }]}
                  >
                    <Glow />
                    <AuthScene name="signUp" size={ART} bare />
                    <SparkleIcon size={18} weight="fill" color="#fff" style={[styles.spark, { top: 44, left: 2 }]} />
                    <SparkleIcon size={13} weight="fill" color="#fde68a" style={[styles.spark, { top: 2, right: 2 }]} />
                    <SparkleIcon size={11} weight="fill" color="#fff" style={[styles.spark, { top: 62, right: -16, opacity: 0.85 }]} />
                  </Animated.View>

                  <Text accessibilityRole="header" style={styles.kicker}>{kicker}</Text>
                  <Text style={styles.big}>{big}</Text>

                  <View style={styles.tickets}>
                    {TICKETS.map((ticket) => <Ticket key={ticket.key} ticket={ticket} face={face} />)}
                    <View style={[styles.plus, { borderColor: card[1] }]} pointerEvents="none">
                      <PlusIcon size={16} weight="bold" color={card[0]} />
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => finish(onAction || onClose)}
                    style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
                  >
                    <Wash stops={[[0, '#10b981'], [1, '#047857']]} radius={14} />
                    <View style={styles.ctaRim} pointerEvents="none" />
                    <Text style={styles.ctaText}>{isNew ? 'Start shopping' : 'Create my account'}</Text>
                  </Pressable>
                </View>
              </Pressable>

              <Animated.View style={[styles.perks, { opacity: perks }]}>
                {PERKS.map(({ key, Icon, lines }, i) => (
                  <View key={key} style={[styles.perk, i > 0 && styles.perkLine]}>
                    <Icon size={22} weight="fill" color="#fff" />
                    <Text style={styles.perkText}>{`${lines[0]}\n${lines[1]}`.toUpperCase()}</Text>
                  </View>
                ))}
              </Animated.View>

              <Animated.View style={{ opacity: closeBtn }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  onPress={close}
                  style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
                >
                  <XIcon size={20} weight="bold" color="#fff" />
                </Pressable>
              </Animated.View>
            </Animated.View>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const WELCOME_DELAY_MS = 1200;

/**
 * Home's hook-up (web pages/Home.jsx): a signed-out visitor's welcome, once
 * per install, 1.2 s after Home has settled. Never on a visit the promotion
 * pop-up opens (it waits for another), and not while Home is out of sight.
 *
 *   ready      the banners have answered (or failed) this visit: only then
 *              is it known whether the promotion opens
 *   promotion  Home's promotion pop-up is showing (also holds back the
 *              new-account welcome, which waits for it)
 */
export function VisitorWelcome({ ready, promotion }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const focused = useIsFocused();
  const [open, setOpen] = useState(false);
  // A visit the promotion opened on stays the promotion's.
  const promoted = useRef(false);
  if (promotion) promoted.current = true;

  useEffect(() => {
    setPromotionShowing(promotion);
    return () => setPromotionShowing(false);
  }, [promotion]);

  const waits = Boolean(user) || !ready || promoted.current || !focused;
  useEffect(() => {
    if (waits) return undefined;
    let timer = 0;
    let live = true;
    welcomeReady.then(() => {
      if (!live || visitorWelcomeSeen()) return;
      timer = setTimeout(() => {
        markVisitorWelcomeSeen();
        setOpen(true);
      }, WELCOME_DELAY_MS);
    });
    return () => { live = false; clearTimeout(timer); };
  }, [waits]);

  // Gone the moment someone signs in.
  if (!open || user) return null;
  return (
    <WelcomePopup
      variant="visitor"
      onClose={() => setOpen(false)}
      onAction={() => { setOpen(false); router.push('/register'); }}
    />
  );
}

// Plain values only (no tokens): the colours that follow the mode are given inline.
const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  scroll: { flexGrow: 1 },
  outside: {
    flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 16,
  },
  // Room for the gift box above the card.
  stack: { paddingTop: 78, transformOrigin: '50% 55%' },
  cardPress: { cursor: 'auto' },
  card: {
    paddingTop: 84,
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderRadius: 24,
    alignItems: 'stretch',
    boxShadow: [
      { offsetX: 0, offsetY: 24, blurRadius: 60, color: 'rgba(80, 7, 36, 0.38)' },
      { offsetX: 0, offsetY: 4, blurRadius: 14, color: 'rgba(80, 7, 36, 0.18)' },
    ],
  },
  halftone: {
    position: 'absolute', top: 0, right: 0, width: '62%', height: '46%', borderTopRightRadius: 24, overflow: 'hidden',
  },
  // The soft white rim inside the edge.
  rim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.26)',
    boxShadow: [{ inset: true, offsetX: 0, offsetY: 2, blurRadius: 0, color: 'rgba(255, 255, 255, 0.42)' }],
  },
  art: {
    position: 'absolute', top: -84, left: '50%', width: ART, height: ART, marginLeft: -ART / 2,
  },
  spark: { position: 'absolute' },

  kicker: {
    fontSize: 14.5, lineHeight: 18.85, letterSpacing: 0.145, color: 'rgba(255, 255, 255, 0.94)', textAlign: 'center', ...font(600),
  },
  big: {
    marginTop: 4,
    marginBottom: 18,
    fontSize: 27,
    lineHeight: 30.24,
    letterSpacing: -0.27,
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(120, 10, 60, 0.25)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
    ...font(800),
  },

  tickets: { flexDirection: 'row', gap: 14, marginBottom: 18 },
  ticket: {
    flex: 1,
    minWidth: 0,
    height: 132,
    paddingTop: 8,
    paddingHorizontal: 8,
    borderRadius: 16,
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 16, color: 'rgba(80, 7, 36, 0.2)' }],
  },
  ticketRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 16,
    boxShadow: [{ inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255, 255, 255, 0.55)' }],
  },
  ticketFace: {
    alignItems: 'center',
    height: 104,
    paddingTop: 10,
    paddingHorizontal: 6,
    borderRadius: 11,
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0, 0, 0, 0.08)' }],
  },
  ticketIcon: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  // Narrow enough that both titles take two lines alike.
  ticketTitle: {
    maxWidth: 104, marginTop: 6, fontSize: 14, lineHeight: 16.1, color: '#1f2937', textAlign: 'center', ...font(800),
  },
  pocket: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 48,
    borderBottomLeftRadius: 16, borderBottomRightRadius: 16, overflow: 'hidden',
  },
  pocketText: {
    position: 'absolute', left: 6, right: 6, bottom: 9,
    fontSize: 11.5, lineHeight: 12.65, color: '#fff', textAlign: 'center', ...font(700),
  },
  plus: {
    position: 'absolute',
    top: 44,
    left: '50%',
    width: 28,
    height: 28,
    marginLeft: -14,
    borderRadius: 14,
    borderWidth: 2,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 3, blurRadius: 8, color: 'rgba(80, 7, 36, 0.25)' }],
  },

  cta: {
    height: 50,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 18, color: 'rgba(4, 80, 58, 0.32)' }],
  },
  ctaPressed: { transform: [{ translateY: 1 }], opacity: 0.96 },
  ctaRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    boxShadow: [{ inset: true, offsetX: 0, offsetY: 1, blurRadius: 0, color: 'rgba(255, 255, 255, 0.3)' }],
  },
  ctaText: { fontSize: 16, lineHeight: 20, letterSpacing: 0.16, color: '#fff', ...font(800) },

  // Three small promises under the card.
  perks: { flexDirection: 'row', marginTop: 18 },
  perk: {
    flex: 1, alignItems: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 4,
  },
  perkLine: { borderLeftWidth: 1, borderLeftColor: 'rgba(255, 255, 255, 0.32)' },
  perkText: {
    fontSize: 10.5, lineHeight: 13.125, letterSpacing: 0.63, color: '#fff', textAlign: 'center', ...font(700),
  },

  close: {
    alignSelf: 'center',
    width: 40,
    height: 40,
    marginTop: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: { backgroundColor: 'rgba(255, 255, 255, 0.18)' },
});
