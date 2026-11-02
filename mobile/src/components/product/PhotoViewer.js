import { useEffect, useRef, useState } from 'react';
import {
  Animated, FlatList, Image, Modal, PanResponder, Pressable, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShareNetworkIcon, XIcon } from '../../lib/icons';
import { openShare, ShareSheetHost } from '../ShareSheet';
import { resolveImg, sizedImg } from '../../lib/media';
import { font, themed } from '../../theme';

/**
 * A product's photos, full screen: tap one on the product page and it
 * fills the screen, black behind it, with the rest of them on a rail
 * along the bottom (web/src/components/product/PhotoViewer.jsx).
 *
 * The product page shows photos at the width of the phone. What a shopper
 * wants before paying is the stitching, the label, the scratch on the
 * second-hand one -- which means zooming in, and the page cannot offer
 * that without losing the price and the buy button. So: a viewer, with
 * the name and the price kept at the foot of it, because the question
 * being answered is still "do I buy this".
 */

const MAX = 4;
const DOUBLE_TAP = 2.5;
const TAP_MS = 320;
// Shared, so the slides that are not in front keep the same callback
// between renders.
const NOOP = () => {};

/*
 * This screen is black whatever the phone's theme is, so these two do not
 * come from the theme: the dark palette is the light one reversed, and on
 * black that would turn the price from pale pink into #be185d, which is
 * barely readable there. A fixed surface takes fixed colours.
 */
const BRAND_GREEN = '#34d399';
const BRAND_PINK = '#f9a8d4';
// The button's fill, which carries white text: 5.5:1 either way.
const BRAND_DEEP = '#047857';

/** How far apart two fingers are. */
const spread = (touches) => Math.hypot(
  touches[0].pageX - touches[1].pageX,
  touches[0].pageY - touches[1].pageY,
);

/** Where the middle of a pinch is. */
const middle = (touches) => ({
  x: (touches[0].pageX + touches[1].pageX) / 2,
  y: (touches[0].pageY + touches[1].pageY) / 2,
});

/**
 * One photo that can be pinched, dragged and double-tapped.
 *
 * Written by hand because the app carries neither gesture-handler nor
 * reanimated, and a viewer is not worth a native rebuild. The responder
 * is claimed only for a second finger or while zoomed, so at normal size
 * every swipe still reaches the pager underneath; once zoomed, the pager
 * is told to stop scrolling so a drag moves the picture instead of
 * paging away from it.
 */
function Zoomable({ src, width, height, active, onZoom }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  // The values as numbers: an Animated.Value cannot be read back
  // synchronously, and every gesture below starts from where the last
  // one finished.
  const now = useRef({ scale: 1, x: 0, y: 0 });
  const from = useRef(null);
  const lastTap = useRef(0);

  const reset = (animated) => {
    now.current = { scale: 1, x: 0, y: 0 };
    onZoom(false);
    if (!animated) {
      scale.setValue(1);
      pan.setValue({ x: 0, y: 0 });
      return;
    }
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 8, tension: 90 }),
      Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 8, tension: 90 }),
    ]).start();
  };

  // Swiping away from a photo returns it to its normal size, so coming
  // back to it does not land halfway into a crop.
  useEffect(() => { if (!active) reset(false); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Keeps the picture's edges at or inside the screen's. */
  const clamp = (next) => {
    const room = (size) => Math.max(0, (size * next.scale - size) / 2);
    const rx = room(width);
    const ry = room(height);
    return {
      scale: next.scale,
      x: Math.min(rx, Math.max(-rx, next.x)),
      y: Math.min(ry, Math.max(-ry, next.y)),
    };
  };

  const put = (next) => {
    const to = clamp(next);
    now.current = to;
    scale.setValue(to.scale);
    pan.setValue({ x: to.x, y: to.y });
  };

  /** Zoom to `scale`, keeping the point between the fingers where it is. */
  const zoomTo = (toScale, at, base) => {
    const cx = at.x - width / 2;
    const cy = at.y - height / 2;
    const k = toScale / base.scale;
    put({ scale: toScale, x: cx - (cx - base.x) * k, y: cy - (cy - base.y) * k });
  };

  const responder = useRef(
    PanResponder.create({
      // A tap is let through at normal size: it is how the viewer is
      // closed, and claiming it would swallow the pager's swipe too.
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e, g) => (
        e.nativeEvent.touches.length === 2
        || (now.current.scale > 1.01 && (Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3))
      ),
      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        from.current = touches.length === 2
          ? { gap: spread(touches), at: middle(touches), base: { ...now.current } }
          : { base: { ...now.current } };
      },
      onPanResponderMove: (e, g) => {
        const touches = e.nativeEvent.touches;
        const start = from.current;
        if (!start) return;
        if (touches.length === 2) {
          // A pinch that began with one finger down: take this frame as
          // its start rather than scaling from a gap that never existed.
          if (!start.gap) {
            from.current = { gap: spread(touches), at: middle(touches), base: { ...now.current } };
            return;
          }
          const next = Math.min(MAX, Math.max(1, (start.base.scale * spread(touches)) / start.gap));
          zoomTo(next, start.at, start.base);
          onZoom(next > 1.01);
        } else if (start.base.scale > 1.01) {
          put({ scale: start.base.scale, x: start.base.x + g.dx, y: start.base.y + g.dy });
        }
      },
      onPanResponderRelease: () => {
        from.current = null;
        if (now.current.scale <= 1.01) reset(true);
      },
      onPanResponderTerminate: () => { from.current = null; },
    }),
  ).current;

  // Double tap, which is how a phone zooms.
  const onPress = (e) => {
    const stamp = Date.now();
    const quick = stamp - lastTap.current < TAP_MS;
    lastTap.current = quick ? 0 : stamp;
    if (!quick) return;
    if (now.current.scale > 1.01) { reset(true); return; }
    const { locationX, locationY } = e.nativeEvent;
    zoomTo(DOUBLE_TAP, { x: locationX, y: locationY }, { scale: 1, x: 0, y: 0 });
    onZoom(true);
  };

  const uri = src ? (resolveImg(sizedImg(src, width)) || resolveImg(src)) : null;

  return (
    <View style={{ width, height }} {...responder.panHandlers}>
      <Pressable onPress={onPress} style={StyleSheet.absoluteFill}>
        <Animated.Image
          source={uri ? { uri } : null}
          style={[
            StyleSheet.absoluteFill,
            { width, height, transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] },
          ]}
          resizeMode="contain"
        />
      </Pressable>
    </View>
  );
}

