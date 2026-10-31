import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { G, Path, Rect } from 'react-native-svg';
import { PrinterIcon, QrCodeIcon, XIcon } from '../../../lib/icons';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { resolveImg } from '../../../lib/media';
import { font, t, themed } from '../../../theme';
import { useReducedMotion } from '../SellerGuideArt';
import {
  logoHole, modulePath, qrMatrix, shopQrLabel, shopQrUrl,
} from './shopQrCode';

/*
 * The shop's QR, shown big on screen (Me → the QR icon by the shop's name;
 * web/src/components/seller/ShopQrPop.jsx), so a buyer can scan it with
 * their own phone.
 *
 * One motion, played forward to open and backward to close: everything is an
 * interpolation of ONE Animated.Value p (0 = closed, on the shop's logo;
 * 1 = open, in the middle), run with the same symmetric ease both ways on
 * the native driver.
 *   - The card's back is the logo itself: at p = 0 the card sits on the logo
 *     (measured with measureInWindow), scaled down to its size, turned 180°
 *     so its round logo face shows.
 *   - As p goes to 1 it travels to the middle, grows to full size and flips
 *     over (perspective 1200, rotateY 180° → 0), landing face up. Each face
 *     turns on its own and shows only on its half of the turn, so the flip
 *     looks the same on Android, iOS and the web export.
 *   - The page dims with it (0 → 58% black), and the contents fade and settle
 *     in over the last stretch (p 0.6 → 1).
 * Closing runs p back to 0 from wherever it is (the ×, the dim, Android's
 * back button). Reduced motion: a plain fade. The screen stays awake while
 * it shows.
 *
 * The code is drawn in whole dp per module, error correction H, white all
 * round, with the E-MOORM mark in the cleared middle (as the printed poster).
 */

const QUIET = 2; // modules of white inside the code; the card's padding adds more
const KEEP_AWAKE = 'shop-qr-pop';
const DURATION = 520;
const EASE = Easing.bezier(0.65, 0, 0.35, 1); // symmetric: forward and backward look alike
const FADE_MS = 180;
const BRAND = require('../../../../assets/brand-icon.png');

function QrCode({ matrix, m }) {
  const n = matrix.size;
  const N = n + QUIET * 2;
  const px = N * m;
  const hole = useMemo(() => logoHole(n), [n]);
  // On the web the edges are crisp; on phones each row reaches a hair into the next, so no seam shows.
  const d = useMemo(() => modulePath(matrix, hole, QUIET, Platform.OS === 'web' ? 0 : 0.04), [matrix, hole]);
  const b = Math.round(hole.k * 0.74 * m);
  const at = Math.round((QUIET + hole.from + hole.k / 2) * m - b / 2);
  return (
    <View style={{ width: px, height: px }}>
      <Svg width={px} height={px} viewBox={`0 0 ${N} ${N}`}>
        <Rect x="0" y="0" width={N} height={N} fill="#FFFFFF" />
        <Path d={d} fill={t.neutral[900]} {...(Platform.OS === 'web' ? { shapeRendering: 'crispEdges' } : null)} />
        {[[0, 0], [n - 7, 0], [0, n - 7]].map(([fx, fy]) => {
          const x = QUIET + fx;
          const y = QUIET + fy;
          return (
            <G key={`${fx}-${fy}`}>
              <Rect x={x} y={y} width="7" height="7" rx="1.9" fill={t.neutral[900]} />
              <Rect x={x + 1} y={y + 1} width="5" height="5" rx="1.2" fill="#FFFFFF" />
              <Rect x={x + 2} y={y + 2} width="3" height="3" rx="0.8" fill={t.neutral[900]} />
            </G>
          );
        })}
      </Svg>
      <Image source={BRAND} style={{ position: 'absolute', left: at, top: at, width: b, height: b }} resizeMode="contain" />
    </View>
  );
}

/**
 * The QR icon for Me's shop card, and the pop-up it opens.
 * store: { slug, name, logo }; originRef: the shop's logo on the card, where
 * the card comes from; onActive(bool): whether the card is out (the page then
 * hides its logo, since the card's back stands in for it).
 */
