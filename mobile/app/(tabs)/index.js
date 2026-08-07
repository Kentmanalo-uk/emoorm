import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Sparkles, Camera, Search } from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import ProductCard from '../../src/components/ProductCard';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

// Mirrors web's Header.jsx logo + header-search (flat gray bar, camera + search buttons).
function HomeHeader() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  const handleSearch = () => {
    if (!query.trim()) return;
    toast.info('Search', 'Product search lands in Phase 3.');
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
          onPress={() => toast.info('Image search', 'Search by image lands in a future phase.')}
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
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function BannerCarousel() {
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
        return next;
      });
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, []);

  const onMomentumScrollEnd = (e) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
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
          <Image key={i} source={src} style={styles.bannerImage} resizeMode="cover" />
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
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHomeData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        apiClient.get(ENDPOINTS.CATEGORIES),
        apiClient.get(ENDPOINTS.PRODUCTS, { params: { pageSize: 8, sortBy: 'createdAt', sortOrder: 'desc' } }),
      ]);
      setCategories(catRes.data || []);
      setFeaturedProducts(prodRes.data || []);
    } catch (err) {
      toast.error('Failed to load home data', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  return (
    <View style={styles.screen}>
      <HomeHeader />
      <ScrollView contentContainerStyle={styles.content}>
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
          <ActivityIndicator color={colors.primary} style={styles.loader} />
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
                    onPress={() => toast.info('Browse products', 'Category browsing lands in Phase 3.')}
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
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Suggested for You</Text>
                <Pressable
                  style={styles.sectionLinkRow}
                  onPress={() => toast.info('Browse products', 'Full product browsing lands in Phase 3.')}
                >
                  <Text style={styles.sectionLink}>View all</Text>
                  <ArrowRight size={14} color={colors.secondary} />
                </Pressable>
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
                      onPress={() => toast.info('Product details', 'Product details land in Phase 3.')}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyText}>Browse local products from Oriental Mindoro sellers</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingBottom: spacing.xxl },
  loader: { marginTop: spacing.xxl },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
  bannerImage: { width: SCREEN_WIDTH, height: 200 },
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  sectionLinkRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionLink: { ...typography.caption, color: colors.secondary, fontWeight: '600', fontFamily: fontFamily.semiBold },

  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: { width: '22%', alignItems: 'center', gap: spacing.xs },
  categoryImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.full,
    backgroundColor: colors.bgGreenLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryImage: { width: '100%', height: '100%' },
  categoryName: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },

  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
