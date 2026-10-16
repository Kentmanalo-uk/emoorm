import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
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
import HomeStoresMap from '../../src/components/home/HomeStoresMap';
import StartSellingBubble from '../../src/components/home/StartSellingBubble';
import { MapTrifoldIcon } from 'phosphor-react-native';
import {
  BannerCarousel, FALLBACK_BANNERS, PromotionPopup, SideBanners,
} from '../../src/components/home/HomeBanners';
import {
  CategoryStrip, HomeEmpty, HomeStoreRow, MunicipalityRail, SectionHeader,
} from '../../src/components/home/HomeSections';
import { font, t } from '../../src/theme';

/*
 * Home (web/src/pages/Home.jsx, phone view): quick search words, the banner
 * carousel and the two side banners, Shop by Category, Available Today,
 * Suggested for You, Stores Near You, Explore Municipals, Discover Stores
 * (the map) and Explore Products, which loads its next batch on its own as
 * the page nears the bottom (one request at a time, small batches). The
 * website's footer lives on the About page in the app (app/about.js).
 */

// Phones: 5 rows of the 2-column grid per batch.
const EXPLORE_BATCH = 5 * 2;
const EXPLORE_QUERY = { sortBy: 'createdAt', sortOrder: 'desc' };
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
  const [sideBanners, setSideBanners] = useState(() => cache.sideBanners || { top: null, bottom: null });
  const [sideReady, setSideReady] = useState(() => Boolean(cache.sideBanners));
  const [popup, setPopup] = useState(null);

  const [categories, setCategories] = useState(() => cache.categories || []);
  const [categoryIcons, setCategoryIcons] = useState(() => cache.categoryStyle === 'ICON');
  const [municipalities, setMunicipalities] = useState(() => cache.municipalities || []);
  const [featured, setFeatured] = useState(() => cache.featured || []);
  const [nearbyStores, setNearbyStores] = useState(() => cache.nearbyStores || []);
  const [mappedStores, setMappedStores] = useState(() => cache.mappedStores || []);
  const [explore, setExplore] = useState(() => cache.explore || []);
  const [explorePage, setExplorePage] = useState(() => cache.explorePage || 1);
  const [exploreHasMore, setExploreHasMore] = useState(() => Boolean(cache.exploreHasMore));
  const [exploreLoading, setExploreLoading] = useState(false);
  const [exploreFailed, setExploreFailed] = useState(false);
  // One request at a time: scroll events come many per second.
  const exploreBusy = useRef(false);
  const exploreSaved = useRef(cache.explorePage || 1);

  // Banners: the carousel, the two side ones and the popup.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/banners');
        const list = Array.isArray(res.data) ? res.data : [];
        if (cancelled || list.length === 0) return;
        const carousel = list.filter((b) => (b.placement || 'HOME_CAROUSEL') === 'HOME_CAROUSEL').map(mapBanner);
        const top = list.find((b) => b.placement === 'HOME_SIDEBAR_TOP');
        const bottom = list.find((b) => b.placement === 'HOME_SIDEBAR_BOTTOM');
        const promo = list.find((b) => b.placement === 'HOME_POPUP');
        const side = { top: top ? mapBanner(top) : null, bottom: bottom ? mapBanner(bottom) : null };
        if (carousel.length > 0) setBanners(carousel);
        setSideBanners(side);
        patchCache({ banners: carousel.length > 0 ? carousel : null, sideBanners: side });
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
      } finally {
        if (!cancelled) setSideReady(true);
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
    fetchMunicipalities().then((list) => {
      if (cancelled) return;
      setMunicipalities(list || []);
      patchCache({ municipalities: list || [] });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Each section loads on its own and shows as soon as its answer arrives.
  useEffect(() => {
    let cancelled = false;
    const load = (request, show) => request
      .then((res) => { if (!cancelled) show(res); })
      .catch((err) => console.error('Failed to load home data:', err?.message || err));

    load(
      apiClient.get('/products', { params: { pageSize: 6, sortBy: 'createdAt', sortOrder: 'desc' } }),
      (res) => {
        setFeatured(res.data || []);
        patchCache({ featured: res.data || [] });
      },
    );
    load(
      apiClient.get('/products', { params: { ...EXPLORE_QUERY, page: 1, pageSize: EXPLORE_BATCH } }),
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
    );
    load(
      apiClient.get('/stores', { params: { pageSize: 6, municipalityId: townId } }),
      (res) => {
        setNearbyStores(res.data || []);
        patchCache({ nearbyStores: res.data || [] });
      },
    );
    // Every shop with a spot: its pin, or placed from its address (pinned: false).
    load(
      apiClient.get('/stores/map'),
      (res) => {
        const mapped = res.data || [];
        setMappedStores(mapped);
        patchCache({ mappedStores: mapped });
      },
    );
    return () => { cancelled = true; };
  }, [townId]);

  const loadMoreExplore = useCallback(async () => {
    if (exploreBusy.current || !exploreHasMore) return;
    exploreBusy.current = true;
    setExploreLoading(true);
    setExploreFailed(false);
    try {
      const nextPage = explorePage + 1;
      const res = await apiClient.get('/products', { params: { ...EXPLORE_QUERY, page: nextPage, pageSize: EXPLORE_BATCH } });
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
  }, [explore, explorePage, exploreHasMore]);

  // Near the bottom (about a screen and a half to go): the next batch, so it
  // is usually there before the grid runs out. Not after a failure; that
  // waits for "Try again".
  const onScroll = useCallback(({ nativeEvent }) => {
    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
    const left = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (left < layoutMeasurement.height * 1.5 && !exploreFailed) loadMoreExplore();
  }, [loadMoreExplore, exploreFailed]);

  // The website's phone grid: 2 columns 4px apart, 12px from the edges.
  const tileWidth = (width - 24 - 4) / 2;
  const grid = (products) => (
    <View style={styles.grid}>
      {products.map((product) => (
        <ProductCard key={product.id} product={product} variant="home" style={{ width: tileWidth }} />
      ))}
    </View>
  );

  return (
    <View style={styles.screen}>
      <HomeHeader />
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={120}
        // iOS 26: the glass tab bar floats over the page; the last row scrolls clear of it.
        {...tabScroll}
      >
        <HomeQuickSearch />

        {/* Banners */}
        <View style={styles.bannerSection}>
          <BannerCarousel banners={banners} />
          <SideBanners ready={sideReady} top={sideBanners.top} bottom={sideBanners.bottom} />
        </View>

        {/* Shop by Category: pictures, or gradient icons (Settings › Branding) */}
        <View style={[styles.whiteSection, styles.railSection]}>
          <Text style={styles.categoriesTitle} accessibilityRole="header">Shop by Category</Text>
          <CategoryStrip categories={categories} icons={categoryIcons} />
        </View>

        {/* Available Today: fresh items for a limited time (hidden when none). */}
        <HomeTodayRail />

        {/* Suggested for You */}
        <View style={styles.listSection}>
          <SectionHeader title="Suggested for You" />
          {featured.length > 0 ? grid(featured) : (
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
            <HomeStoreRow stores={nearbyStores} />
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
          <MunicipalityRail municipalities={municipalities} />
        </View>

        {/* Discover Stores map */}
        <View style={[styles.whiteSection, styles.mapSection]}>
          <SectionHeader title="Discover Stores" arrowLabel="Open the stores map" onArrow={() => router.push('/store-map')} />
          {/* A tapped pin, or the button, opens the full map (app/store-map.js). */}
          <View>
            <HomeStoresMap
              stores={mappedStores}
              height={340}
              onSelect={(store) => router.push({ pathname: '/store-map', params: { focus: store.id } })}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/store-map')}
              style={({ pressed }) => [styles.mapOpen, pressed && styles.mapOpenPressed]}
            >
              <MapTrifoldIcon size={16} weight="fill" color="#fff" />
              <Text style={styles.mapOpenText}>Open full map</Text>
            </Pressable>
          </View>
        </View>

        {/* Explore Products */}
        <View style={[styles.listSection, styles.exploreSection]}>
          <SectionHeader title="Explore Products" arrowLabel="View all products" onArrow={() => router.push('/products')} />
          {explore.length > 0 ? grid(explore) : null}
          <View style={styles.exploreEnd}>
            {exploreLoading ? <ActivityIndicator color={t.primary[600]} accessibilityLabel="Loading more products" /> : null}
            {!exploreLoading && exploreFailed ? (
              <Pressable accessibilityRole="button" onPress={loadMoreExplore} hitSlop={8}>
                <Text style={styles.exploreRetry}>Couldn’t load more · <Text style={styles.exploreRetryLink}>Try again</Text></Text>
              </Pressable>
            ) : null}
            {!exploreHasMore && explore.length > 0 ? <Text style={styles.exploreDone}>You’ve seen everything for now</Text> : null}
          </View>
        </View>
      </ScrollView>

      {/* Floating “Start selling” (buyers and guests; drag it, or × to hide it for a week). */}
      <StartSellingBubble />

      {popup ? <PromotionPopup banner={popup} onClose={() => setPopup(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  mapOpen: {
    position: 'absolute', right: 10, bottom: 22, flexDirection: 'row', alignItems: 'center', gap: 6,
    height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.primary[600],
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 12, color: 'rgba(4, 120, 87, 0.3)' }],
  },
  mapOpenPressed: { backgroundColor: t.primary[700] },
  mapOpenText: { fontSize: 13.5, lineHeight: 17, color: '#fff', ...font(600) },

  // Sections on the page background (Suggested, Stores, Explore).
  listSection: { paddingTop: 16, paddingBottom: 4, paddingHorizontal: 12 },
  exploreSection: { paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },

  // Under the grid: a spinner while the next batch loads, "Try again", or the end.
  exploreEnd: { minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingTop: 12, paddingBottom: 20 },
  exploreRetry: { fontSize: 13.5, lineHeight: 18, ...font(400), color: t.neutral[500] },
  exploreRetryLink: { ...font(500), color: t.primary[600] },
  exploreDone: { fontSize: 13, lineHeight: 17, ...font(400), color: t.neutral[400] },
});
