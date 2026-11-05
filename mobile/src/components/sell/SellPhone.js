import { useId, useMemo } from 'react';
import {
  Animated, Easing, Image, StyleSheet, Text, View,
} from 'react-native';
import { Image as Photo } from 'expo-image';
import Svg, {
  Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import {
  ChatCircleDotsIcon, ClipboardTextIcon, HouseIcon, PackageIcon, UserIcon,
} from '../../lib/icons';
import stopPaint from '../../lib/stopPaint';
import { font } from '../../theme';
import WhiteMark from './WhiteMark';
import { frames, useLoop } from './motion';

/*
 * The phones of web/src/pages/Sell.jsx + Sell.css (phone width):
 *
 *   HeroPhone  the Seller Center on a recent iPhone Pro, turned in space as
 *              a product shot and still; a new order drops in as a solid
 *              white iOS banner now and then (.sl-iphone, .sl-toast).
 *   StepShot   the top of a phone showing a step's screen, fading out at
 *              its foot where the step's number sits (.sl-shot).
 *
 * The phones are pictures of the seller app, so they keep their own light
 * colours in dark mode, as a screenshot would.
 */

const INK = '#111827';
const MUTED = '#4b5563';
const PRODUCE = 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=320&q=70';
// The produce photo is 320 x 484.
const PRODUCE_RATIO = 484 / 320;

/**
 * A CSS linear-gradient(<angle>deg, …) over a w x h box (absolute fill):
 * the gradient line through the centre at that angle, as long as CSS makes
 * it, so the stops land where the browser puts them.
 * stops: [[offset, colour, opacity?], …].
 */
export function CssGradient({
  width, height, angle, stops, radius = 0,
}) {
  const id = `cg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient
            id={id}
            gradientUnits="userSpaceOnUse"
            x1={cx - dx * half}
            y1={cy - dy * half}
            x2={cx + dx * half}
            y2={cy + dy * half}
          >
            {stops.map(([offset, color, opacity = 1]) => (
              <Stop key={`${offset}${color}${opacity}`} offset={String(offset)} {...stopPaint(color, opacity)} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/* iOS's status bar glyphs: signal, Wi-Fi, battery. */
function StatusGlyphs({ scale = 1 }) {
  return (
    <View style={[styles.glyphs, scale !== 1 && { transform: [{ scale }] }]}>
      <Svg viewBox="0 0 18 12" width={17} height={11} fill="#000">
        <Rect x="0" y="8" width="3" height="4" rx="1" />
        <Rect x="5" y="5.5" width="3" height="6.5" rx="1" />
        <Rect x="10" y="3" width="3" height="9" rx="1" />
        <Rect x="15" y="0" width="3" height="12" rx="1" />
      </Svg>
      <Svg viewBox="0 0 16 12" width={15} height={11} fill="#000">
        <Path d="M8 11.6 5.6 9.1a3.4 3.4 0 0 1 4.8 0Z" />
        <Path d="M8 4.6c1.9 0 3.6.7 4.9 2l-1.4 1.5a4.9 4.9 0 0 0-7 0L3.1 6.6A6.9 6.9 0 0 1 8 4.6Z" />
        <Path d="M8 0c3.2 0 6.1 1.3 8 3.3l-1.4 1.5A9 9 0 0 0 8 2 9 9 0 0 0 1.4 4.8L0 3.3A11 11 0 0 1 8 0Z" />
      </Svg>
      <Svg viewBox="0 0 27 12" width={25} height={11} fill="#000">
        <Rect x="0.5" y="0.5" width="22" height="11" rx="3.4" fill="none" stroke="#000" strokeOpacity={0.4} />
        <Rect x="2" y="2" width="15.5" height="8" rx="2" />
        <Path d="M24 4v4a2 2 0 0 0 0-4Z" opacity={0.45} />
      </Svg>
    </View>
  );
}

/* The status bar: the time centred left of the island, the glyphs right of it. */
function StatusRow({ small }) {
  return (
    <View style={[styles.status, small && styles.statusSmall]}>
      <View style={styles.statusCell}>
        <Text style={[styles.statusTime, small && styles.statusTimeSmall]}>9:41</Text>
      </View>
      <View style={{ width: small ? 62 : 92 }} />
      <View style={styles.statusCell}><StatusGlyphs scale={small ? 0.74 : 1} /></View>
    </View>
  );
}

/* The Dynamic Island, the front camera a dark lens at its right end. */
function Island({ small }) {
  const id = `il${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const lens = small ? 10 : 11;
  return (
    <View style={[styles.island, small && styles.islandSmall]}>
      <View style={[styles.lens, small && styles.lensSmall]}>
        <Svg width={lens} height={lens}>
          <Defs>
            <RadialGradient id={id} cx="40%" cy="40%" r="50%">
              <Stop offset="0" stopColor="#2c3a5a" />
              <Stop offset="0.6" stopColor="#0b0f1a" />
              <Stop offset="1" stopColor="#000000" />
            </RadialGradient>
          </Defs>
          <Circle cx={lens / 2} cy={lens / 2} r={lens / 2} fill={`url(#${id})`} />
        </Svg>
      </View>
    </View>
  );
}

const ROWS = [['Biko', '2 bilao', [0, 0.4]], ['Suman sa ibos', '10 pcs', [0.6, 0.7]], ['Kalamay', '3 jars', [0.9, 0.2]], ['Turon', '12 pcs', [0.3, 0.9]]];
const BARS = [38, 55, 42, 70, 58, 86, 100];
const TABS = [[HouseIcon, 'Home', true], [PackageIcon, 'Products'], [ClipboardTextIcon, 'Orders'], [ChatCircleDotsIcon, 'Chat'], [UserIcon, 'Me']];

/* background-size: 260%, background-position: x% y% on a 38px square. */
function Thumb({ pos: [px, py] }) {
  const w = 38 * 2.6;
  const h = w * PRODUCE_RATIO;
  return (
    <View style={styles.thumb}>
      <Photo
        source={{ uri: PRODUCE }}
        style={{
          position: 'absolute', width: w, height: h, left: (38 - w) * px, top: (38 - h) * py,
        }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    </View>
  );
}

// The banner's height (10 + 34 + 10): it starts 130% of that above its place.
const TOAST_H = 54;
// cubic-bezier(0.22, 1, 0.36, 1), the banner's curve.
const TOAST_EASE = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * The hero's phone, drawn at the website's 300 x 626 and shown at 0.8 of
 * that, tilted from its top centre (perspective 1800, rotateY -24deg,
 * rotateX 7deg, rotateZ 6deg). Lays out 626 * 0.8 tall, as the website
 * gives back the space the scaling saves. green / pinkSoft: the page's.
 */
export function HeroPhone({
  green, pinkSoft, running = true, still = false,
}) {
  // .sl-toast: 6s, cubic-bezier(0.22, 1, 0.36, 1), after 1.2s, fill both.
  const clock = useLoop(6000, { delay: 1200, running, still });
  const toastStyle = useMemo(() => {
    if (!clock) return null;
    const opts = { easing: TOAST_EASE };
    return {
      opacity: frames(clock, [[0, 0], [0.09, 1], [0.72, 1], [0.84, 0], [1, 0]], opts),
      transform: [
        { translateY: frames(clock, [[0, -1.3 * TOAST_H], [0.09, 0], [0.72, 0], [0.84, -1.3 * TOAST_H], [1, -1.3 * TOAST_H]], opts) },
        { scale: frames(clock, [[0, 0.96], [0.09, 1], [0.72, 1], [0.84, 0.96], [1, 0.96]], opts) },
      ],
    };
  }, [clock]);

  return (
    <View style={styles.heroPhoneSpace}>
      <View style={styles.iphone}>
        {/* The frame's thickness on the edge that faces you, then its shadow. */}
        <View style={[styles.slab, styles.slabShadow, { left: 11, top: 2, backgroundColor: '#18191a' }]} />
        <View style={[styles.slab, { left: 8, top: 2, backgroundColor: '#212224' }]} />
        <View style={[styles.slab, { left: 4, top: 1, backgroundColor: '#333438' }]} />
        <View style={[styles.slab, { left: 2, top: 0, backgroundColor: '#3e4045' }]} />
        {/* Graphite titanium, brushed. */}
        <View style={styles.band}>
          <CssGradient
            width={300}
            height={626}
            radius={58}
            angle={135}
            stops={[[0, '#6d7076'], [0.18, '#2a2b2f'], [0.34, '#7c7f85'], [0.52, '#303135'], [0.7, '#5f6268'], [0.86, '#26272a'], [1, '#575a60']]}
          />
          <View style={styles.bandEdge} />
          <View style={styles.bezel}>
            <View style={styles.screen}>
              <View style={styles.appTop}>
                <Image source={require('../../../assets/brand-icon.png')} style={styles.appLogo} resizeMode="contain" />
                <Text style={[styles.appTopText, { color: green }]}>Seller Center</Text>
              </View>
              <Text style={styles.appHi}>Good morning, Ana</Text>
              <View style={[styles.today, { backgroundColor: green }]}>
                <View style={styles.todayText}>
                  <Text style={styles.todayLabel}>Earned today</Text>
                  <Text style={styles.todayAmount}>₱1,240</Text>
                </View>
                <View style={styles.bars}>
                  {BARS.map((h, i) => (
                    <View
                      key={i}
                      style={[styles.bar, { height: (40 * h) / 100 }, i === BARS.length - 1 && { backgroundColor: pinkSoft }]}
                    />
                  ))}
                </View>
              </View>
              <Text style={styles.appSection}>TO PACK</Text>
              {ROWS.map(([name, qty, pos]) => (
                <View key={name} style={styles.appRow}>
                  <Thumb pos={pos} />
                  <View style={styles.appName}>
                    <Text style={styles.appNameText}>{name}</Text>
                    <Text style={styles.appQty}>{qty}</Text>
                  </View>
                  <View style={styles.pack}><Text style={[styles.packText, { color: green }]}>Pack</Text></View>
                </View>
              ))}

              {/* The Seller Center's tab bar, above the home indicator. */}
              <View style={styles.tabs}>
                {TABS.map(([Icon, label, on]) => (
                  <View key={label} style={styles.tab}>
                    <Icon size={20} weight={on ? 'fill' : 'regular'} color={on ? green : '#8a9099'} />
                    <Text style={[styles.tabText, on && { color: green }]}>{label}</Text>
                  </View>
                ))}
              </View>

              <StatusRow />
              <Island />
              <Animated.View style={[styles.toast, toastStyle]}>
                <View style={[styles.toastIcon, { backgroundColor: green }]}><WhiteMark size={22} /></View>
                <View style={styles.toastText}>
                  <View style={styles.toastHead}>
                    <Text style={styles.toastApp}>EMOORM</Text>
                    <Text style={styles.toastNow}>now</Text>
                  </View>
                  <Text style={styles.toastLine} numberOfLines={1}>
                    <Text style={[styles.toastStrong, { color: green }]}>New order</Text>
                    {' · Bibingka × 4 · ₱240'}
                  </Text>
                </View>
              </Animated.View>
              <View style={styles.homeBar} />
              {/* Light on the glass. */}
              <CssGradient
                width={282}
                height={608}
                radius={49}
                angle={118}
                stops={[[0, '#ffffff', 0.22], [0.3, '#ffffff', 0.04], [0.45, '#ffffff', 0]]}
              />
            </View>
          </View>
        </View>
        {/* The side button and Camera Control, on the edge that faces you. */}
        <View style={[styles.sideBtn, { top: 196, height: 86 }]}>
          <CssGradient width={3} height={86} angle={90} stops={[[0, '#2c2d31'], [0.5, '#7d8086'], [1, '#3a3c40']]} />
        </View>
        <View style={[styles.sideBtn, { top: 360, height: 46 }]}>
          <CssGradient width={3} height={46} angle={90} stops={[[0, '#1c1d20'], [1, '#4d5056']]} />
        </View>
      </View>
    </View>
  );
}

/**
 * A step's screen (web/public/tutorial/*.webp, from the site) on the top of
 * a phone, fading out at its foot into the section's grey. width: the
 * step's; tint: the disc behind the phone; fade: the section's colour.
 */
export function StepShot({
  uri, width, tint, fade,
}) {
  const screenW = 214 - 12;
  return (
    <View style={[styles.shot, { width }]}>
      <View style={[styles.disc, { left: width / 2 - 110, backgroundColor: tint }]} />
      <View style={styles.shotPhone}>
        <CssGradient width={214} height={489} radius={42} angle={160} stops={[[0, '#4a4a50'], [0.45, '#1d1d21'], [1, '#2c2c31']]} />
        <View style={styles.shotScreen}>
          <Photo
            source={{ uri }}
            style={{ width: screenW, height: (screenW * 1558) / 720 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
          />
          <StatusRow small />
          <Island small />
        </View>
      </View>
      {/* mask-image: linear-gradient(#000 58%, transparent 96%), as a fade
          into the grey behind it. */}
      <CssGradient width={width} height={270} angle={180} stops={[[0.58, fade, 0], [0.96, fade, 1], [1, fade, 1]]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glyphs: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  status: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 50, paddingTop: 4, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center',
  },
  statusSmall: { height: 40, paddingTop: 2 },
  statusCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusTime: {
    fontSize: 15, lineHeight: 20, letterSpacing: -0.15, color: '#000', ...font(600),
  },
  statusTimeSmall: { fontSize: 13, lineHeight: 18, letterSpacing: -0.13 },
  island: {
    position: 'absolute', top: 11, left: '50%', marginLeft: -46, width: 92, height: 28, borderRadius: 20, backgroundColor: '#000',
  },
  islandSmall: {
    top: 9, marginLeft: -31, width: 62, height: 22,
  },
  lens: { position: 'absolute', top: 9, right: 11 },
  lensSmall: { top: 6, right: 8 },

  // ── the hero's phone ──
  // 626 tall drawn at 0.8: the space it takes.
  heroPhoneSpace: { height: 626 * 0.8, alignItems: 'center' },
  iphone: {
    width: 300,
    height: 626,
    transformOrigin: [150, 0, 0],
    transform: [{ perspective: 1800 }, { rotateY: '-24deg' }, { rotateX: '7deg' }, { rotateZ: '6deg' }, { scale: 0.8 }],
  },
  slab: {
    position: 'absolute', width: 300, height: 626, borderRadius: 58,
  },
  slabShadow: {
    boxShadow: [
      {
        offsetX: 40, offsetY: 50, blurRadius: 70, spreadDistance: -16, color: 'rgba(0, 0, 0, 0.5)',
      },
      {
        offsetX: 80, offsetY: 100, blurRadius: 140, spreadDistance: -40, color: 'rgba(0, 0, 0, 0.4)',
      },
    ],
  },
  band: {
    width: 300, height: 626, padding: 3, borderRadius: 58,
  },
  bandEdge: {
    ...StyleSheet.absoluteFillObject, borderRadius: 58, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  bezel: {
    flex: 1, padding: 6, borderRadius: 55, backgroundColor: '#050506', borderWidth: 1, borderColor: '#1d1d1f',
  },
  screen: {
    flex: 1,
    margin: -1,
    overflow: 'hidden',
    paddingTop: 56,
    paddingHorizontal: 15,
    borderRadius: 49,
    backgroundColor: '#f4f5f7',
  },
  sideBtn: {
    position: 'absolute', left: 310, width: 3, borderTopRightRadius: 3, borderBottomRightRadius: 3, overflow: 'hidden',
  },

  appTop: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 14,
  },
  appLogo: { width: 20, height: 20 },
  appTopText: { fontSize: 13, lineHeight: 20.8, ...font(700) },
  appHi: {
    marginBottom: 12, fontSize: 19, lineHeight: 30.4, letterSpacing: -0.38, color: INK, ...font(700),
  },
  today: {
    flexDirection: 'row', alignItems: 'flex-end', marginBottom: 18, padding: 14, borderRadius: 16,
  },
  todayText: { flex: 1 },
  todayLabel: {
    fontSize: 11.5, lineHeight: 18.4, color: '#fff', opacity: 0.8, ...font(400),
  },
  todayAmount: {
    fontSize: 26, lineHeight: 41.6, letterSpacing: -0.52, color: '#fff', ...font(700),
  },
  bars: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 40,
  },
  bar: { width: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.55)' },
  appSection: {
    marginBottom: 8, fontSize: 11.5, lineHeight: 18.4, letterSpacing: 0.46, color: MUTED, ...font(600),
  },
  appRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, padding: 9, borderRadius: 14, backgroundColor: '#fff',
  },
  thumb: {
    width: 38, height: 38, borderRadius: 10, overflow: 'hidden',
  },
  appName: { flex: 1 },
  appNameText: {
    fontSize: 13, lineHeight: 20.8, color: INK, ...font(600),
  },
  appQty: {
    fontSize: 11.5, lineHeight: 18.4, color: MUTED, ...font(400),
  },
  pack: {
    paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: '#ecfdf5',
  },
  packText: { fontSize: 11.5, lineHeight: 18.4, ...font(700) },
  tabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    paddingHorizontal: 6,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
  },
  tab: { alignItems: 'center', gap: 2 },
  tabText: {
    fontSize: 9.5, lineHeight: 15.2, color: '#8a9099', ...font(500),
  },
  toast: {
    position: 'absolute',
    top: 50,
    left: 8,
    right: 8,
    height: TOAST_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: '#fff',
    boxShadow: [
      {
        offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: 'rgba(15, 23, 42, 0.06)',
      },
      {
        offsetX: 0, offsetY: 12, blurRadius: 30, color: 'rgba(15, 23, 42, 0.22)',
      },
    ],
  },
  toastIcon: {
    width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  toastText: { flex: 1, minWidth: 0 },
  toastHead: { flexDirection: 'row', justifyContent: 'space-between' },
  toastApp: {
    fontSize: 11, lineHeight: 14.85, letterSpacing: 0.22, color: INK, ...font(600),
  },
  toastNow: {
    fontSize: 11, lineHeight: 14.85, color: MUTED, ...font(400),
  },
  toastLine: {
    fontSize: 12.5, lineHeight: 16.9, color: INK, ...font(400),
  },
  toastStrong: { ...font(700) },
  homeBar: {
    position: 'absolute', bottom: 8, left: '50%', marginLeft: -56, width: 112, height: 5, borderRadius: 3, backgroundColor: '#111',
  },

  // ── a step's phone ──
  shot: { height: 270, overflow: 'hidden' },
  disc: {
    position: 'absolute', top: 34, width: 220, height: 220, borderRadius: 110,
  },
  shotPhone: {
    alignSelf: 'center',
    width: 214,
    height: 489,
    marginTop: 6,
    padding: 6,
    borderRadius: 42,
    boxShadow: [
      {
        offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 1, color: 'rgba(0, 0, 0, 0.2)',
      },
      {
        offsetX: 0, offsetY: 24, blurRadius: 40, spreadDistance: -18, color: 'rgba(15, 23, 42, 0.45)',
      },
    ],
  },
  shotScreen: {
    flex: 1, overflow: 'hidden', paddingTop: 40, borderRadius: 36, backgroundColor: '#fff',
  },
});
