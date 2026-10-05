import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CaretDownIcon, CaretLeftIcon, CaretUpIcon, MagnifyingGlassIcon, MapPinIcon, SlidersHorizontalIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import Chip from '../../src/components/Chip';
import ProductCard from '../../src/components/ProductCard';
import SearchCameraGlyph from '../../src/components/search/SearchCameraGlyph';
import SearchFilterSheet from '../../src/components/search/SearchFilterSheet';
import {
  SearchResultsEmpty, SearchResultsError, SearchSkeletonCards, SkeletonBar,
} from '../../src/components/search/SearchResultsStates';
import { readImageSearch } from '../../src/components/search/imageSearchStore';
import { saveRecent } from '../../src/lib/shellSearch';
import { fetchCategories, fetchMunicipalities } from '../../src/lib/referenceData';
import { font, t } from '../../src/theme';

// The API's sortBy and sortOrder for each sort choice (web Products.jsx SORTS).
const SORTS = {
  // A search's default: the words in the name first (the API ranks them).
  relevance: { sortBy: 'relevance', sortOrder: 'desc' },
  newest: { sortBy: 'createdAt', sortOrder: 'desc' },
  oldest: { sortBy: 'createdAt', sortOrder: 'asc' },
  'price-low': { sortBy: 'price', sortOrder: 'asc' },
  'price-high': { sortBy: 'price', sortOrder: 'desc' },
  'top-sales': { sortBy: 'orderCount', sortOrder: 'desc' },
  'name-asc': { sortBy: 'name', sortOrder: 'asc' },
  'name-desc': { sortBy: 'name', sortOrder: 'desc' },
};
const PAGE_SIZE = 20;

/** GET /products parameters for the list as filtered and paged. */
const listParams = ({ page, category, municipalityId, search, minPrice, maxPrice, sort }) => {
  const params = { page, pageSize: PAGE_SIZE };
  if (category) params.categoryId = category;
  if (municipalityId) params.municipalityId = municipalityId;
  if (search) params.search = search;
  if (minPrice) params.minPrice = minPrice;
  if (maxPrice) params.maxPrice = maxPrice;
  if (sort && SORTS[sort]) Object.assign(params, SORTS[sort]);
  return params;
};

// Each filtered list remembers what it showed, for this app run (web pageCache):
// shown at once when asked for again, then refreshed.
const listCache = new Map();
const listKey = (params) => `products:${JSON.stringify(params)}`;

const str = (v) => (typeof v === 'string' ? v : '');

/**
 * Phones: the search results (web/src/pages/Products.jsx, its phone branch,
 * and Products.css .srch-m-*). Reads the website's URL: ?q= &category=
 * &municipalityId= &minPrice= &maxPrice= &sort= and ?imageSearch=1.
 * A search bar that opens the search page, sort tabs, filter chips opening
 * the filter sheet, the count, then a two-column grid that loads more as it
 * scrolls.
 */
