import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, BackHandler, Easing, Image, Linking, PanResponder, Platform, Pressable, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CaretLeftIcon, CaretRightIcon, XIcon } from 'phosphor-react-native';
import { appPath } from '../../lib/notificationLink';
import { t } from '../../theme';

/*
 * Home's banner block on phones (web/src/pages/Home.jsx + Home.css):
 * the carousel (16:9, edge to edge, round arrows and slim dots, a new slide
 * every 5s), the two side banners as a 2-up row under it, and the
 * once-per-visit promotion popup.
 */

export const FALLBACK_BANNERS = [
  { id: 'fallback-1', image: require('../../../assets/banners/banner-qoute.png'), linkUrl: null, title: 'Emoorm' },
  { id: 'fallback-2', image: require('../../../assets/banners/buy-now-qoute.png'), linkUrl: null, title: 'Buy now' },
  { id: 'fallback-3', image: require('../../../assets/banners/discover-mindoro.png'), linkUrl: null, title: 'Discover Mindoro' },
];

const SLIDE_MS = 600;
const AUTO_MS = 5000;
const slideEasing = Easing.bezier(0.4, 0, 0.2, 1);

const source = (banner) => (banner.image ? banner.image : { uri: banner.imageUrl });

/** Opens a banner's link: outside links in the browser, our paths in the app. */
export function useOpenBannerLink() {
  const router = useRouter();
  return (linkUrl) => {
    if (!linkUrl) return;
    if (/^https?:/i.test(linkUrl)) Linking.openURL(linkUrl).catch(() => {});
    else router.push(appPath(linkUrl) || linkUrl);
  };
}

