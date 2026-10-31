import { useEffect, useId, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import {
  CaretRightIcon, ChatCircleDotsIcon, HeartIcon, LinkSimpleIcon, MegaphoneIcon, PaintBrushIcon, PaletteIcon,
  ShareNetworkIcon, SparkleIcon, UsersThreeIcon,
} from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { useReducedMotion } from '../SellerGuideArt';

/*
 * Home's tips (web SellerDashboard.jsx HomeTips + SellerApp.css .sh-banner*):
 * real things a seller can do, each one tap away, one full-colour card in
 * view at a time. Swipe or wait (6 s); the carousel only moves forward: a
 * copy of the first tip follows the last, and once the scroll rests on it
 * the track jumps back to the real first one. Each card is a little poster:
 * the colour, a ring, a soft blob and a dot pattern behind a big title, a
 * white pill button, and the main icon on a frosted tilted tile with two
 * small accents that pop in when the card comes into view.
 */

// --tone is the button's text; g1…g3 the card's gradient, light corner to deep.
const TONES = {
  pink: { tone: '#db2777', g: ['#fb7185', '#ec4899', '#a21caf'] },
  violet: { tone: '#7c3aed', g: ['#a78bfa', '#7c3aed', '#4338ca'] },
  blue: { tone: '#2563eb', g: ['#22d3ee', '#3b82f6', '#1e40af'] },
};

const AUTOPLAY_MS = 6000;
const SETTLE_MS = 140;

export default function HomeTips({ onShare }) {
  const router = useRouter();
  const slides = [
    { key: 'decorate', title: 'Decorate your shop', text: 'Pick a ready-made look in one tap.', cta: 'Choose a template', to: '/seller/decorate', Icon: PaintBrushIcon, accents: [PaletteIcon, SparkleIcon], tone: 'pink' },
    { key: 'announce', title: 'Tell your followers', text: 'Share news or promote a product.', cta: 'Open Marketing', to: '/seller/marketing', Icon: MegaphoneIcon, accents: [UsersThreeIcon, HeartIcon], tone: 'violet' },
    { key: 'share', title: 'Share your shop', text: 'Send your shop link to friends and groups.', cta: 'Share now', onPress: onShare, Icon: ShareNetworkIcon, accents: [LinkSimpleIcon, ChatCircleDotsIcon], tone: 'blue' },
  ];
  const count = slides.length;
  const track = [...slides, { ...slides[0], key: `${slides[0].key}-again`, copy: true }];

  const [width, setWidth] = useState(0);
  // The position in the track: 0…n-1 are the tips, n the copy of the first.
  const [pos, setPos] = useState(0);
  // Set while the copy hands over to the real first tip: no entrance replay.
  const [looped, setLooped] = useState(false);
  const scrollRef = useRef(null);
  const offset = useRef(0);
  const settle = useRef(null);
  const index = pos % count;

  const onScroll = (e) => {
    if (!width) return;
    const x = e.nativeEvent.contentOffset.x;
    offset.current = x;
    const now = Math.round(x / width);
    setPos(now);
    if (now !== 0) setLooped(false);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      if (Math.round(offset.current / width) >= count) {
        setLooped(true);
        setPos(0);
        offset.current = 0;
        scrollRef.current?.scrollTo({ x: 0, animated: false });
      }
    }, SETTLE_MS);
  };
  useEffect(() => () => clearTimeout(settle.current), []);

  useEffect(() => {
    if (!width) return undefined;
    const timer = setInterval(() => {
      const next = Math.min(Math.round(offset.current / width) + 1, count);
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
    }, AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [count, width]);

  const open = (slide) => {
    if (slide.to) router.push(slide.to);
    else slide.onPress?.();
  };

  return (
    <View style={styles.banners} accessibilityLabel="Tips">
      <View style={styles.trackWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width ? (
          // Rounded by its wrapper only: a corner radius on the scroll view itself
          // clips the cards to a stale, smaller box on iOS.
          <ScrollView showsVerticalScrollIndicator={false}
            key={width}
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            {track.map((slide, i) => (
              <Banner
                key={slide.key}
                slide={slide}
                width={width}
                active={i === pos}
                still={i === 0 && looped}
                onPress={() => open(slide)}
              />
            ))}
          </ScrollView>
        ) : <View style={styles.placeholder} />}
      </View>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {slides.map((slide, i) => <Dot key={slide.key} on={i === index} />)}
      </View>
    </View>
  );
}

// A dot grows into a short bar when its tip is in view (width 0.2 s).
function Dot({ on }) {
  const w = useRef(new Animated.Value(on ? 16 : 6)).current;
  useEffect(() => {
    Animated.timing(w, { toValue: on ? 16 : 6, duration: 200, useNativeDriver: false }).start();
  }, [on, w]);
  return <Animated.View style={[styles.dot, { width: w }, on && styles.dotOn]} />;
}

function Banner({ slide, width, active, still, onPress }) {
  const { title, text, cta, Icon, accents, tone, copy } = slide;
  const [AccentA, AccentB] = accents;
  const colors = TONES[tone] || TONES.pink;
  const id = `shb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const reduced = useReducedMotion();

  // The card in view: the tile settles in, then the accents pop in once.
  const tile = useRef(new Animated.Value(1)).current;
  const popA = useRef(new Animated.Value(1)).current;
  const popB = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active || still || reduced) return undefined;
    tile.setValue(0);
    popA.setValue(0);
    popB.setValue(0);
    const anim = Animated.parallel([
      Animated.timing(tile, { toValue: 1, duration: 600, easing: Easing.bezier(0.2, 0.9, 0.3, 1.2), useNativeDriver: true }),
      Animated.timing(popA, { toValue: 1, duration: 450, delay: 200, easing: Easing.bezier(0.2, 0.9, 0.3, 1.4), useNativeDriver: true }),
      Animated.timing(popB, { toValue: 1, duration: 450, delay: 320, easing: Easing.bezier(0.2, 0.9, 0.3, 1.4), useNativeDriver: true }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [active, still, reduced, tile, popA, popB]);

  const tileStyle = {
    opacity: tile.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [
      { rotate: tile.interpolate({ inputRange: [0, 1], outputRange: ['-20deg', '-8deg'] }) },
      { scale: tile.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
    ],
  };
  const popStyle = (v) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
  });

  // The dot pattern: 1.2px dots on a 9px grid, 54 × 30.
  const dots = [];
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 6; c += 1) dots.push(<Circle key={`${r}-${c}`} cx={4.5 + c * 9} cy={4.5 + r * 9} r={1.3} fill="#ffffff" opacity={0.35} />);
  }

  return (
    <Pressable
      accessibilityRole={slide.to ? 'link' : 'button'}
      accessibilityLabel={`${title}. ${text} ${cta}`}
      accessibilityElementsHidden={Boolean(copy)}
      importantForAccessibility={copy ? 'no-hide-descendants' : 'auto'}
      onPress={onPress}
      style={({ pressed }) => [styles.banner, { width }, pressed && styles.bannerPressed]}
    >
      {/* The card's colour: the gradient, a light corner at the top right. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.g[0]} />
            <Stop offset="0.48" stopColor={colors.g[1]} />
            <Stop offset="1" stopColor={colors.g[2]} />
          </LinearGradient>
          <RadialGradient id={`${id}-glow`} cx="1" cy="0" rx="1.2" ry="1.4" fx="1" fy="0" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
            <Stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-bg)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}-glow)`} />
      </Svg>

      {/* Behind everything: a ring, a soft blob and a dot pattern. */}
      <View pointerEvents="none" style={styles.ring} />
      <View pointerEvents="none" style={[styles.blob, { left: width * 0.38 }]} />
      <Svg pointerEvents="none" style={styles.dotsDeco} width={54} height={30}>{dots}</Svg>

      <View style={styles.text}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{text}</Text>
        <View style={styles.cta}>
          <Text style={[styles.ctaText, { color: colors.tone }]}>{cta}</Text>
          <CaretRightIcon size={12} weight="bold" color={colors.tone} />
        </View>
      </View>

      {/* The art: the icon on a frosted, tilted tile, two accents around it. */}
      <View style={styles.art} pointerEvents="none">
        <Animated.View style={[styles.tile, tileStyle]}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${id}-tile`} x1="0.2" y1="0" x2="0.8" y2="1">
                <Stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
                <Stop offset="1" stopColor="#ffffff" stopOpacity="0.12" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" rx="19" fill={`url(#${id}-tile)`} />
          </Svg>
          <View style={styles.tileIcon}><Icon size={34} weight="fill" color="#fff" /></View>
        </Animated.View>
        <Animated.View style={[styles.accent, styles.accentA, popStyle(popA)]}>
          <AccentA size={15} weight="fill" color={colors.tone} />
        </Animated.View>
        <Animated.View style={[styles.accent, styles.accentB, popStyle(popB)]}>
          <AccentB size={13} weight="fill" color={colors.tone} />
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  banners: { gap: 8 },
  trackWrap: { borderRadius: 16, overflow: 'hidden' },
  placeholder: { minHeight: 132 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 132,
    paddingTop: 16,
    paddingRight: 14,
    paddingBottom: 16,
    paddingLeft: 18,
    overflow: 'hidden',
    borderRadius: 16,
  },
  bannerPressed: { transform: [{ scale: 0.985 }] },
  ring: {
    position: 'absolute', top: -46, right: -40, width: 168, height: 168, borderRadius: 84, borderWidth: 18, borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  blob: {
    position: 'absolute',
    bottom: -58,
    width: 120,
    height: 120,
    borderTopLeftRadius: 58,
    borderTopRightRadius: 62,
    borderBottomRightRadius: 70,
    borderBottomLeftRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  dotsDeco: { position: 'absolute', right: 96, bottom: 12, opacity: 0.8 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { marginBottom: 2, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: t.onBrand, ...font(600) },
  sub: { fontSize: 13, lineHeight: 18.2, color: 'rgba(255, 255, 255, 0.9)', ...font(400) },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginTop: 10,
    paddingTop: 6,
    paddingRight: 11,
    paddingBottom: 6,
    paddingLeft: 13,
    borderRadius: 999,
    backgroundColor: t.neutral[0],
  },
  ctaText: { fontSize: 12.5, lineHeight: 20, ...font(600) },
  art: { flexShrink: 0, width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  tile: {
    width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.45)', borderRadius: 20, overflow: 'hidden',
  },
  // The icon stays upright on the tilted tile.
  tileIcon: { transform: [{ rotate: '8deg' }] },
  accent: { position: 'absolute', alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[0] },
  accentA: { top: 2, right: 2, width: 28, height: 28, borderRadius: 14 },
  accentB: { bottom: 6, left: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.92)' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { height: 6, borderRadius: 999, backgroundColor: t.neutral[300] },
  dotOn: { backgroundColor: t.primary[600] },
}));