export default function ShopQrPop({ store, originRef, onActive }) {
  const router = useRouter();
  const still = useReducedMotion();
  const win = useWindowDimensions();
  const iconRef = useRef(null);
  const cardRef = useRef(null);
  const [shown, setShown] = useState(false);
  const [geo, setGeo] = useState(null);
  const closing = useRef(false);

  const slug = store?.slug;
  const name = store?.name || 'My shop';
  const logo = store?.logo ? resolveImg(store.logo) : null;
  const letter = name.trim().charAt(0).toUpperCase();
  const matrix = useMemo(() => (slug ? qrMatrix(shopQrUrl(slug)) : null), [slug]);

  // The card's width and the code's module size in whole dp for this screen.
  const cardW = Math.min(win.width > 768 ? 380 : 344, win.width - 32);
  const cells = (matrix?.size || 37) + QUIET * 2;
  const m = Math.max(3, Math.floor(Math.min(cardW - 40, win.height - 260) / cells));

  // p: the one progress everything follows. fade: the whole layer (reduced motion only).
  const p = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;

  const open = () => {
    if (shown) return;
    closing.current = false;
    p.setValue(0);
    fade.setValue(still ? 0 : 1);
    setGeo(null);
    setShown(true);
  };

  // Once the card is laid out (still hidden): where the logo is, as its start.
  const onCardLayout = () => {
    if (geo) return;
    const origin = originRef?.current || iconRef.current;
    const card = cardRef.current;
    if (!card || !origin) { setGeo({ flat: true }); return; }
    card.measureInWindow((cx, cy, cw, ch) => {
      origin.measureInWindow((ox, oy, ow, oh) => {
        if (!cw || !ow) { setGeo({ flat: true }); return; }
        setGeo({
          dx: ox + ow / 2 - (cx + cw / 2),
          dy: oy + oh / 2 - (cy + ch / 2),
          s0: ow / cw,
        });
      });
    });
  };

  const flat = still || geo?.flat;

  // Go: p from 0 to 1 (or a plain fade).
  useEffect(() => {
    if (!shown || !geo) return;
    if (flat) {
      p.setValue(1);
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      return;
    }
    onActive?.(true);
    Animated.timing(p, { toValue: 1, duration: DURATION, easing: EASE, useNativeDriver: true }).start();
  }, [shown, geo, flat, p, fade, onActive]);

  // Awake while it shows, so the screen does not dim while someone scans.
  useEffect(() => {
    if (!shown) return undefined;
    activateKeepAwakeAsync(KEEP_AWAKE).catch(() => {});
    return () => {
      try { deactivateKeepAwake(KEEP_AWAKE); } catch { /* not kept awake */ }
    };
  }, [shown]);

  const finish = () => {
    setShown(false);
    setGeo(null);
    onActive?.(false);
  };

  // The same motion backward, from wherever it is now (no jump if it is still opening).
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (flat || !geo) {
      Animated.timing(fade, { toValue: 0, duration: FADE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(finish);
      return;
    }
    p.stopAnimation((at) => {
      Animated.timing(p, {
        toValue: 0, duration: Math.max(1, Math.round(DURATION * at)), easing: EASE, useNativeDriver: true,
      }).start(finish);
    });
  };

  const toPoster = () => {
    p.stopAnimation();
    finish();
    router.push('/seller/shop-qr');
  };

  if (!slug) return null;

  // Everything below is p, interpolated.
  const go = geo && !flat;
  const lerp = (a, b) => p.interpolate({ inputRange: [0, 1], outputRange: [a, b] });
  const card = go ? {
    transform: [{ translateX: lerp(geo.dx, 0) }, { translateY: lerp(geo.dy, 0) }, { scale: lerp(geo.s0, 1) }],
  } : null;
  // Front: 180° → 0, seen from halfway; back (the logo): 0 → -180°, seen until halfway.
  const front = go ? {
    opacity: p.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] }),
    transform: [{ perspective: 1200 }, { rotateY: lerp('180deg', '0deg') }],
  } : null;
  const back = go ? {
    opacity: p.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] }),
    transform: [{ perspective: 1200 }, { rotateY: lerp('0deg', '-180deg') }],
  } : { opacity: 0 };
  const late = p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0, 1] });
  const rise = {
    opacity: late,
    transform: [{ translateY: p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [8, 8, 0] }) }],
  };
  const codeIn = {
    opacity: late,
    transform: [{ scale: p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.92, 0.92, 1] }) }],
  };

  return (
    <>
      <Pressable
        ref={iconRef}
        accessibilityRole="button"
        accessibilityLabel="Show shop QR"
        onPress={open}
        hitSlop={4}
        style={({ pressed }) => [styles.icon, pressed && styles.iconPressed]}
      >
        <QrCodeIcon size={22} weight="bold" color={t.neutral[800]} />
      </Pressable>

      <Modal
        visible={shown}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={close}
      >
        <Animated.View style={[styles.layer, { opacity: fade }]}>
          <Animated.View style={[styles.dim, { opacity: flat ? 1 : p }]} />
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
          <View style={styles.center}>
            <Animated.View
              ref={cardRef}
              onLayout={onCardLayout}
              accessibilityViewIsModal
              accessibilityLabel={`${name}: shop QR code`}
              style={[{ width: cardW, opacity: geo ? 1 : 0 }, card]}
            >
              <Animated.View style={[styles.front, front]}>
                <Animated.View style={[styles.head, rise]}>
                  <View style={styles.logo}>
                    {logo
                      ? <Image source={{ uri: logo }} style={styles.logoImg} />
                      : <Text style={styles.logoLetter}>{letter}</Text>}
                  </View>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    onPress={close}
                    hitSlop={6}
                    style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
                  >
                    <XIcon size={18} weight="bold" color={t.neutral[700]} />
                  </Pressable>
                </Animated.View>

                <Animated.View style={[styles.code, codeIn]}>
                  {matrix ? <QrCode matrix={matrix} m={m} /> : null}
                </Animated.View>

                <Animated.View style={[styles.foot, rise]}>
                  <Text style={styles.scan}>Scan to visit our shop</Text>
                  <Text style={styles.link} numberOfLines={1}>{shopQrLabel(slug)}</Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={toPoster}
                    style={({ pressed }) => [styles.poster, pressed && styles.posterPressed]}
                  >
                    <PrinterIcon size={15} weight="bold" color={t.primary[700]} />
                    <Text style={styles.posterText}>Open printable poster</Text>
                  </Pressable>
                </Animated.View>
              </Animated.View>

              {/* The back: the shop's logo, as wide as the card (scaled down, it is the logo on the page). */}
              <Animated.View style={[styles.back, back]}>
                <View style={[styles.backLogo, { width: cardW, height: cardW, borderRadius: cardW / 2 }]}>
                  {logo
                    ? <Image source={{ uri: logo }} style={styles.logoImg} />
                    : <Text style={[styles.backLetter, { fontSize: (cardW * 26) / 64, lineHeight: (cardW * 34) / 64 }]}>{letter}</Text>}
                </View>
              </Animated.View>
            </Animated.View>
          </View>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  // A quiet round 42px button in line with the shop's name.
  icon: {
    width: 42,
    height: 42,
    marginVertical: -7,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: t.neutral[200],
    backgroundColor: t.neutral[0],
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: { backgroundColor: t.neutral[100], transform: [{ scale: 0.94 }] },

  layer: { flex: 1 },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0, 0, 0, 0.58)' },
  center: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', pointerEvents: 'box-none',
  },

  front: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundcolor: t.onBrand,
    backfaceVisibility: 'hidden',
  },
  back: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    pointerEvents: 'none',
  },
  backLogo: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50] },
  backLetter: { ...font(500), color: t.primary[700] },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginBottom: 12 },
  logo: {
    width: 36, height: 36, borderRadius: 18, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50],
    borderWidth: 1, borderColor: 'rgba(17, 24, 39, 0.08)',
  },
  logoImg: { width: '100%', height: '100%' },
  logoLetter: { fontSize: 16, lineHeight: 22, ...font(500), color: t.primary[700] },
  name: { flex: 1, minWidth: 0, fontSize: 16.5, lineHeight: 22, ...font(500), color: t.neutral[900] },
  close: {
    width: 36, height: 36, borderRadius: 18, marginRight: -8, marginVertical: -4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  closePressed: { backgroundColor: t.neutral[200] },

  code: { backgroundcolor: t.onBrand },

  foot: { alignItems: 'center', alignSelf: 'stretch', marginTop: 6 },
  scan: { fontSize: 15, lineHeight: 22, ...font(500), color: t.neutral[900], textAlign: 'center' },
  link: { marginTop: 2, fontSize: 12.5, lineHeight: 18, ...font(400), color: t.neutral[500], textAlign: 'center' },
  poster: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12,
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999,
  },
  posterPressed: { backgroundColor: t.primary[50] },
  posterText: { fontSize: 13, lineHeight: 18, ...font(500), color: t.primary[700] },
}));
