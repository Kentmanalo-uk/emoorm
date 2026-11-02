import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BubbleArt, BuoyArt, CameraArt, GridArt, HeadsetArt, HeartArt, MapArt, MegaphoneArt, ParcelArt,
  PiggyArt, PinArt, PotArt, QrArt, ReturnArt, ShopArt, SparkArt, StarArt, TagArt, TownArt, TrendArt,
} from '../art/FlatArt';
import { font, t, themed } from '../../theme';

/**
 * The quick entries under the banners: two pages of ten, swiped sideways,
 * with a little bar underneath saying which page you are on.
 *
 * This is the shortest route to everything the app can already do. Before
 * it, the only way to a municipality, the stores map, Today's Menu or your
 * returns was to scroll past six sections or dig through Me -- things
 * people look for on their way in, not on their way down.
 *
 * Two pages because the split is real, not decorative: the first is ways
 * to find something to buy, the second is your own orders and the places
 * to get help. Every tile goes somewhere that already exists; nothing
 * here is a placeholder.
 */

const COLUMNS = 5;
const ROWS = 2;
const PER_PAGE = COLUMNS * ROWS;
const TRACK = 34;

/*
 * Each entry has its own mark and its own colour, so the grid is scanned
 * by colour before it is read -- which is the whole point of a shortcut.
 * The marks are flat silhouettes with their detail knocked out in white
 * (art/FlatArt.js), and sit uncased: no tile behind them, as everywhere
 * else in the app.
 */
const ENTRIES = [
  // Ways to shop.
  { key: 'today', label: 'Today’s Menu', Art: PotArt, to: '/today' },
  { key: 'new', label: 'New Arrivals', Art: SparkArt, to: '/products?sort=newest' },
  { key: 'best', label: 'Best Sellers', Art: TrendArt, to: '/products?sort=top-sales' },
  { key: 'budget', label: 'Budget Finds', Art: PiggyArt, to: '/products?sort=price-low' },
  { key: 'all', label: 'All Products', Art: GridArt, to: '/products' },
  { key: 'towns', label: 'Municipals', Art: TownArt, to: '/stores' },
  { key: 'map', label: 'Store Map', Art: MapArt, to: '/store-map' },
  // "Photo Search", not "Search by Photo": the longer one is the only
  // label of the twenty that needs a second line, and one tile standing
  // taller than its row is all the eye sees.
  { key: 'photo', label: 'Photo Search', Art: CameraArt, to: '/search-by-image' },
  { key: 'wishlist', label: 'Wishlist', Art: HeartArt, to: '/wishlist' },
  // On the first page on purpose: the only way into selling left on home
  // is the floating bubble, and a shortcut nobody swipes to is a
  // shortcut nobody takes.
  { key: 'sell', label: 'Start Selling', Art: MegaphoneArt, to: '/sell' },

  // Yours, and where to get help.
  { key: 'orders', label: 'My Orders', Art: ParcelArt, to: '/orders' },
  { key: 'offers', label: 'My Offers', Art: TagArt, to: '/offers' },
  // Your followed shops are a list of your own, so they sit here rather
  // than among the ways to browse -- which is the slot Start Selling took.
  { key: 'following', label: 'Following', Art: ShopArt, to: '/followed-stores' },
  { key: 'returns', label: 'Returns', Art: ReturnArt, to: '/returns' },
  { key: 'reviews', label: 'My Reviews', Art: StarArt, to: '/reviews' },
  { key: 'addresses', label: 'Addresses', Art: PinArt, to: '/addresses' },
  { key: 'qr', label: 'Scan QR', Art: QrArt, to: '/qr-scan' },
  { key: 'help', label: 'Help Centre', Art: BuoyArt, to: '/help-center' },
  { key: 'care', label: 'Customer Care', Art: HeadsetArt, to: '/customer-care' },
  { key: 'feedback', label: 'Feedback', Art: BubbleArt, to: '/feedback' },
];

const PAGES = Math.ceil(ENTRIES.length / PER_PAGE);
const pages = Array.from({ length: PAGES }, (_, p) => ENTRIES.slice(p * PER_PAGE, (p + 1) * PER_PAGE));

export default function HomeShortcuts() {
  const router = useRouter();
  // The tiles are laid out against a measured width rather than the
  // window's: this sits inside the list's header, and a tablet or a split
  // screen is not the same thing as the screen.
  const [width, setWidth] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  // Built once: Animated.event attaches itself to the view it is given,
  // and a fresh one each render re-attaches on every pass.
  const onScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true }),
  ).current;

  // The bar under the grid is the scroll itself, scaled down -- it moves
  // with the finger rather than jumping once the page has settled.
  //
  // Held across renders: an interpolation is a node on the animation
  // graph, and building a new one every render leaves the old ones
  // attached to the same value.
  const travel = useMemo(() => (width
    ? scrollX.interpolate({
      inputRange: [0, width * (PAGES - 1)],
      outputRange: [0, TRACK - TRACK / PAGES],
      extrapolate: 'clamp',
    })
    : 0), [scrollX, width]);

  return (
    <View style={styles.section} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {/* Animated.ScrollView, not ScrollView: a native-driven
          Animated.event is an object the animated wrapper knows how to
          attach, and a plain scroller passes it straight through to the
          native view, which then calls an onScroll that is not a
          function -- once per scroll frame, which locks the app up. */}
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {width ? pages.map((page, p) => (
          <View key={`page-${p}`} style={[styles.page, { width }]}>
            {page.map((entry) => (
              <Pressable
                key={entry.key}
                accessibilityRole="button"
                accessibilityLabel={entry.label}
                onPress={() => router.push(entry.to)}
                style={({ pressed }) => [styles.tile, { width: width / COLUMNS }, pressed && styles.tilePressed]}
              >
                <entry.Art size={36} />
                <Text style={styles.label} numberOfLines={2}>{entry.label}</Text>
              </Pressable>
            ))}
          </View>
        )) : null}
      </Animated.ScrollView>

      {PAGES > 1 ? (
        <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Animated.View style={[styles.thumb, { transform: [{ translateX: travel }] }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  section: { marginTop: 12, paddingVertical: 14, backgroundColor: t.neutral[0] },

  page: { flexDirection: 'row', flexWrap: 'wrap' },
  // Tall enough for the mark, the gap and two lines of label, so a
  // phone set to larger text does not clip the longer names.
  tile: { height: 78, alignItems: 'center', paddingTop: 6, paddingHorizontal: 2, gap: 6 },
  tilePressed: { opacity: 0.6 },
  label: { fontSize: 10.5, lineHeight: 13, textAlign: 'center', color: t.neutral[700], ...font(400) },

  track: {
    width: TRACK, height: 3, marginTop: 10, alignSelf: 'center', borderRadius: 2,
    backgroundColor: t.neutral[200], overflow: 'hidden',
  },
  thumb: { width: TRACK / PAGES, height: 3, borderRadius: 2, backgroundColor: t.primary[500] },
}));
