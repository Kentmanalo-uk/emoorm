import { useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet } from 'react-native';
import { create } from 'zustand';
import { t, themed } from '../theme';

/*
 * The product photo's flight from a product card to the product page.
 * Tapping a card lifts its photo off the card (launchHero) and the product
 * page fades in under it; the photo grows from where it was on the card to
 * where the page's gallery shows it, then melts into the gallery once that
 * has its picture (heroImageReady). The app root renders <HeroFlightHost />
 * over every screen. Reduce Motion: no flight (the page opens as usual).
 *
 * Smoothness: the whole flight runs on the native driver (transforms and
 * opacity only), so it keeps 60fps while JavaScript builds the product page.
 * The frame is laid out at the gallery's size and scaled down to the card;
 * the photo inside is counter-scaled so it always fills the frame at its own
 * shape (cover), re-cropping from the card's square to the gallery's 5:6.
 */

const FLY_MS = 380;
const FADE_MS = 140;
// The flight waits this long for the page's own picture after landing (the
// page may still be loading: the photo holds its place until it shows).
const WAIT_IMAGE_MS = 3000;
// The path is worked out at this many points (piecewise linear in between).
const STEPS = 24;
const EASE = Easing.bezier(0.2, 0.8, 0.2, 1);

/** The product page's top bar (app/product/[slug] HEAD_H); the gallery starts under it. */
export const PRODUCT_HEAD_H = 56;
/** Where the product page shows its first photo: full width, 5:6, under the top bar. */
export const productGalleryBox = (insets, width) => ({
  x: 0, y: (insets?.top || 0) + PRODUCT_HEAD_H, width, height: Math.round((width * 6) / 5),
});

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotion = Boolean(v); }).catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v) => { reduceMotion = Boolean(v); });

const useHeroFlight = create(() => ({ flight: null }));

/** Whether a card's tap should fly its photo (false: open the page as usual). */
export const canFlyHero = () => !reduceMotion;

/**
 * A card's photo leaves: slug, uri, from / to = { x, y, width, height } in
 * window coordinates, aspect = the photo's own width / height (if known).
 */
export function launchHero({ slug, uri, from, to, aspect }) {
  if (reduceMotion || !uri || !from?.width || !from?.height || !to?.width) return false;
  useHeroFlight.setState({ flight: { id: `${slug}:${Date.now()}`, slug, uri, from, to, aspect, ready: false } });
  return true;
}

/** The page's first gallery picture is on screen. */
export function heroImageReady(slug) {
  const { flight } = useHeroFlight.getState();
  if (!flight || flight.slug !== slug || flight.ready) return;
  useHeroFlight.setState({ flight: { ...flight, ready: true } });
}

const endHero = (id) => {
  if (useHeroFlight.getState().flight?.id === id) useHeroFlight.setState({ flight: null });
};

export function HeroFlightHost() {
  const flight = useHeroFlight((s) => s.flight);
  if (!flight) return null;
  return <Flight key={flight.id} flight={flight} />;
}

/**
 * The flight's path, sampled: for each step, the frame's centre offset and
 * scale (against the gallery's box) and the photo's counter-scale inside it.
 */
function flightPath(from, to, aspect) {
  const W = to.width;
  const H = to.height;
  // The photo's own box: its shape, covering the gallery (as resizeMode cover).
  const a = aspect > 0 ? aspect : W / H;
  const bw = a > W / H ? H * a : W;
  const bh = a > W / H ? H : W / a;
  const input = [];
  const out = { tx: [], ty: [], sx: [], sy: [], ix: [], iy: [] };
  const fcx = from.x + from.width / 2;
  const fcy = from.y + from.height / 2;
  const tcx = to.x + W / 2;
  const tcy = to.y + H / 2;
  for (let i = 0; i <= STEPS; i += 1) {
    const p = i / STEPS;
    const fw = from.width + (W - from.width) * p;
    const fh = from.height + (H - from.height) * p;
    const sx = fw / W;
    const sy = fh / H;
    // The photo covers the frame: its scale is the larger of the two fits.
    const k = Math.max(fw / bw, fh / bh);
    input.push(p);
    out.tx.push(fcx + (tcx - fcx) * p - tcx);
    out.ty.push(fcy + (tcy - fcy) * p - tcy);
    out.sx.push(sx);
    out.sy.push(sy);
    out.ix.push(k / sx);
    out.iy.push(k / sy);
  }
  return { input, out, bw, bh };
}

function Flight({ flight }) {
  const { id, uri, from, to, aspect, ready } = flight;
  // 0 at the card, 1 at the gallery (eased by the timing).
  const p = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const landed = useRef(false);
  const fading = useRef(false);
  const imageTimer = useRef(null);
  const path = useRef(flightPath(from, to, aspect)).current;

  const melt = () => {
    if (fading.current) return;
    fading.current = true;
    clearTimeout(imageTimer.current);
    Animated.timing(fade, { toValue: 0, duration: FADE_MS, easing: Easing.out(Easing.ease), useNativeDriver: true })
      .start(() => endHero(id));
  };

  // Started as soon as the photo is on screen, before the page is built.
  useLayoutEffect(() => {
    const anim = Animated.timing(p, { toValue: 1, duration: FLY_MS, easing: EASE, useNativeDriver: true });
    anim.start(({ finished }) => {
      if (!finished) return;
      landed.current = true;
      // The gallery shows its own picture: hand over. Otherwise wait a moment.
      if (useHeroFlight.getState().flight?.ready) melt();
      else imageTimer.current = setTimeout(melt, WAIT_IMAGE_MS);
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && landed.current) melt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => () => clearTimeout(imageTimer.current), []);

  const at = (key) => p.interpolate({ inputRange: path.input, outputRange: path.out[key] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.frame, {
        left: to.x,
        top: to.y,
        width: to.width,
        height: to.height,
        opacity: fade,
        transform: [{ translateX: at('tx') }, { translateY: at('ty') }, { scaleX: at('sx') }, { scaleY: at('sy') }],
      }]}
    >
      <Animated.View
        style={{
          position: 'absolute',
          left: (to.width - path.bw) / 2,
          top: (to.height - path.bh) / 2,
          width: path.bw,
          height: path.bh,
          transform: [{ scaleX: at('ix') }, { scaleY: at('iy') }],
        }}
      >
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" fadeDuration={0} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  frame: { position: 'absolute', overflow: 'hidden', backgroundColor: t.neutral[100], zIndex: 9999, elevation: 9999 },
}));