export function BannerCarousel({ banners }) {
  const { width } = useWindowDimensions();
  const height = (width * 9) / 16;
  const openLink = useOpenBannerLink();
  const count = banners.length;
  // [last, ...slides, first]: the clones let it run on in a loop.
  const slides = count > 0 ? [banners[count - 1], ...banners, banners[0]] : [];
  const [index, setIndex] = useState(1);
  const [moving, setMoving] = useState(false);
  const x = useRef(new Animated.Value(-width)).current;
  const indexRef = useRef(1);
  const movingRef = useRef(false);

  // Restart from the first real slide whenever the banner set changes.
  useEffect(() => {
    indexRef.current = 1;
    setIndex(1);
    movingRef.current = false;
    setMoving(false);
    x.setValue(-width);
  }, [count, width, x]);

  const goTo = (next) => {
    if (movingRef.current || count < 1) return;
    movingRef.current = true;
    setMoving(true);
    indexRef.current = next;
    setIndex(next);
    Animated.timing(x, { toValue: -next * width, duration: SLIDE_MS, easing: slideEasing, useNativeDriver: true }).start(() => {
      // On a clone: jump to the real slide without animating.
      let real = next;
      if (next === 0) real = count;
      else if (next === count + 1) real = 1;
      if (real !== next) {
        x.setValue(-real * width);
        indexRef.current = real;
        setIndex(real);
      }
      movingRef.current = false;
      setMoving(false);
    });
  };
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  // Auto-advance, restarted by every slide change.
  useEffect(() => {
    if (count <= 1 || moving) return undefined;
    const timer = setTimeout(() => goToRef.current(indexRef.current + 1), AUTO_MS);
    return () => clearTimeout(timer);
  }, [count, index, moving]);

  // A sideways swipe moves a slide (the page still scrolls up and down).
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => !movingRef.current && Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => x.setValue(-indexRef.current * width + g.dx),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -40 || g.vx < -0.5) goToRef.current(indexRef.current + 1);
      else if (g.dx > 40 || g.vx > 0.5) goToRef.current(indexRef.current - 1);
      else Animated.timing(x, { toValue: -indexRef.current * width, duration: 200, useNativeDriver: true }).start();
    },
    onPanResponderTerminate: () => x.setValue(-indexRef.current * width),
  }), [width, x]);

  if (!count) return <View style={[styles.carousel, { height }]} />;

  const realIndex = index === 0 ? count - 1 : index === count + 1 ? 0 : index - 1;

  return (
    <View style={[styles.carousel, { height }]} {...pan.panHandlers}>
      <Animated.View style={[styles.track, { width: width * slides.length, transform: [{ translateX: x }] }]}>
        {slides.map((banner, i) => (
          <Pressable
            key={`${banner.id || 'slide'}-${i}`}
            disabled={!banner.linkUrl}
            accessibilityRole={banner.linkUrl ? 'link' : 'image'}
            accessibilityLabel={banner.title || `Banner ${i}`}
            onPress={() => openLink(banner.linkUrl)}
            style={{ width, height }}
          >
            <Image source={source(banner)} style={styles.slideImage} resizeMode="cover" />
          </Pressable>
        ))}
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous banner"
        onPress={() => goTo(index - 1)}
        style={[styles.control, styles.controlPrev]}
      >
        <CaretLeftIcon size={20} color="#fff" />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next banner"
        onPress={() => goTo(index + 1)}
        style={[styles.control, styles.controlNext]}
      >
        <CaretRightIcon size={20} color="#fff" />
      </Pressable>

      <View style={styles.dots} pointerEvents="box-none">
        {banners.map((_, i) => {
          const active = realIndex === i;
          return (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={`Show banner ${i + 1} of ${count}`}
              accessibilityState={{ selected: active }}
              onPress={() => goTo(i + 1)}
              style={[styles.dot, active && styles.dotActiveTarget]}
            >
              <View style={[styles.dotMark, active && styles.dotMarkActive]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** One of the two banners under the carousel (grey until its image is in). */
function SideBanner({ banner }) {
  const openLink = useOpenBannerLink();
  const [loaded, setLoaded] = useState(false);
  return (
    <Pressable
      disabled={!banner.linkUrl}
      accessibilityRole={banner.linkUrl ? 'link' : 'image'}
      accessibilityLabel={banner.title || 'Homepage banner'}
      onPress={() => openLink(banner.linkUrl)}
      style={[styles.sideCard, !loaded && styles.sideLoading]}
    >
      <Image
        source={source(banner)}
        style={[styles.sideImage, !loaded && styles.hidden]}
        resizeMode="cover"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </Pressable>
  );
}

/** The 2-up row under the carousel: skeletons while loading, then the set ones. */
export function SideBanners({ ready, top, bottom }) {
  return (
    <View style={styles.sidebar}>
      <View style={styles.sideCell}>
        {!ready ? <View style={[styles.sideCard, styles.sideLoading]} /> : top ? <SideBanner banner={top} /> : null}
      </View>
      <View style={styles.sideCell}>
        {!ready ? <View style={[styles.sideCard, styles.sideLoading]} /> : bottom ? <SideBanner banner={bottom} /> : null}
      </View>
    </View>
  );
}

const PROMO_IN_MS = 340;
const PROMO_OUT_MS = 240;

/**
 * The promotion popup (HOME_POPUP banner): grows in, shrinks out.
 * As on the website it is a layer over the page, not a window above the
 * app: the top bar and the tab bar stay above its dimmed backdrop, and the
 * picture is centred on the whole screen. Back (Android) and Escape (web)
 * close it.
 */
export function PromotionPopup({ banner, onClose }) {
  const { width: vw, height: vh } = useWindowDimensions();
  const openLink = useOpenBannerLink();
  const [ratio, setRatio] = useState(null);
  const closingRef = useRef(false);
  const scale = useRef(new Animated.Value(0.4)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!banner.imageUrl) return;
    Image.getSize(banner.imageUrl, (w, h) => setRatio(w / h), () => setRatio(1));
  }, [banner.imageUrl]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: PROMO_IN_MS, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: PROMO_IN_MS * 0.6, useNativeDriver: true }),
    ]).start();
  }, [fade, opacity, scale]);

  // Let the shrink animation finish before the popup is removed.
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    Animated.parallel([
      Animated.timing(fade, { toValue: 0, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.4, duration: PROMO_OUT_MS, easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: PROMO_OUT_MS, useNativeDriver: true }),
    ]).start(onClose);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => { closeRef.current(); return true; });
    let removeKey = () => {};
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const onKey = (event) => { if (event.key === 'Escape') closeRef.current(); };
      document.addEventListener('keydown', onKey);
      removeKey = () => document.removeEventListener('keydown', onKey);
    }
    return () => { back.remove(); removeKey(); };
  }, []);

  // min(520px, 100vw - 32px) inside 24px of padding: on a phone the picture
  // is wider than the room left, and the website's grid then starts it at
  // the 24px padding (it spills 8px further right), not centred.
  const dialogW = Math.min(520, vw - 32);
  const room = vw - 48;
  const left = dialogW > room ? 24 : (vw - dialogW) / 2;
  const maxH = vh - 48;
  const imageH = ratio ? Math.min(dialogW / ratio, maxH) : dialogW;

  return (
    <Animated.View style={[styles.promoBackdrop, { opacity: fade }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close promotion" />
      <View style={[styles.promoCentre, { height: vh }]} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={banner.title || 'Promotion'}
          style={[styles.promoDialog, { width: dialogW, marginLeft: left, opacity, transform: [{ scale }] }]}
        >
          <Pressable
            disabled={!banner.linkUrl}
            onPress={() => { close(); openLink(banner.linkUrl); }}
            accessibilityRole={banner.linkUrl ? 'link' : 'image'}
          >
            <Image source={{ uri: banner.imageUrl }} style={{ width: dialogW, height: imageH }} resizeMode="contain" />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Close promotion" onPress={close} style={styles.promoClose}>
            <XIcon size={18} color="#fff" />
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  carousel: { width: '100%', overflow: 'hidden', backgroundColor: t.neutral[100] },
  track: { flexDirection: 'row', height: '100%' },
  slideImage: { width: '100%', height: '100%' },

  // Small round arrows, 8px in from the edges.
  control: {
    position: 'absolute', top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  controlPrev: { left: 8 },
  controlNext: { right: 8 },

  // Each dot is a 24px target; the dot itself is drawn inside.
  dots: { position: 'absolute', bottom: 2, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center' },
  dot: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  dotActiveTarget: { width: 26 },
  dotMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255, 255, 255, 0.5)' },
  dotMarkActive: { width: 18, borderRadius: 4, backgroundColor: '#fff' },

  // Phones: two banners side by side, 4px apart, square corners.
  // 7px under the carousel (the grid's 0.5rem gap at the phone's 14px root).
  sidebar: { flexDirection: 'row', gap: 4, paddingVertical: 6, paddingHorizontal: 12, marginTop: 7 },
  sideCell: { flex: 1, minWidth: 0 },
  sideCard: { width: '100%', aspectRatio: 16 / 10, overflow: 'hidden', backgroundColor: t.neutral[100] },
  sideLoading: { backgroundColor: t.neutral[150] },
  // Zoomed a touch, so a thin frame drawn into the uploaded image is cropped away.
  sideImage: { width: '100%', height: '100%', transform: [{ scale: 1.03 }] },
  hidden: { opacity: 0 },

  // Over the whole screen, under the top bar (zIndex 10).
  promoBackdrop: { ...StyleSheet.absoluteFillObject, zIndex: 5, backgroundColor: 'rgba(15, 23, 42, 0.58)' },
  promoCentre: { position: 'absolute', top: 0, left: 0, right: 0, justifyContent: 'center', alignItems: 'flex-start' },
  promoDialog: {
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: 22, blurRadius: 60, color: 'rgba(15, 23, 42, 0.3)' }],
  },
  promoClose: {
    position: 'absolute', top: -12, right: -12, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.neutral[0], backgroundColor: t.secondary[950],
  },
});
