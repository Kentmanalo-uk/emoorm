import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import apiClient from '../../src/api/client';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { getCacheEntry, setCachedData } from '../../src/lib/dataCache';
import { fetchCategories, fetchMunicipalities } from '../../src/lib/referenceData';
import useAuthStore from '../../src/store/authStore';
import ProductCard from '../../src/components/ProductCard';
import HomeHeader, { HomeQuickSearch } from '../../src/components/HomeHeader';
import HomeTodayRail from '../../src/components/home/HomeTodayRail';
import HomeStoresMap from '../../src/components/home/HomeStoresMap';
import HomeFooter from '../../src/components/home/HomeFooter';
import {
  BannerCarousel, FALLBACK_BANNERS, PromotionPopup, SideBanners,
} from '../../src/components/home/HomeBanners';
import {
  CategoryStrip, HomeEmpty, HomeStoreCard, MunicipalityRail, SectionHeader,
} from '../../src/components/home/HomeSections';
import { font, t } from '../../src/theme';

/*
 * Home (web/src/pages/Home.jsx, phone view): quick search words, the banner
 * carousel and the two side banners, Shop by Category, Available Today,
 * Suggested for You, Stores Near You, Explore Municipals, Discover Stores
 * (the map) and Explore Products with "Load more".
 */

// Phones: 5 rows of the 2-column grid per "Load more".
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
  const router = useRouter();
  const { width } = useWindowDimensions();
  const user = useAuthStore((s) => s.user);
  const townId = user?.municipalityId || undefined;
  const [cache] = useState(readCache);
  const [atTop, setAtTop] = useState(true);

  const [banners, setBanners] = useState(() => cache.banners || FALLBACK_BANNERS);
  const [sideBanners, setSideBanners] = useState(() => cache.sideBanners || { top: null, bottom: null });
  const [sideReady, setSideReady] = useState(() => Boolean(cache.sideBanners));
  const [popup, setPopup] = useState(null);

  const [categories, setCategories] = useState(() => cache.categories || []);
  const [categoryIcons, setCategoryIcons] = useState(() => cache.categoryStyle === 'ICON');
  const [appLogo, setAppLogo] = useState(() => cache.appLogo || null);
  const [municipalities, setMunicipalities] = useState(() => cache.municipalities || []);
  const [featured, setFeatured] = useState(() => cache.featured || []);
  const [nearbyStores, setNearbyStores] = useState(() => cache.nearbyStores || []);
  const [mappedStores, setMappedStores] = useState(() => cache.mappedStores || []);
  const [explore, setExplore] = useState(() => cache.explore || []);
  const [explorePage, setExplorePage] = useState(() => cache.explorePage || 1);
  const [exploreHasMore, setExploreHasMore] = useState(() => Boolean(cache.exploreHasMore));
  const [exploreLoading, setExploreLoading] = useState(false);
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
      setAppLogo(settings.appLogo || null);
      patchCache({ categoryStyle: style, appLogo: settings.appLogo || null });
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
    load(
      apiClient.get('/stores', { params: { pageSize: 100 } }),
      (res) => {
        const mapped = (res.data || []).filter((store) => store.latitude != null && store.longitude != null);
        setMappedStores(mapped);
        patchCache({ mappedStores: mapped });
      },
    );
    return () => { cancelled = true; };
  }, [townId]);

  const loadMoreExplore = useCallback(async () => {
    setExploreLoading(true);
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
    } catch (err) {
      toast.error(err.message || 'Failed to load more products');
    } finally {
      setExploreLoading(false);
    }
  }, [explore, explorePage]);

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
      <HomeHeader atTop={atTop} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        scrollEventThrottle={32}
        onScroll={({ nativeEvent }) => {
          // As the website: "at the top" means less than 4px down.
          const top = nativeEvent.contentOffset.y < 4;
          if (top !== atTop) setAtTop(top);
        }}
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
            <View style={styles.storesGrid}>
              {nearbyStores.map((store) => <HomeStoreCard key={store.id} store={store} />)}
            </View>
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
          <SectionHeader title="Discover Stores" arrowLabel="Browse all stores" onArrow={() => router.push('/stores')} />
          <HomeStoresMap stores={mappedStores} height={340} />
        </View>

        {/* Explore Products */}
        <View style={[styles.listSection, styles.exploreSection]}>
          <SectionHeader title="Explore Products" arrowLabel="View all products" onArrow={() => router.push('/products')} />
          {explore.length > 0 ? grid(explore) : null}
          {exploreHasMore ? (
            <Pressable
              accessibilityRole="button"
              onPress={loadMoreExplore}
              disabled={exploreLoading}
              style={({ pressed }) => [styles.loadMore, exploreLoading && styles.loadMoreBusy, pressed && styles.loadMorePressed]}
            >
              <Text style={styles.loadMoreText}>{exploreLoading ? 'Loading…' : 'Load more'}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* The website's footer: on phones it shows on the homepage only. */}
        <HomeFooter municipalities={municipalities} categories={categories} appLogo={appLogo} />
      </ScrollView>

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

  // Sections on the page background (Suggested, Stores, Explore).
  listSection: { paddingTop: 16, paddingBottom: 4, paddingHorizontal: 12 },
  exploreSection: { paddingBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  storesGrid: { gap: 12 },

  loadMore: {
    marginTop: 16, minHeight: 44, paddingVertical: 12, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.primary[600], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  loadMoreBusy: { opacity: 0.6 },
  loadMorePressed: { backgroundColor: t.primary[50] },
  loadMoreText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: t.primary[600] },
});
