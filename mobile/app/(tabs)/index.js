import {
  memo, useCallback, useEffect, useRef, useState,
} from 'react';
import {
  ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View, unstable_batchedUpdates,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import apiClient from '../../src/api/client';
import { resolveImg } from '../../src/lib/media';
import { getCacheEntry, setCachedData } from '../../src/lib/dataCache';
import { fetchCategories, fetchMunicipalities } from '../../src/lib/referenceData';
import useAuthStore from '../../src/store/authStore';
import ProductCard from '../../src/components/ProductCard';
import HomeHeader, { HomeQuickSearch } from '../../src/components/HomeHeader';
import { useTabBarScroll } from '../../src/components/Glass';
import HomeTodayRail from '../../src/components/home/HomeTodayRail';
import useBrandRefresh from '../../src/components/useBrandRefresh';
import { fetchForYou } from '../../src/lib/forYou';
import LiveNow from '../../src/components/live/LiveNow';
import { setPageMoving } from '../../src/lib/pageMotion';
import StartSellingBubble from '../../src/components/home/StartSellingBubble';
import { MapTrifoldIcon } from '../../src/lib/icons';
import { MapArt } from '../../src/components/art/FlatArt';
import {
  BannerCarousel, FALLBACK_BANNERS, PromotionPopup,
} from '../../src/components/home/HomeBanners';
import HomeShortcuts from '../../src/components/home/HomeShortcuts';
import {
  CategoryStrip, HomeEmpty, HomeStoreRow, MunicipalityRail, SectionHeader,
} from '../../src/components/home/HomeSections';
import {
  GRID_BLEED, GRID_EDGE, GRID_GAP, SECTION_EDGE, gridCellWidth,
} from '../../src/lib/productGrid';
import { font, t, themed } from '../../src/theme';

/*
 * Home (web/src/pages/Home.jsx, phone view): quick search words, the banner
 * carousel, the quick entries (HomeShortcuts, which the website's phone view
 * shows too; its two side banners are for computers), Shop by Category, Available Today,
 * Suggested for You, Stores Near You, Explore Municipals, Discover Stores
 * (the map) and Explore Products, which loads its next batch on its own as
 * the page nears the bottom (one request at a time, small batches). The
 * website's footer lives on the About page in the app (app/about.js).
 */

// Phones: 5 rows of the 2-column grid per batch.
const EXPLORE_BATCH = 5 * 2;
// What Home showed last time: shown at once, then refreshed.
const CACHE_KEY = 'home:page';
const readCache = () => getCacheEntry(CACHE_KEY)?.data || {};
const patchCache = (patch) => setCachedData(CACHE_KEY, { ...readCache(), ...patch });
// The promotion popup shows once per app run (the website: once per tab).
const seenPopups = new Set();

// The admin's app settings: the category look and the app logo.
let settingsRequest = null;
const loadAppSettings = () => {
  settingsRequest = settingsRequest || apiClient.get('/app-settings')
    .then((res) => res?.data || {})
    .catch(() => { settingsRequest = null; return {}; });
  return settingsRequest;
};

// Each section drawn again only when its own data changes. Everything
// above Explore is the list's header, which Home redraws whenever any
// answer comes in; without these, every answer redrew every section above
// it, in the middle of the shopper's scroll.
const Banners = memo(BannerCarousel);
const Shortcuts = memo(HomeShortcuts);
const QuickSearch = memo(HomeQuickSearch);
const Categories = memo(CategoryStrip);
const Live = memo(LiveNow);
const TodayRail = memo(HomeTodayRail);
const StoreRow = memo(HomeStoreRow);
const Towns = memo(MunicipalityRail);
const Card = memo(ProductCard);
const ProductGrid = memo(function ProductGrid({ products, tileWidth }) {
  return (
    <View style={styles.grid}>
      {products.map((product) => (
        <Card key={product.id} product={product} variant="home" style={{ width: tileWidth }} />
      ))}
    </View>
  );
});

// How many "Suggested for You" shows. A saved page may hold more, from before.
const SUGGESTED = 4;

const mapBanner = (b) => ({
  id: b.id,
  imageUrl: resolveImg(b.imageUrl) || b.imageUrl,
  linkUrl: b.linkUrl || null,
  title: b.title || 'Banner',
  subtitle: b.subtitle || '',
  updatedAt: b.updatedAt,
});

export default function Home() {
  const tabScroll = useTabBarScroll();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const townId = user?.municipalityId || undefined;
  const [cache] = useState(readCache);

  const [banners, setBanners] = useState(() => cache.banners || FALLBACK_BANNERS);
  const [popup, setPopup] = useState(null);

  const [categories, setCategories] = useState(() => cache.categories || []);
  const [categoryIcons, setCategoryIcons] = useState(() => cache.categoryStyle === 'ICON');
  const [municipalities, setMunicipalities] = useState(() => cache.municipalities || []);
  const [featured, setFeatured] = useState(() => cache.featured || []);
  const [nearbyStores, setNearbyStores] = useState(() => cache.nearbyStores || []);
  // Below the first screen (the towns, the nearby shops, the first Explore
  // batch): asked for once the page is scrolled a little or after a short
  // wait, so the first screen's requests go out alone (as the website's
  // Home: hooks/useNearScreen). Latches on.
  const [belowNear, setBelowNear] = useState(false);

  // While a finger is moving the page, nothing new is drawn: answers that
  // arrive (and sections that come near) wait, and all go in together the
  // moment the scroll comes to rest. A redraw mid-fling is what made the
  // first sections stutter; the fling itself never waits on anything.
  const scrolling = useRef(false);
  const restTimer = useRef(null);
  const waiting = useRef([]);
  const whenIdle = useCallback((fn) => {
    if (scrolling.current) waiting.current.push(fn);
    else fn();
  }, []);
  const settle = useCallback((ms = 140) => {
    clearTimeout(restTimer.current);
    restTimer.current = setTimeout(() => {
      scrolling.current = false;
      setPageMoving(false);
      const jobs = waiting.current.splice(0);
      if (jobs.length) unstable_batchedUpdates(() => jobs.forEach((job) => job()));
    }, ms);
  }, []);
  // The page's own decorations (banners, the search word, the Start
  // selling wave) hold still while it moves too (lib/pageMotion).
  const moveStart = useCallback(() => {
    scrolling.current = true;
    setPageMoving(true);
    clearTimeout(restTimer.current);
  }, []);
  const scrollEvents = {
    onScrollBeginDrag: moveStart,
    onMomentumScrollBegin: moveStart,
    // A drag that ends without a fling settles a moment later; a fling
    // cancels that and settles when it stops.
    onScrollEndDrag: () => settle(220),
    onMomentumScrollEnd: () => settle(),
  };
  useEffect(() => () => { clearTimeout(restTimer.current); setPageMoving(false); }, []);

  useEffect(() => {
    if (belowNear) return undefined;
    const timer = setTimeout(() => whenIdle(() => setBelowNear(true)), 2500);
    return () => clearTimeout(timer);
  }, [belowNear, whenIdle]);

  const [explore, setExplore] = useState(() => cache.explore || []);
  const [explorePage, setExplorePage] = useState(() => cache.explorePage || 1);
  const [exploreHasMore, setExploreHasMore] = useState(() => Boolean(cache.exploreHasMore));
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreFailed, setExploreFailed] = useState(false);
  // One request at a time: scroll events come many per second.
  const exploreBusy = useRef(false);
  const exploreSaved = useRef(cache.explorePage || 1);

  // Banners: the carousel and the popup. The two sidebar placements are for
  // the website on computers; phones show HomeShortcuts in that space.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/banners');
        const list = Array.isArray(res.data) ? res.data : [];
        if (cancelled || list.length === 0) return;
        const carousel = list.filter((b) => (b.placement || 'HOME_CAROUSEL') === 'HOME_CAROUSEL').map(mapBanner);
        const promo = list.find((b) => b.placement === 'HOME_POPUP');
        if (carousel.length > 0) setBanners(carousel);
        patchCache({ banners: carousel.length > 0 ? carousel : null });
        if (promo) {
          const mapped = mapBanner(promo);
          const key = `${mapped.id}.${mapped.updatedAt || ''}`;
          if (!seenPopups.has(key)) {
            seenPopups.add(key);
            setPopup(mapped);
          }
        }
      } catch {
        // keep the fallback banners
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Reference data: categories (and their look), the towns.
  useEffect(() => {
    let cancelled = false;
    fetchCategories().then((list) => {
      if (cancelled) return;
      setCategories(list || []);
      patchCache({ categories: list || [] });
    }).catch(() => {});
    loadAppSettings().then((settings) => {
      if (cancelled) return;
      const style = settings.categoryStyle || 'IMAGE';
      setCategoryIcons(style === 'ICON');
      patchCache({ categoryStyle: style });
    });
    return () => { cancelled = true; };
  }, []);

  // The towns rail is well below the first screen.
  useEffect(() => {
    if (!belowNear) return undefined;
    let cancelled = false;
    fetchMunicipalities().then((list) => {
      if (cancelled) return;
      patchCache({ municipalities: list || [] });
      whenIdle(() => setMunicipalities(list || []));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [belowNear, whenIdle]);

  // Each section loads on its own and shows as soon as its answer arrives.
  // `top`: Suggested for You; `below`: the sections under the first
  // screen (a pull asks for both).
  const loadSections = useCallback((isLive = () => true, { top = true, below = true } = {}) => {
    const load = (request, show) => request
      .then((res) => { if (isLive()) whenIdle(() => show(res)); })
      .catch((err) => console.error('Failed to load home data:', err?.message || err));

    const first = top ? load(
      fetchForYou(user?.id, { pageSize: SUGGESTED }),
      (res) => {
        setFeatured(res.data || []);
        patchCache({ featured: res.data || [] });
      },
    ) : Promise.resolve();
    if (!below) return first;
    return Promise.all([first, load(
      fetchForYou(user?.id, { page: 1, pageSize: EXPLORE_BATCH, skip: SUGGESTED }),
      (res) => {
        const fresh = res.data || [];
        if (exploreSaved.current > 1) {
          // More was loaded last time: the first batch is refreshed in
          // place and the rest stays, so the list keeps its length.
          const freshIds = new Set(fresh.map((p) => p.id));
          setExplore((prev) => {
            const merged = [...fresh, ...prev.slice(fresh.length).filter((p) => !freshIds.has(p.id))];
            patchCache({ explore: merged });
            return merged;
          });
          return;
        }
        const hasNext = Boolean(res.pagination?.hasNext);
        setExplore(fresh);
        setExplorePage(1);
        setExploreHasMore(hasNext);
        patchCache({ explore: fresh, explorePage: 1, exploreHasMore: hasNext });
      },
    ), load(
      apiClient.get('/stores', { params: { pageSize: 6, municipalityId: townId } }),
      (res) => {
        setNearbyStores(res.data || []);
        patchCache({ nearbyStores: res.data || [] });
      },
    )]);
  }, [townId, user?.id, whenIdle]);

  useEffect(() => {
    let cancelled = false;
    loadSections(() => !cancelled, { below: false });
    return () => { cancelled = true; };
  }, [loadSections]);

  // The sections below the first screen, once they are near.
  useEffect(() => {
    if (!belowNear) return undefined;
    let cancelled = false;
    loadSections(() => !cancelled, { top: false });
    return () => { cancelled = true; };
    // Once when they come near (and again if the town or person changes).
  }, [belowNear, loadSections]);

  // Pulled down: the sections again, and Available Today with them.
  const [todayKey, setTodayKey] = useState(0);
  const pull = useBrandRefresh(() => {
    setTodayKey((key) => key + 1);
    return loadSections();
  });

  const loadMoreExplore = useCallback(async () => {
    if (exploreBusy.current || !exploreHasMore) return;
    exploreBusy.current = true;
    setExploreLoading(true);
    setExploreFailed(false);
    try {
      const nextPage = explorePage + 1;
      const res = await fetchForYou(user?.id, { page: nextPage, pageSize: EXPLORE_BATCH, skip: SUGGESTED });
      const seen = new Set(explore.map((p) => p.id));
      const next = [...explore, ...(res.data || []).filter((p) => !seen.has(p.id))];
      const hasNext = Boolean(res.pagination?.hasNext);
      setExplore(next);
      setExplorePage(nextPage);
      setExploreHasMore(hasNext);
      exploreSaved.current = nextPage;
      // Remembered, so coming back finds everything loaded so far.
      patchCache({ explore: next, explorePage: nextPage, exploreHasMore: hasNext });
    } catch {
      // No retry loop: a quiet "Try again" under the grid instead.
      setExploreFailed(true);
    } finally {
      exploreBusy.current = false;
      setExploreLoading(false);
    }
  }, [explore, explorePage, exploreHasMore, user?.id]);

  // Near the bottom (about a screen and a half to go): the next batch, so it
  // is usually there before the grid runs out. Not after a failure; that
  // waits for "Try again".
  const tileWidth = gridCellWidth(width);
  const suggested = featured.slice(0, SUGGESTED);
  const renderExplore = useCallback(({ item }) => (
    <Card product={item} variant="home" style={{ width: tileWidth }} />
  ), [tileWidth]);

  return (
    <View style={styles.screen}>
      <HomeHeader />
      <FlatList
        {...pull.listProps}
        // The Explore grid is the list; everything above it is the
        // header. Only Explore grows -- it loads another page each time
        // you reach the bottom -- so it is the only part that has to be
        // virtualised, and the sections above are a fixed handful.
        data={explore}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        renderItem={renderExplore}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onEndReached={() => { if (!exploreFailed) loadMoreExplore(); }}
        onEndReachedThreshold={1.5}
        // Only until the sections below the first screen have been asked
        // for; then (on Android) it is undefined and nothing runs on scroll.
        onScroll={belowNear && Platform.OS !== 'ios' ? undefined : (e) => {
          pull.trackPull(e);
          if (!belowNear && e.nativeEvent.contentOffset.y > 120) whenIdle(() => setBelowNear(true));
        }}
        {...scrollEvents}
        scrollEventThrottle={Platform.OS === 'ios' ? 32 : 250}
        // Rows off screen are detached on Android rather than kept in the
        // view tree, and only a screenful or so is built at a time.
        removeClippedSubviews
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        // iOS 26: the glass tab bar floats over the page; the last row scrolls clear of it.
        {...tabScroll}
        ListHeaderComponent={(
          <>
            <QuickSearch />

        {/* Banners */}
        <View style={styles.bannerSection}>
          <Banners banners={banners} />
        </View>

        {/* The way in to the rest of the app: two pages of ten, swiped. */}
        <Shortcuts />

        {/* Shop by Category: pictures, or gradient icons (Settings › Branding) */}
        <View style={[styles.whiteSection, styles.railSection]}>
          <Text style={styles.categoriesTitle} accessibilityRole="header">Shop by Category</Text>
          <Categories categories={categories} icons={categoryIcons} />
        </View>

        {/* Shops selling live right now (hidden when none). */}
        <Live />

        {/* Available Today: fresh items for a limited time (hidden when none). */}
        <TodayRail refreshKey={todayKey} />

        {/* Suggested for You */}
        <View style={styles.listSection}>
          <SectionHeader title="Suggested for You" />
          {featured.length > 0 ? <ProductGrid products={suggested} tileWidth={tileWidth} /> : (
            <HomeEmpty
              art="products"
              title="No suggestions yet"
              body="Browse local products and we’ll suggest more like them."
              action="Browse products"
              onAction={() => router.push('/products')}
            />
          )}
        </View>

        {/* Stores Near You */}
        <View style={styles.listSection}>
          <SectionHeader title="Stores Near You" arrowLabel="View all stores" onArrow={() => router.push('/stores')} />
          {nearbyStores.length > 0 ? (
            <StoreRow stores={nearbyStores} />
          ) : (
            <HomeEmpty
              art="stores"
              title="No stores near you yet"
              body="Shops in your municipality will show up here as they open."
              action="See all stores"
              onAction={() => router.push('/stores')}
            />
          )}
        </View>

        {/* Explore Municipals */}
        <View style={[styles.whiteSection, styles.railSection]}>
          <SectionHeader
            title="Explore Municipals"
            arrowLabel="View all municipalities"
            onArrow={() => router.push('/stores')}
            style={styles.railHeader}
          />
          <Towns municipalities={municipalities} />
        </View>

        {/* Discover Stores: only a way in. Nothing of the map is loaded on
            Home -- not the shops (GET /stores/map, the largest answer Home
            asked for) and not one map tile; the full map (app/store-map.js)
            loads them when it is opened. */}
        <View style={[styles.whiteSection, styles.mapSection]}>
          <SectionHeader title="Discover Stores" arrowLabel="Open the stores map" onArrow={() => router.push('/store-map')} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open the full stores map"
            onPress={() => router.push('/store-map')}
            style={({ pressed }) => [styles.mapCard, pressed && styles.mapCardPressed]}
          >
            <MapArt size={56} />
            <View style={styles.mapCopy}>
              <Text style={styles.mapTitle}>Every shop on the map</Text>
              <Text style={styles.mapBody}>Find the shops in your town and get directions.</Text>
              <View style={styles.mapOpen}>
                <MapTrifoldIcon size={16} weight="fill" color="#fff" />
                <Text style={styles.mapOpenText}>Open full map</Text>
              </View>
            </View>
          </Pressable>
        </View>

            {/* Explore Products: the heading here, the grid below as
                the list's own rows. */}
            <View style={[styles.listSection, styles.exploreSection, styles.exploreHead]}>
              <SectionHeader title="Explore Products" arrowLabel="View all products" onArrow={() => router.push('/products')} />
            </View>
          </>
        )}
        ListFooterComponent={(
          <View style={styles.exploreEnd}>
            {exploreLoading ? <ActivityIndicator color={t.primary[600]} accessibilityLabel="Loading more products" /> : null}
            {!exploreLoading && exploreFailed ? (
              <Pressable accessibilityRole="button" onPress={loadMoreExplore} hitSlop={8}>
                <Text style={styles.exploreRetry}>Couldn’t load more · <Text style={styles.exploreRetryLink}>Try again</Text></Text>
              </Pressable>
            ) : null}
            {!exploreHasMore && explore.length > 0 ? <Text style={styles.exploreDone}>You’ve seen everything for now</Text> : null}
          </View>
        )}
      />

      {/* Floating “Start selling” (buyers and guests; drag it, or × to hide it for a week). */}
      <StartSellingBubble />

      {pull.indicator}
      {popup ? <PromotionPopup banner={popup} onClose={() => setPopup(null)} /> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1, backgroundColor: t.neutral[100] },
  content: { paddingBottom: 0 },

  bannerSection: { backgroundColor: t.neutral[0] },

  // White bands 12px apart (categories, municipals, the map).
  whiteSection: { marginTop: 12, paddingVertical: 16, backgroundColor: t.neutral[0] },
  railSection: { paddingLeft: 12 },
  railHeader: { paddingRight: 12 },
  categoriesTitle: { paddingRight: 12, marginBottom: 12, fontSize: 18, lineHeight: 22.5, ...font(500), color: t.neutral[900] },
  mapSection: { paddingHorizontal: 12 },
  mapCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14,
    backgroundColor: t.primary[50],
  },
  mapCardPressed: { opacity: 0.85 },
  mapCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: 4 },
  mapTitle: { fontSize: 15.5, lineHeight: 20, ...font(600), color: t.neutral[900] },
  mapBody: { fontSize: 13, lineHeight: 18, ...font(400), color: t.neutral[600] },
  mapOpen: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.primary[600],
  },
  mapOpenText: { fontSize: 13.5, lineHeight: 17, color: t.onBrand, ...font(600) },

  // Sections on the page background (Suggested, Stores, Explore).
  listSection: { paddingTop: 16, paddingBottom: 4, paddingHorizontal: SECTION_EDGE },
  exploreSection: { paddingBottom: 8 },
  // Pulled back out of listSection's margin, so the cards reach the same
  // GRID_EDGE as the Explore rows below while the heading above them does not.
  grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP,
    marginHorizontal: GRID_BLEED,
  },
  // The list's own rows: the same gap and sides the wrapped grid above
  // gets from listSection.
  gridRow: { gap: GRID_GAP, paddingHorizontal: GRID_EDGE, marginBottom: GRID_GAP },
  exploreHead: { paddingBottom: 0 },

  // Under the grid: a spinner while the next batch loads, "Try again", or the end.
  exploreEnd: { minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 20 },
  exploreRetry: { fontSize: 13.5, lineHeight: 18, ...font(400), color: t.neutral[500] },
  exploreRetryLink: { ...font(500), color: t.primary[600] },
  exploreDone: { fontSize: 13, lineHeight: 17, ...font(400), color: t.neutral[400] },
}));