export default function PhotoViewer({
  photos, index, product, price, onClose, onBuy, buyLabel = 'Buy now',
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef(null);
  const railRef = useRef(null);

  const [at, setAt] = useState(Math.min(Math.max(index, 0), Math.max(photos.length - 1, 0)));
  // While a photo is zoomed the pager stops, so a drag moves the picture.
  const [zoomed, setZoomed] = useState(false);

  const foot = (photos.length > 1 ? 78 : 0) + 62;
  const stage = Math.max(200, height - insets.top - insets.bottom - 48 - foot);

  // The rail follows the photo, so the one being looked at is in view.
  useEffect(() => {
    if (photos.length > 1) {
      railRef.current?.scrollToIndex({ index: at, animated: true, viewPosition: 0.5 });
    }
  }, [at, photos.length]);

  const show = (i) => {
    setAt(i);
    listRef.current?.scrollToIndex({ index: i, animated: false });
  };

  const onShare = () => {
    if (!product?.slug) return;
    openShare({ title: product.name, text: product.name, url: `https://emoorm.shop/product/${product.slug}` });
  };

  if (!photos.length) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.icon}>
            <XIcon size={22} color="#fff" />
          </Pressable>
          <Text style={styles.count}>{at + 1}/{photos.length}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Share this product" onPress={onShare} style={styles.icon}>
            <ShareNetworkIcon size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={{ height: stage }}>
          <FlatList
            ref={listRef}
            data={photos}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            // Snaps rather than coasting: a swipe lands on the next photo
            // instead of drifting through two.
            decelerationRate="fast"
            snapToInterval={width}
            snapToAlignment="start"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={at}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(src, i) => `${src}-${i}`}
            // While the finger is still down, so the counter and the rail
            // do not read a photo behind during a slow drag.
            onScroll={(e) => {
              const near = Math.round(e.nativeEvent.contentOffset.x / width);
              if (near !== at && near >= 0 && near < photos.length) setAt(near);
            }}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index: i }) => (
              <Zoomable
                src={item}
                width={width}
                height={stage}
                active={i === at}
                onZoom={i === at ? setZoomed : NOOP}
              />
            )}
          />
        </View>

        <View style={[styles.foot, { paddingBottom: 10 + insets.bottom }]}>
          {photos.length > 1 ? (
            <FlatList
              ref={railRef}
              data={photos}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
              keyExtractor={(src, i) => `thumb-${src}-${i}`}
              getItemLayout={(_, i) => ({ length: 64, offset: 64 * i, index: i })}
              // The rail is scrolled to a photo that may not be rendered
              // yet; without this that throws rather than scrolling.
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index: i }) => (
                <Pressable
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Photo ${i + 1} of ${photos.length}`}
                  onPress={() => show(i)}
                  style={[styles.thumb, i === at && styles.thumbOn]}
                >
                  <Image source={{ uri: resolveImg(sizedImg(item, 56)) || resolveImg(item) }} style={styles.thumbImg} />
                </Pressable>
              )}
            />
          ) : null}

          <View style={styles.buy}>
            <View style={styles.what}>
              <Text style={styles.name} numberOfLines={1}>{product?.name}</Text>
              {price ? <Text style={styles.price}>{price}</Text> : null}
            </View>
            {onBuy ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => { onClose(); onBuy(); }}
                style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.ctaText}>{buyLabel}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Inside this Modal, so Share comes up over it rather than
            behind it (components/ShareSheet.js). */}
        <ShareSheetHost />
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  top: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 15, lineHeight: 20, color: '#fff', ...font(600) },

  foot: { paddingTop: 10, gap: 10 },
  rail: { paddingHorizontal: 12, gap: 8 },
  thumb: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden', opacity: 0.55 },
  // The one you are on, in the brand's green rather than a borrowed red.
  thumbOn: { borderColor: BRAND_GREEN, opacity: 1 },
  thumbImg: { width: '100%', height: '100%' },

  buy: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  what: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, lineHeight: 19, color: '#fff', ...font(500) },
  price: { marginTop: 2, fontSize: 19, lineHeight: 24, color: BRAND_PINK, ...font(700) },
  cta: { height: 40, paddingHorizontal: 22, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND_DEEP },
  ctaText: { fontSize: 14.5, lineHeight: 19, color: '#fff', ...font(600) },
}));