export default function Products() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  // Two columns 4 apart inside the 12px sides (.products-grid), a lone card too.
  const cellW = (screenW - 24 - 4) / 2;
  const params = useLocalSearchParams();

  const searchQuery = str(params.q);
  const selectedCategory = str(params.category);
  const municipalityId = str(params.municipalityId);
  const minParam = str(params.minPrice);
  const maxParam = str(params.maxPrice);
  const imageSearch = str(params.imageSearch) === '1';
  // No sort chosen: a search ranks by best match, browsing by newest.
  const sortBy = str(params.sort) && SORTS[str(params.sort)] ? str(params.sort) : (searchQuery ? 'relevance' : 'newest');

  const firstParams = useMemo(() => listParams({
    page: 1, category: selectedCategory, municipalityId, search: searchQuery, minPrice: minParam, maxPrice: maxParam, sort: sortBy,
  }), [selectedCategory, municipalityId, searchQuery, minParam, maxParam, sortBy]);
  const saved = imageSearch ? null : listCache.get(listKey(firstParams));

  const [products, setProducts] = useState(() => saved?.products || []);
  const [total, setTotal] = useState(() => saved?.total || 0);
  const [totalPages, setTotalPages] = useState(() => saved?.totalPages || 0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  // The words the results are for, when the search had a typo.
  const [corrected, setCorrected] = useState('');
  const [imageSearchPreview, setImageSearchPreview] = useState('');
  const [categories, setCategories] = useState([]);
  const [municipalities, setMunicipalities] = useState([]);
  // The filter sheet: null, or the chip that opened it ('all' | 'municipality' | 'category' | 'price').
  const [filterSheet, setFilterSheet] = useState(null);
  // Only the latest request is shown: an earlier one can answer after it.
  const latestRequest = useRef(0);
  const listRef = useRef(null);

  useEffect(() => {
    let live = true;
    fetchCategories().then((list) => { if (live) setCategories(list || []); }).catch(() => {});
    fetchMunicipalities().then((list) => { if (live) setMunicipalities(list || []); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const fetchProducts = useCallback(async () => {
    const key = listKey(firstParams);
    const request = ++latestRequest.current;
    // Shown before: at once, then refreshed. New filters: the skeleton.
    const kept = listCache.get(key);
    if (kept) {
      setProducts(kept.products);
      setTotal(kept.total);
      setTotalPages(kept.totalPages);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setPage(1);
    setLoadError('');
    try {
      const response = await apiClient.get('/products', { params: firstParams });
      if (request !== latestRequest.current) return;
      const list = response.data || [];
      setProducts(list);
      setCorrected(response.correctedSearch || '');
      setTotal(response.pagination?.total || 0);
      setTotalPages(response.pagination?.totalPages || 0);
      listCache.set(key, { products: list, total: response.pagination?.total || 0, totalPages: response.pagination?.totalPages || 0 });
    } catch (error) {
      if (request !== latestRequest.current) return;
      // Offline and the like: the list shown last time stays.
      if (!kept) {
        setProducts([]);
        setLoadError(error?.message || 'Failed to load products');
      }
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  }, [firstParams]);

  useEffect(() => {
    if (imageSearch) {
      latestRequest.current += 1;
      const stored = readImageSearch();
      setProducts(stored.results);
      setImageSearchPreview(stored.previewUrl);
      setTotal(stored.results.length);
      setTotalPages(1);
      setPage(1);
      setLoadError('');
      setIsLoading(false);
      return;
    }
    setImageSearchPreview('');
    fetchProducts();
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [imageSearch, fetchProducts]);

  // The next page, added under the list as it scrolls near the end.
  const loadMore = async () => {
    if (imageSearch || isLoading || isLoadingMore || loadError || page >= totalPages) return;
    const next = page + 1;
    const request = latestRequest.current;
    setIsLoadingMore(true);
    try {
      const response = await apiClient.get('/products', { params: { ...firstParams, page: next } });
      if (request !== latestRequest.current) return;
      setProducts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(response.data || []).filter((p) => !seen.has(p.id))];
      });
      setPage(next);
      if (response.pagination) {
        setTotal(response.pagination.total);
        setTotalPages(response.pagination.totalPages);
      }
    } catch {
      // The next scroll asks again.
    } finally {
      setIsLoadingMore(false);
    }
  };

  /* URL changes, as the website's updateURL: empty values drop the key. */
  const updateURL = (changes) => {
    const next = {};
    Object.entries(changes).forEach(([key, value]) => { next[key] = value ? String(value) : undefined; });
    router.setParams(next);
  };

  const openSearchPage = () => router.push(searchQuery ? { pathname: '/search', params: { edit: searchQuery } } : '/search');
  const runSearch = (term) => {
    const q = term.trim();
    if (!q) return;
    saveRecent(q);
    router.push({ pathname: '/products', params: { q } });
  };
  const phoneBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // A sort tab, and filters from the sheet; each starts the list again.
  const pickSort = (sort) => {
    const fallback = searchQuery ? 'relevance' : 'newest';
    updateURL({ sort: sort === fallback ? '' : sort });
  };
  const applyFilters = (changes) => {
    const next = {};
    if ('category' in changes) next.category = changes.category;
    if ('municipalityId' in changes) next.municipalityId = changes.municipalityId;
    if ('minPrice' in changes || 'maxPrice' in changes) {
      next.minPrice = changes.minPrice || '';
      next.maxPrice = changes.maxPrice || '';
    }
    updateURL(next);
  };
  const resetFilters = () => applyFilters({ category: '', municipalityId: '', minPrice: '', maxPrice: '' });

  const priceActive = Boolean(minParam || maxParam);
  const activeCategoryName = categories.find((c) => c.id === selectedCategory)?.name;
  const activeMunicipalityName = municipalities.find((m) => m.id === municipalityId)?.name;
  const filterCount = [selectedCategory, municipalityId, priceActive].filter(Boolean).length;
  const priceLabel = priceActive
    ? (maxParam ? `₱${minParam || 0} – ₱${maxParam}` : `₱${minParam} and up`)
    : 'Price';
  const priceOn = sortBy === 'price-low' || sortBy === 'price-high';

  const header = (
    <View>
      <Text style={styles.srOnly} accessibilityRole="header">
        {searchQuery ? `Results for “${searchQuery}”` : activeCategoryName || 'Products'}
      </Text>
      {!imageSearch ? (
        <>
          <View style={styles.controls}>
            <View style={styles.sorts} accessibilityRole="tablist" accessibilityLabel="Sort by">
              {searchQuery ? <SortTab label="Best match" on={sortBy === 'relevance'} onPress={() => pickSort('relevance')} /> : null}
              <SortTab label="Newest" on={sortBy === 'newest'} onPress={() => pickSort('newest')} />
              <SortTab label="Top Sales" on={sortBy === 'top-sales'} onPress={() => pickSort('top-sales')} />
              <SortTab
                label="Price"
                on={priceOn}
                accessibilityLabel={sortBy === 'price-low' ? 'Price, low to high' : sortBy === 'price-high' ? 'Price, high to low' : 'Price'}
                onPress={() => pickSort(sortBy === 'price-low' ? 'price-high' : 'price-low')}
              >
                <View style={styles.sortDir}>
                  <CaretUpIcon size={10} weight="bold" color={sortBy === 'price-low' ? t.primary[700] : t.neutral[300]} />
                  <CaretDownIcon size={10} weight="bold" color={sortBy === 'price-high' ? t.primary[700] : t.neutral[300]} />
                </View>
              </SortTab>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filters}
              accessibilityRole="toolbar"
              accessibilityLabel="Filters"
            >
              <Chip
                variant="filter"
                icon={SlidersHorizontalIcon}
                label={`Filter${filterCount ? ` (${filterCount})` : ''}`}
                active={Boolean(filterCount)}
                onPress={() => setFilterSheet('all')}
              />
              <Chip
                variant="filter"
                icon={MapPinIcon}
                label={activeMunicipalityName || 'Municipality'}
                caret
                active={Boolean(municipalityId)}
                onPress={() => setFilterSheet('municipality')}
              />
              <Chip
                variant="filter"
                label={activeCategoryName || 'Category'}
                caret
                active={Boolean(selectedCategory)}
                onPress={() => setFilterSheet('category')}
              />
              <Chip variant="filter" label={priceLabel} caret active={priceActive} onPress={() => setFilterSheet('price')} />
            </ScrollView>
          </View>

          <View style={styles.count}>
            {isLoading ? <SkeletonBar height={11} width={140} style={styles.countSkeleton} /> : (
              <Text style={styles.countText} numberOfLines={1}>
                <Text style={styles.strong}>{total}</Text> {total === 1 ? 'result' : 'results'}
                {searchQuery ? ` for “${corrected || searchQuery}”` : null}
                {corrected ? <Text style={styles.corrected}>{` (you searched “${searchQuery}”)`}</Text> : null}
                {activeMunicipalityName ? ` in ${activeMunicipalityName}` : null}
              </Text>
            )}
          </View>
        </>
      ) : (
        <View style={styles.tools}>
          {isLoading ? <SkeletonBar height={12} width={150} /> : (
            <View style={styles.imageSummary}>
              {imageSearchPreview ? <Image source={{ uri: imageSearchPreview }} style={styles.imageThumb} /> : null}
              <Text style={styles.countText} numberOfLines={1}>
                <Text style={styles.strong}>{total}</Text> matching this photo
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  let body = null;
  if (isLoading) {
    body = <View style={styles.gutter}><SearchSkeletonCards count={12} /></View>;
  } else if (loadError) {
    body = <View style={styles.gutter}><SearchResultsError message={loadError} onRetry={fetchProducts} /></View>;
  } else if (products.length === 0) {
    body = (
      <View style={styles.gutter}>
        <SearchResultsEmpty
          searchQuery={searchQuery}
          showClear={Boolean(selectedCategory || priceActive || municipalityId)}
          onClear={resetFilters}
          onSearch={runSearch}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: 10 + insets.top }]}>
        <Pressable
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
          onPress={phoneBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <CaretLeftIcon size={22} weight="bold" color={t.neutral[900]} />
        </Pressable>
        <View style={styles.field} accessibilityRole="search">
          <Pressable style={styles.fieldText} onPress={openSearchPage} accessibilityRole="button" accessibilityLabel="Search products">
            <Text style={[styles.fieldValue, !searchQuery && styles.fieldPlaceholder]} numberOfLines={1}>
              {searchQuery || 'Search products'}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.camera, pressed && styles.cameraPressed]}
            onPress={() => router.push('/search-by-image')}
            accessibilityRole="button"
            accessibilityLabel="Search by image"
          >
            <SearchCameraGlyph color={t.neutral[500]} />
          </Pressable>
          <Pressable style={styles.go} onPress={openSearchPage} accessibilityRole="button" accessibilityLabel="Search">
            <MagnifyingGlassIcon size={18} color={t.neutral[0]} />
          </Pressable>
        </View>
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={body ? [] : products}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={header}
        ListEmptyComponent={body}
        renderItem={({ item }) => (
          <View style={[styles.cell, { width: cellW }]}>
            <ProductCard product={item} variant="result" />
          </View>
        )}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        ListFooterComponent={isLoadingMore ? <ActivityIndicator color={t.primary[600]} style={styles.more} /> : null}
        contentContainerStyle={{ paddingBottom: 12 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
      />

      {!imageSearch ? (
        <SearchFilterSheet
          focus={filterSheet}
          onClose={() => setFilterSheet(null)}
          municipalities={municipalities}
          categories={categories}
          value={{ municipalityId, category: selectedCategory, minPrice: minParam, maxPrice: maxParam }}
          onChange={applyFilters}
          onReset={resetFilters}
        />
      ) : null}
    </View>
  );
}

/** A sort tab (.srch-m-sorts button): green and medium when chosen. */
function SortTab({ label, on, onPress, accessibilityLabel, children }) {
  return (
    <Pressable
      style={styles.sortTab}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel || label}
    >
      <Text style={[styles.sortText, on && styles.sortTextOn]}>{label}</Text>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },

  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingRight: 12, paddingBottom: 10, paddingLeft: 6,
    backgroundColor: t.neutral[0], borderBottomWidth: 1, borderBottomColor: t.neutral[200], zIndex: 10,
  },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  backPressed: { backgroundColor: t.neutral[100] },
  field: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'stretch', height: 44, backgroundColor: t.neutral[100] },
  fieldText: { flex: 1, minWidth: 0, justifyContent: 'center', paddingLeft: 16, paddingRight: 8 },
  // The website's input is 46 tall in the 44 field: its words sit a little low.
  fieldValue: { marginTop: 3, fontSize: 16, lineHeight: 24, ...font(400), color: t.neutral[900] },
  fieldPlaceholder: { color: t.neutral[400] },
  camera: { width: 40, alignItems: 'center', justifyContent: 'center' },
  cameraPressed: { backgroundColor: t.neutral[200] },
  go: { width: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600] },

  list: { flex: 1 },
  controls: { backgroundColor: t.neutral[0] },
  sorts: { flexDirection: 'row', alignItems: 'stretch', gap: 22, paddingHorizontal: 16 },
  sortTab: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 46 },
  sortText: { fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[600] },
  sortTextOn: { ...font(500), color: t.primary[700] },
  sortDir: { flexDirection: 'column' },
  filters: { gap: 8, paddingTop: 2, paddingHorizontal: 16, paddingBottom: 12 },

  // .products-main is a column 12 apart: the band, the count, the grid.
  count: { marginVertical: 12, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 10 },
  countSkeleton: { marginVertical: 5 },
  countText: { fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500] },
  strong: { ...font(500), color: t.neutral[900] },
  corrected: { ...font(400), color: t.neutral[500] },

  // .srch-m-tools: the summary is an inline box in a 34.6px line (web).
  tools: { marginBottom: 12, paddingTop: 14, paddingHorizontal: 12, paddingBottom: 4, minHeight: 52.6 },
  imageSummary: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  imageThumb: { width: 28, height: 28, borderRadius: 6 },

  gutter: { paddingHorizontal: 12 },
  row: { gap: 4, paddingHorizontal: 12, marginBottom: 4 },
  cell: { minWidth: 0 },
  more: { marginVertical: 16 },
});
