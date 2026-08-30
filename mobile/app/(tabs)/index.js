import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRightIcon as ArrowRight, SparkleIcon as Sparkles, CameraIcon as Camera, MagnifyingGlassIcon as Search } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import ProductCard from '../../src/components/ProductCard';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import { ProductGridSkeleton } from '../../src/components/SkeletonLayouts';
import { getCacheEntry, getCachedData, refreshCachedData } from '../../src/lib/dataCache';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

// Mirrors web's Header.jsx logo + header-search (flat gray bar, camera + search buttons).
function HomeHeader() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    if (!query.trim()) return;
    router.push({ pathname: '/products', params: { q: query.trim() } });
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Image source={require('../../assets/brand-icon.png')} style={styles.logoIcon} />
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search products..."
          placeholderTextColor={colors.gray400}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <Pressable
          style={styles.searchCameraBtn}
          onPress={() => router.push('/search-by-image')}
          hitSlop={8}
        >
          <Camera size={18} color={colors.gray400} />
        </Pressable>
        <Pressable style={styles.searchBtn} onPress={handleSearch} hitSlop={8}>
          <Search size={18} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

// Mirrors web/src/pages/Home.jsx: banner carousel, Shop by Category, Suggested for You.
// The "Mobile App" QR promo card is dropped (redundant on the mobile app itself);
// the side-by-side banner grid becomes a stacked layout to suit narrow screens.
const BANNERS = [
  require('../../assets/banners/banner-qoute.png'),
  require('../../assets/banners/buy-now-qoute.png'),
  require('../../assets/banners/discover-mindoro.png'),
];

const AUTO_ADVANCE_MS = 5000;
const HOME_CACHE_KEY = 'home:data';
const HOME_CACHE_TTL = 2 * 60 * 1000;
const SUGGESTED_PAGE_SIZE = 8;

