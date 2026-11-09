import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BasketArt, BowlArt, BrushArt, CalendarArt, CameraArt, CapArt, ClockArt, FishArt, GiftArt, GridArt,
  LiveArt, LivestockArt, MapArt, MegaphoneArt, MountainArt, PackageArt, PickupArt, PiggyArt, PotArt,
  QrArt, SaleArt, SparkArt, TONES, TownArt, TrendArt,
} from '../art/FlatArt';
import useAppSettings, { shortcutLook, shortcutScale } from '../../lib/appSettings';
import { font, t, themed } from '../../theme';

/**
 * The quick entries under the banners (web components/home/HomeShortcuts.jsx,
 * phone view): pages of ten, swiped sideways, with a little bar underneath
 * saying which page you are on. The first page is the one Home has always
 * had, the ways to find something to buy; the newer tiles follow on the next
 * pages: the market and deals, kinds of things, then ways to get them and
 * places to explore.
 *
 * Your own orders, offers, followed shops, returns, reviews, addresses and
 * wishlist are the Profile tab's shortcuts now, and help is on its strip
 * (Customer Care and Feedback open from the Help Centre), so Home leaves
 * them out, as the website's phone view does.
 *
 * Where the website shows Get the App (its /app page: the Play listing and a
 * QR code to scan with a phone), the app has Scan QR: this is the app
 * already, and the website's own comment on that tile says the app's opens
 * its scanner (a shop's QR, or logging in on a computer).
 */

const COLUMNS = 5;
const ROWS = 2;
const PER_PAGE = COLUMNS * ROWS;
const TRACK = 34;
// The marks on the website's phones: 44px times the size a super admin
// chose (Home.css .hsc-tile svg), the tile 44px taller for two lines of label.
const MARK = 44;

/*
 * Each entry has its own mark and its own colour, so the grid is scanned
 * by colour before it is read -- which is the whole point of a shortcut.
 * The marks sit uncased: no tile behind them, as everywhere else in the app.
 */
const ENTRIES = [
  { key: 'today', label: 'Today’s Menu', Art: PotArt, to: '/today' },
  { key: 'new', label: 'New Arrivals', Art: SparkArt, to: '/products?sort=newest' },
  { key: 'best', label: 'Best Sellers', Art: TrendArt, to: '/products?sort=top-sales' },
  { key: 'budget', label: 'Budget Finds', Art: PiggyArt, to: '/products?sort=price-low' },
  { key: 'all', label: 'All Products', Art: GridArt, to: '/products' },
  { key: 'towns', label: 'Municipals', Art: TownArt, to: '/stores' },
  { key: 'map', label: 'Store Map', Art: MapArt, to: '/store-map' },
  // Photo Search's old place; Photo Search itself is on a later page.
  { key: 'live', label: 'Live Now', Art: LiveArt, to: '/live' },
  // The website's Get the App, in the Wishlist's old place.
  { key: 'qr', label: 'Scan QR', Art: QrArt, to: '/qr-scan' },
  // On the first page on purpose: Profile only offers selling to a
  // signed-in buyer, Home to everyone.
  { key: 'sell', label: 'Start Selling', Art: MegaphoneArt, to: '/sell' },

  // The newer ones, after them, in the website's order.
  { key: 'palengke', label: 'Palengke', Art: BasketArt, to: '/palengke' },
  { key: 'sale', label: 'On Sale', Art: SaleArt, to: '/c/on-sale' },
  { key: 'ready', label: 'Ready to Eat', Art: BowlArt, to: '/c/ready-to-eat' },
  { key: 'pasalubong', label: 'Pasalubong', Art: GiftArt, to: '/c/pasalubong' },
  {
    key: 'open', label: 'Open Now', Art: ClockArt, tone: TONES.emerald, to: '/stores?open=now',
  },
  { key: 'preorder', label: 'Pre-order', Art: CalendarArt, to: '/c/pre-order' },
  { key: 'diy', label: 'DIY & Crafts', Art: BrushArt, to: '/c/diy' },
  { key: 'packages', label: 'Packages', Art: PackageArt, to: '/c/packages' },
  { key: 'seafood', label: 'Seafood', Art: FishArt, to: '/category/seafood' },
  { key: 'livestock', label: 'Livestock', Art: LivestockArt, to: '/category/livestock' },
  // "Photo Search", not "Search by Photo": the longer one would be the only
  // label needing a second line, and one tile standing taller than its row
  // is all the eye sees.
  { key: 'photo', label: 'Photo Search', Art: CameraArt, to: '/search-by-image' },
  { key: 'pickup', label: 'Pickup Near Me', Art: PickupArt, to: '/stores?pickup=1' },
  { key: 'explore', label: 'Explore Mindoro', Art: MountainArt, to: '/explore' },
  // The website's /sell/academy; the app has no academy screen yet, so the
  // Start Selling page (which leads into selling) stands in for it.
  { key: 'academy', label: 'Seller Academy', Art: CapArt, to: '/sell' },
];

const PAGES = Math.ceil(ENTRIES.length / PER_PAGE);
const pages = Array.from({ length: PAGES }, (_, p) => ENTRIES.slice(p * PER_PAGE, (p + 1) * PER_PAGE));

export default function HomeShortcuts() {
  const router = useRouter();
  // The look (glass or glossy 3D) and size a super admin chose for them.
  const settings = useAppSettings();
  const look = shortcutLook(settings);
  const mark = Math.round(MARK * shortcutScale(settings));
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
  const travel = useMemo(() => (width && PAGES > 1
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
                style={({ pressed }) => [styles.tile, { width: width / COLUMNS, height: mark + 44 }, pressed && styles.tilePressed]}
              >
                <entry.Art size={mark} tone={entry.tone} look={look} />
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
  // Tall enough for the mark, the gap and two lines of label (the height
  // is set with the mark's size), so a phone set to larger text does not
  // clip the longer names.
  tile: { alignItems: 'center', paddingTop: 6, paddingHorizontal: 2, gap: 6 },
  tilePressed: { opacity: 0.6 },
  label: { fontSize: 10.5, lineHeight: 13, textAlign: 'center', color: t.neutral[700], ...font(400) },

  track: {
    width: TRACK, height: 3, marginTop: 10, alignSelf: 'center', borderRadius: 2,
    backgroundColor: t.neutral[200], overflow: 'hidden',
  },
  thumb: { width: TRACK / PAGES, height: 3, borderRadius: 2, backgroundColor: t.primary[500] },
}));
