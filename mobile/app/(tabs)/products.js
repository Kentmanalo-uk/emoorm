import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Modal,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search, SlidersHorizontal, Grid2x2, List, Package, X, Check } from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import useCartStore from '../../src/store/cartStore';
import ProductCard from '../../src/components/ProductCard';
import EmptyState from '../../src/components/EmptyState';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import { ProductGridSkeleton } from '../../src/components/SkeletonLayouts';
import { getCacheEntry, getCachedData, refreshCachedData } from '../../src/lib/dataCache';
import { colors, control, radius, spacing, typography } from '../../src/theme';

const SORT_OPTIONS = [
  { label: 'Newest', value: 'newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { label: 'Oldest', value: 'oldest', sortBy: 'createdAt', sortOrder: 'asc' },
  { label: 'Price: Low to High', value: 'price-low', sortBy: 'price', sortOrder: 'asc' },
  { label: 'Price: High to Low', value: 'price-high', sortBy: 'price', sortOrder: 'desc' },
  { label: 'Name: A to Z', value: 'name-asc', sortBy: 'name', sortOrder: 'asc' },
  { label: 'Name: Z to A', value: 'name-desc', sortBy: 'name', sortOrder: 'desc' },
];
const PAGE_SIZE = 20;
const CATEGORIES_CACHE_KEY = 'categories:list';
const PRODUCTS_CACHE_TTL = 60 * 1000;

// Mirrors web/src/pages/Products.jsx (category/price sidebar filters become a
// modal + chip row here since there's no room for a persistent sidebar).
export default function Products() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const addItem = useCartStore((s) => s.addItem);

  const [categories, setCategories] = useState(getCacheEntry(CATEGORIES_CACHE_KEY)?.data || []);
  const [selectedCategory, setSelectedCategory] = useState(params.category || '');
  const [searchQuery, setSearchQuery] = useState(params.q || '');
  const [inputValue, setInputValue] = useState(params.q || '');
  const [sortBy, setSortBy] = useState('newest');
  const [priceRange, setPriceRange] = useState({ min: '', max: '' });
  const [draftPriceRange, setDraftPriceRange] = useState({ min: '', max: '' });
  const [viewMode, setViewMode] = useState('grid');
  const [filterModalOpen, setFilterModalOpen] = useState(false);

  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const hasActiveFilters = Boolean(selectedCategory || searchQuery || priceRange.min || priceRange.max || sortBy !== 'newest');

  useEffect(() => {
    const cached = getCachedData(CATEGORIES_CACHE_KEY, 5 * 60 * 1000);
    if (cached) return;
    refreshCachedData(CATEGORIES_CACHE_KEY, () => apiClient.get(ENDPOINTS.CATEGORIES).then((res) => res.data || []))
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const nextQuery = typeof params.q === 'string' ? params.q : '';
    const nextCategory = typeof params.category === 'string' ? params.category : '';
    setInputValue(nextQuery);
    setSearchQuery(nextQuery);
    setSelectedCategory(nextCategory);
  }, [params.q, params.category]);

  const fetchProducts = useCallback(
    async (targetPage, append) => {
      if (append) setIsLoadingMore(true);
      try {
        const sort = SORT_OPTIONS.find((s) => s.value === sortBy);
        const query = {
          page: targetPage,
          pageSize: PAGE_SIZE,
          sortBy: sort?.sortBy,
          sortOrder: sort?.sortOrder,
        };
        if (selectedCategory) query.categoryId = selectedCategory;
        if (searchQuery) query.search = searchQuery;
        if (priceRange.min) query.minPrice = priceRange.min;
        if (priceRange.max) query.maxPrice = priceRange.max;

        const cacheKey = `products:${JSON.stringify(query)}`;
        if (!append) {
          const cachedEntry = getCacheEntry(cacheKey)?.data;
          if (cachedEntry) {
            setProducts(cachedEntry.products);
            setTotal(cachedEntry.total);
            setTotalPages(cachedEntry.totalPages);
            setIsLoading(false);
          } else {
            setIsLoading(true);
          }
          if (getCachedData(cacheKey, PRODUCTS_CACHE_TTL)) return;
        }

        const loadPage = async () => {
          const response = await apiClient.get(ENDPOINTS.PRODUCTS, { params: query });
          return {
            response,
            products: response.data || [],
            total: response.pagination?.total || 0,
            totalPages: response.pagination?.totalPages || 0,
          };
        };
        const result = append ? await loadPage() : await refreshCachedData(cacheKey, loadPage);
        const res = result.response;
        setProducts((prev) => (append ? [...prev, ...(res.data || [])] : res.data || []));
        if (res.pagination) {
          setTotal(res.pagination.total);
          setTotalPages(res.pagination.totalPages);
        }
      } catch (err) {
        toast.error('Failed to load products', err.message);
        if (!append) setProducts([]);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [selectedCategory, searchQuery, sortBy, priceRange]
  );

  useEffect(() => {
    setPage(1);
    fetchProducts(1, false);
  }, [selectedCategory, searchQuery, sortBy, priceRange, fetchProducts]);

  const handleSearch = () => setSearchQuery(inputValue.trim());

  const handleAddToCart = (product) => {
    if (product.stock === 0) {
      toast.error('Out of stock');
      return;
    }
    try {
      addItem(
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.images?.[0],
          storeId: product.storeId,
          storeName: product.store?.name,
          stock: product.stock,
          slug: product.slug,
          categoryId: product.categoryId,
        },
        1
      );
      toast.success(`${product.name} added to cart`);
    } catch (err) {
      toast.error(err.message || 'Failed to add to cart');
    }
  };

  const handleLoadMore = () => {
    if (isLoadingMore || isLoading || page >= totalPages) return;
    const next = page + 1;
    setPage(next);
    fetchProducts(next, true);
  };

  const clearFilters = () => {
    setSelectedCategory('');
    setSearchQuery('');
    setInputValue('');
    setSortBy('newest');
    setPriceRange({ min: '', max: '' });
  };

  const applyPriceFilter = () => {
    setPriceRange(draftPriceRange);
    setFilterModalOpen(false);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.searchBar}>
          <Search size={16} color={colors.gray400} />
          <TextInput
            style={styles.searchInput}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Search products..."
            placeholderTextColor={colors.gray400}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
        <Pressable
          style={styles.filterBtn}
          onPress={() => {
            setDraftPriceRange(priceRange);
            setFilterModalOpen(true);
          }}
        >
          <SlidersHorizontal size={18} color={colors.textPrimary} />
        </Pressable>
        <Pressable style={styles.viewToggleBtn} onPress={() => setViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}>
          {viewMode === 'grid' ? <List size={18} color={colors.textPrimary} /> : <Grid2x2 size={18} color={colors.textPrimary} />}
        </Pressable>
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={styles.chipRowContent}
        data={[{ id: '', name: 'All' }, ...categories]}
        keyExtractor={(item) => item.id || 'all'}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.chip, selectedCategory === item.id && styles.chipActive]}
            onPress={() => setSelectedCategory(item.id)}
          >
            <Text style={[styles.chipText, selectedCategory === item.id && styles.chipTextActive]}>{item.name}</Text>
          </Pressable>
        )}
      />

      <View style={styles.resultsRow}>
        {isLoading ? (
          <LoadingSkeleton width={140} height={12} />
        ) : (
          <Text style={styles.resultsText}>
            Showing {products.length} of {total} products
          </Text>
        )}
        {hasActiveFilters ? (
          <Pressable onPress={clearFilters}>
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <ProductGridSkeleton count={6} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package size={48} color={colors.gray400} />}
          title="No products found"
          message="Try adjusting your filters or search terms"
        />
      ) : (
        <FlatList
          key={viewMode}
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={viewMode === 'grid' ? 2 : 1}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator color={colors.primary} style={styles.footerLoader} /> : null}
          renderItem={({ item }) => (
            <View style={viewMode === 'grid' ? styles.gridItem : styles.listItem}>
              <ProductCard
                name={item.name}
                price={item.price}
                imageUrl={resolveImg(item.images?.[0])}
                reviewCount={item.reviewCount}
                variant={viewMode}
                onPress={() => router.push(`/product/${item.slug}`)}
                onAddToCart={() => handleAddToCart(item)}
              />
            </View>
          )}
        />
      )}

      <Modal visible={filterModalOpen} animationType="slide" transparent onRequestClose={() => setFilterModalOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setFilterModalOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Filters</Text>
              <Pressable onPress={() => setFilterModalOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={styles.sheetSectionTitle}>Price Range</Text>
            <View style={styles.priceRow}>
              <TextInput
                style={styles.priceInput}
                placeholder="Min"
                keyboardType="numeric"
                value={draftPriceRange.min}
                onChangeText={(v) => setDraftPriceRange((p) => ({ ...p, min: v }))}
              />
              <Text style={styles.priceDash}>—</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="Max"
                keyboardType="numeric"
                value={draftPriceRange.max}
                onChangeText={(v) => setDraftPriceRange((p) => ({ ...p, max: v }))}
              />
            </View>

            <Text style={styles.sheetSectionTitle}>Sort By</Text>
            {SORT_OPTIONS.map((opt) => (
              <Pressable key={opt.value} style={styles.sortOption} onPress={() => setSortBy(opt.value)}>
                <Text style={styles.sortOptionText}>{opt.label}</Text>
                {sortBy === opt.value ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            ))}

            <Pressable style={styles.applyBtn} onPress={applyPriceFilter}>
              <Text style={styles.applyBtnText}>Apply</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.white,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: control.compactHeight,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.gray100,
    borderRadius: radius.base,
  },
  searchInput: { flex: 1, height: '100%', color: colors.textPrimary, ...typography.body },
  filterBtn: { width: control.iconSize, height: control.iconSize, borderRadius: radius.lg, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },
  viewToggleBtn: { width: control.iconSize, height: control.iconSize, borderRadius: radius.lg, backgroundColor: colors.gray100, alignItems: 'center', justifyContent: 'center' },

  chipRow: { flexGrow: 0 },
  chipRowContent: { paddingHorizontal: spacing.md, gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
    marginRight: spacing.xs,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextActive: { color: colors.white, fontWeight: '600' },

  resultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resultsText: { ...typography.caption, color: colors.textSecondary },
  clearText: { ...typography.caption, color: colors.secondary, fontWeight: '600' },

  listContent: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl },
  gridRow: { gap: spacing.sm },
  gridItem: { flex: 1, marginBottom: spacing.sm },
  listItem: { marginBottom: spacing.sm },
  footerLoader: { marginVertical: spacing.md },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: '88%' },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sheetTitle: { ...typography.h3, color: colors.textPrimary },
  sheetSectionTitle: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.xs },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  priceInput: {
    flex: 1,
    height: control.compactHeight,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.base,
    backgroundColor: colors.gray50,
    color: colors.textPrimary,
  },
  priceDash: { color: colors.textMuted },
  sortOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  sortOptionText: { ...typography.body, color: colors.textPrimary },
  applyBtn: { marginTop: spacing.lg, height: control.height, borderRadius: radius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { ...typography.body, color: colors.white, fontWeight: '600' },
});