function BannerCarousel() {
  const { width } = useWindowDimensions();
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [width]);

  const onMomentumScrollEnd = (e) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(next);
  };

  return (
    <View style={styles.bannerWrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
      >
        {BANNERS.map((src, i) => (
          <Image key={i} source={src} style={[styles.bannerImage, { width }]} resizeMode="cover" />
        ))}
      </ScrollView>
      <View style={styles.bannerDots}>
        {BANNERS.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const initialData = getCacheEntry(HOME_CACHE_KEY)?.data;
  const [categories, setCategories] = useState(initialData?.categories || []);
  const [featuredProducts, setFeaturedProducts] = useState(initialData?.products || []);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [suggestedPage, setSuggestedPage] = useState(1);
  const [suggestedTotalPages, setSuggestedTotalPages] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchHomeData = useCallback(async () => {
    const fresh = getCachedData(HOME_CACHE_KEY, HOME_CACHE_TTL);
    if (fresh) {
      setCategories(fresh.categories);
      setFeaturedProducts(fresh.products);
      setSuggestedTotalPages(fresh.totalPages || 1);
      setIsLoading(false);
      return;
    }
    try {
      const data = await refreshCachedData(HOME_CACHE_KEY, async () => {
        const [catRes, prodRes] = await Promise.all([
          apiClient.get(ENDPOINTS.CATEGORIES),
          apiClient.get(ENDPOINTS.PRODUCTS, { params: { pageSize: SUGGESTED_PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' } }),
        ]);
        return { categories: catRes.data || [], products: prodRes.data || [], totalPages: prodRes.pagination?.totalPages || 1 };
      });
      setCategories(data.categories);
      setFeaturedProducts(data.products);
      setSuggestedTotalPages(data.totalPages);
      setSuggestedPage(1);
    } catch (err) {
      toast.error('Failed to load home data', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  const loadMoreSuggested = useCallback(async () => {
    if (isLoading || isLoadingMore || suggestedPage >= suggestedTotalPages) return;
    const nextPage = suggestedPage + 1;
    setIsLoadingMore(true);
    try {
      const response = await apiClient.get(ENDPOINTS.PRODUCTS, {
        params: { page: nextPage, pageSize: SUGGESTED_PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
      });
      setFeaturedProducts((current) => [...current, ...(response.data || [])]);
      setSuggestedPage(nextPage);
      setSuggestedTotalPages(response.pagination?.totalPages || suggestedTotalPages);
    } catch (err) {
      toast.error('Could not load more products', err.message);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, suggestedPage, suggestedTotalPages]);

  return (
    <View style={styles.screen}>
      <HomeHeader />
      <ScrollView
        contentContainerStyle={styles.content}
        scrollEventThrottle={200}
        onScroll={({ nativeEvent }) => {
          const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 300) {
            loadMoreSuggested();
          }
        }}
      >
        <BannerCarousel />

        {/* Seller CTA card — mirrors web's banner-card-seller */}
        <Pressable
          style={styles.sellerCard}
          onPress={() => toast.info('Seller registration', 'Coming soon on mobile — use the web app for now.')}
        >
          <View style={styles.sellerBadge}>
            <Text style={styles.sellerBadgeText}>FREE</Text>
          </View>
          <Text style={styles.sellerTitle}>Sell on Emoorm</Text>
          <Text style={styles.sellerText}>Reach buyers across Oriental Mindoro.</Text>
          <View style={styles.sellerButton}>
            <Text style={styles.sellerButtonText}>Register</Text>
            <ArrowRight size={16} color={colors.secondary} />
          </View>
        </Pressable>

        {isLoading ? (
          <HomeSkeleton />
        ) : (
          <>
            {/* Shop by Category */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Shop by Category</Text>
              <View style={styles.categoriesGrid}>
                {categories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    style={styles.categoryCard}
                    onPress={() => router.push({ pathname: '/products', params: { category: cat.id } })}
                  >
                    <View style={styles.categoryImageWrap}>
                      {cat.image ? (
                        <Image source={{ uri: resolveImg(cat.image) }} style={styles.categoryImage} resizeMode="cover" />
                      ) : (
                        <Sparkles size={20} color={colors.secondary} />
                      )}
                    </View>
                    <Text style={styles.categoryName} numberOfLines={1}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Suggested for You */}
            <View style={[styles.section, styles.suggestedSection]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Suggested for You</Text>
              </View>

              {featuredProducts.length > 0 ? (
                <View style={styles.productsGrid}>
                  {featuredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      name={product.name}
                      price={product.price}
                      imageUrl={resolveImg(product.images?.[0])}
                      reviewCount={product.reviewCount}
                      onPress={() => router.push(`/product/${product.slug}`)}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Browse local products from Oriental Mindoro sellers</Text>
              )}

              {isLoadingMore ? <ActivityIndicator color={colors.primary} style={styles.loadMoreSpinner} /> : null}
              {!isLoadingMore && featuredProducts.length > 0 && suggestedPage >= suggestedTotalPages ? (
                <Text style={styles.endText}>You've reached the end</Text>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function HomeSkeleton() {
  return (
    <View accessibilityLabel="Loading home content">
      <View style={styles.section}>
        <LoadingSkeleton width={152} height={20} style={styles.skeletonTitle} />
        <View style={styles.categorySkeletons}>
          {Array.from({ length: 4 }, (_, index) => (
            <View key={index} style={styles.categorySkeleton}>
              <LoadingSkeleton width={64} height={64} borderRadius={radius.lg} />
              <LoadingSkeleton width={56} height={11} />
            </View>
          ))}
        </View>
      </View>
      <LoadingSkeleton width={168} height={20} style={styles.productSkeletonTitle} />
      <ProductGridSkeleton count={4} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingBottom: spacing.xxl },
  skeletonTitle: { marginBottom: spacing.lg },
  categorySkeletons: { flexDirection: 'row', justifyContent: 'space-between' },
  categorySkeleton: { width: '22%', alignItems: 'center', gap: spacing.sm },
  productSkeletonTitle: { marginHorizontal: spacing.lg, marginTop: spacing.sm },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  logoIcon: { width: 32, height: 32, borderRadius: radius.base },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    backgroundColor: colors.gray100,
    borderRadius: radius.base,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.sm,
    color: colors.textPrimary,
    ...typography.body,
  },
  searchCameraBtn: { paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  searchBtn: {
    width: 38,
    height: '100%',
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bannerWrap: { height: 200, backgroundColor: colors.gray100 },
  bannerImage: { height: 200 },
  bannerDots: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: { width: 6, height: 6, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotActive: { width: 18, backgroundColor: colors.white },

  sellerCard: {
    margin: spacing.lg,
    marginBottom: 0,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.secondary,
    gap: spacing.xs,
  },
  sellerBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.base,
    backgroundColor: colors.accentYellow,
  },
  sellerBadgeText: { ...typography.caption, fontWeight: '700', fontFamily: fontFamily.bold, color: '#78350f' },
  sellerTitle: { ...typography.h2, color: colors.white },
  sellerText: { ...typography.caption, color: 'rgba(255,255,255,0.9)' },
  sellerButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.base,
    backgroundColor: colors.white,
  },
  sellerButtonText: { ...typography.caption, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.secondary },

  section: { padding: spacing.lg },
  suggestedSection: { backgroundColor: colors.bgSecondary, paddingVertical: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },

  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: { width: '22%', alignItems: 'center', gap: spacing.xs },
  categoryImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.bgGreenLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryImage: { width: '100%', height: '100%' },
  categoryName: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },

  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  loadMoreSpinner: { marginTop: spacing.lg },
  endText: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
