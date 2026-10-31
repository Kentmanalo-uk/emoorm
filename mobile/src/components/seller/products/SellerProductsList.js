import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { CaretRightIcon, PackageIcon, PlusIcon } from '../../../lib/icons';
import apiClient from '../../../api/client';
import { font, t, themed } from '../../../theme';
import { toast } from '../../../lib/toast';
import { getCacheEntry, setCachedData } from '../../../lib/dataCache';
import EmptyState from '../../EmptyState';
import OrderConfirmDialog from '../../orders/OrderConfirmDialog';
import { sellerPageStyles, useSellerTabScroll } from '../SellerPage';
import { useSellerShell } from '../SellerShell';
import { sellBlockers } from '../sellerSetup';
import { sellerHref } from '../sellerRoutes';
import { productKind } from '../productKinds';
import { isTabKey, stockWords } from './productRules';
import ProductRow from './ProductRow';
import ProductsFilterBar from './ProductsFilterBar';
import ProductsNotices from './ProductsNotices';
import { ProductMoreSheet, ProductStockSheet, ProductsStatusSheet } from './ProductSheets';
import { PageLoader } from '../../BrandLoader';

/*
 * My products, the phone list (web/src/pages/SellerProducts.jsx, isPhone
 * branch; the form is its own page, app/seller/products/new.js):
 *   what needs doing (.spm-notices), the search + status chips panel,
 *   "Create a package", the product cards, then the sheets (status, ⋯ more,
 *   add stock) and the delete confirm.
 * Same endpoints: GET /products/my/products (page, pageSize 15, search,
 * status / stock=restock), GET /products/my/summary (the counts),
 * POST /products/:id/stock { delta }, PATCH /products/bulk { ids, action },
 * DELETE /products/:id.
 * Each tab's first page is kept (as the website's readCache/writeCache) and
 * shown at once while it is asked for again. The website pages with
 * Prev / Next; the app loads the next 15 as the list nears its end.
 */
const PAGE_SIZE = 15;
const SUMMARY_KEY = 'seller:products:summary';
const viewKeyOf = (status) => `seller:products:${status}`;
const SEARCH_DELAY = 300;
// Sheet.js slides a sheet away in 240ms (iOS 26's native sheet a little
// longer) before the next modal may open.
const SHEET_CLOSE_MS = 400;

export default function SellerProductsList() {
  const tabScroll = useSellerTabScroll();
  const router = useRouter();
  const params = useLocalSearchParams();
  const urlSearch = typeof params.search === 'string' ? params.search : '';
  const urlStatus = typeof params.status === 'string' && isTabKey(params.status) ? params.status : null;

  // Until the shop is ready to sell, buyers can see its products but cannot order them.
  const { setup, refreshSetup } = useSellerShell();
  const blockers = useMemo(() => sellBlockers(setup), [setup]);

  // Seeded from ?search= / ?status= so a link opens filtered.
  const [search, setSearch] = useState(urlSearch);
  const [query, setQuery] = useState(urlSearch);
  const [status, setStatus] = useState(urlStatus || 'all');

  const [saved] = useState(() => (urlSearch ? undefined : getCacheEntry(viewKeyOf(urlStatus || 'all'))?.data));
  const [products, setProducts] = useState(() => saved?.products || []);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(() => saved?.pagination?.totalPages || 1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState(() => getCacheEntry(SUMMARY_KEY)?.data || null);

  const [statusSheet, setStatusSheet] = useState(false);
  const [moreFor, setMoreFor] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const [stockAmount, setStockAmount] = useState(1);
  const [restockingId, setRestockingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmFor, setConfirmFor] = useState(null);
  const confirmTimer = useRef(null);
  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  // The counts are extra: the list works without them.
  const loadSummary = useCallback(async () => {
    try {
      const res = await apiClient.get('/products/my/summary');
      if (res.data) {
        setSummary(res.data);
        setCachedData(SUMMARY_KEY, res.data);
      }
    } catch {
      // Keep the last counts.
    }
  }, []);

  // Only the newest request may fill the list.
  const requestId = useRef(0);
  const load = useCallback(async (pageNo = 1, { quiet = false } = {}) => {
    const id = ++requestId.current;
    if (pageNo === 1) loadSummary();
    const viewKey = pageNo === 1 && !query ? viewKeyOf(status) : null;
    if (pageNo === 1) {
      const kept = viewKey ? getCacheEntry(viewKey)?.data : undefined;
      if (kept) {
        setProducts(kept.products || []);
        if (kept.pagination) setTotalPages(kept.pagination.totalPages || 1);
        setIsLoading(false);
      } else if (!quiet) {
        setIsLoading(true);
      }
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await apiClient.get('/products/my/products', {
        params: {
          page: pageNo,
          pageSize: PAGE_SIZE,
          search: query || undefined,
          status: status !== 'all' && status !== 'restock' ? status : undefined,
          stock: status === 'restock' ? 'restock' : undefined,
        },
      });
      if (id !== requestId.current) return;
      const list = Array.isArray(res.data) ? res.data : [];
      setProducts((prev) => {
        if (pageNo === 1) return list;
        const have = new Set(prev.map((p) => p.id));
        return [...prev, ...list.filter((p) => !have.has(p.id))];
      });
      setPage(pageNo);
      if (res.pagination) setTotalPages(res.pagination.totalPages || 1);
      if (viewKey) {
        setCachedData(viewKey, {
          products: list,
          pagination: res.pagination ? { total: res.pagination.total, totalPages: res.pagination.totalPages } : null,
        });
      }
    } catch (err) {
      if (id === requestId.current) toast.error(err?.message || 'Failed to load products');
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [loadSummary, query, status]);

  // A new status or search starts again from the first page.
  useEffect(() => { load(1); }, [load]);

  // Back on the tab (e.g. from the product form): the list again, quietly,
  // so a saved product shows.
  const loadRef = useRef(load);
  loadRef.current = load;
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    loadRef.current(1, { quiet: true });
  }, []));

  // Typing searches after a short pause; the keyboard's Search at once.
  useEffect(() => {
    if (search === query) return undefined;
    const timer = setTimeout(() => setQuery(search), SEARCH_DELAY);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  const submitSearch = () => {
    if (search === query) load(1);
    else setQuery(search);
  };
  const clearSearch = () => { setSearch(''); setQuery(''); };

  // Follows ?search= and ?status= when they change (a second search from
  // elsewhere re-filters instead of leaving the first in place).
  const lastUrl = useRef({ search: urlSearch, status: urlStatus });
  useEffect(() => {
    if (urlSearch !== lastUrl.current.search) {
      setSearch(urlSearch);
      setQuery(urlSearch);
    }
    if (urlStatus && urlStatus !== lastUrl.current.status) setStatus(urlStatus);
    lastUrl.current = { search: urlSearch, status: urlStatus };
  }, [urlSearch, urlStatus]);

  const selectStatus = (key) => {
    if (key === status) return;
    setStatus(key);
  };

  const onRefresh = () => {
    setRefreshing(true);
    refreshSetup?.();
    load(1, { quiet: true });
  };

  const loadMore = () => {
    if (isLoading || loadingMore || refreshing || page >= totalPages) return;
    load(page + 1);
  };

  // ── Navigation ──
  const openNew = () => router.push('/seller/products/new?fromList=1');
  const openNewPackage = () => router.push('/seller/products/new?type=package&fromList=1');
  const openEdit = (product) => router.push({ pathname: '/seller/products/new', params: { edit: product.id, fromList: '1' } });

  // ── Stock ──
  // POST /products/:id/stock { delta } — the response is the updated product,
  // so the row is replaced in place instead of reloading the whole list.
  const changeStock = async (product, delta) => {
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error('Enter how many to add (or a minus number to remove)');
      return false;
    }
    setRestockingId(product.id);
    try {
      const res = await apiClient.post(`/products/${product.id}/stock`, { delta });
      const updated = res.data || {};
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...updated } : p)));
      loadSummary();
      const unit = stockWords(product).unit;
      const n = Math.abs(delta);
      toast.success(unit
        ? `${delta > 0 ? 'Added' : 'Removed'} ${n} ${unit(n)}`
        : delta > 0 ? `Added ${delta} to stock` : `Removed ${n} from stock`);
      return true;
    } catch (err) {
      toast.error(err?.message || 'Failed to update stock');
      return false;
    } finally {
      setRestockingId(null);
    }
  };
  const openStockSheet = (product) => {
    setStockAmount(1);
    setStockFor(product);
  };
  const saveStock = async () => {
    if (await changeStock(stockFor, Number(stockAmount))) setStockFor(null);
  };

  // ── Hide / show, delete ──
  const toggleVisibility = async (product) => {
    setBusy(true);
    try {
      const action = product.status === 'HIDDEN' ? 'UNHIDE' : 'HIDE';
      await apiClient.patch('/products/bulk', { ids: [product.id], action });
      toast.success(action === 'HIDE' ? 'Product hidden from buyers' : 'Product is live again');
      load(1, { quiet: true });
    } catch (err) {
      toast.error(err?.message || 'Failed to update product');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    const product = confirmFor;
    if (!product) return;
    setBusy(true);
    try {
      await apiClient.delete(`/products/${product.id}`);
      toast.success(productKind(product) === 'PACKAGE' ? 'Package deleted' : 'Product deleted');
      setConfirmFor(null);
      load(1, { quiet: true });
    } catch (err) {
      toast.error(err?.message || 'Failed to delete product');
    } finally {
      setBusy(false);
    }
  };

  // ── The list ──
  const header = (
    <>
      <ProductsNotices
        blockers={blockers}
        summary={summary}
        status={status}
        onFinish={() => router.push(sellerHref(blockers[0]?.to || '/seller'))}
        onSelect={selectStatus}
      />
      <ProductsFilterBar
        search={search}
        onChangeSearch={setSearch}
        onSubmitSearch={submitSearch}
        onClearSearch={clearSearch}
        status={status}
        summary={summary}
        onSelect={selectStatus}
        onOpenSheet={() => setStatusSheet(true)}
      />
      {/* Packages start here (the header's + adds a product). */}
      {!isLoading && status === 'all' && !query && products.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={openNewPackage}
          style={({ pressed }) => [styles.package, pressed && styles.packagePressed]}
        >
          <PackageIcon size={26} weight="fill" color={t.primary[600]} />
          <View style={styles.packageText}>
            <Text style={styles.packageTitle}>Create a package</Text>
            <Text style={styles.packageSub}>Sell some of your products together at one price</Text>
          </View>
          <CaretRightIcon size={18} color={t.neutral[400]} />
        </Pressable>
      ) : null}
    </>
  );

  let empty = null;
  if (isLoading) {
    empty = (
      <View style={styles.skeletons}>
        <PageLoader minHeight={320} label="Loading products" />
      </View>
    );
  } else if (status === 'all' && !query) {
    empty = (
      <EmptyState
        page
        art="products"
        title="Add your first product"
        text="A photo, a name and a price are enough."
        actions={[{ label: 'Add product', onPress: openNew, icon: PlusIcon }]}
      />
    );
  } else {
    const restock = status === 'restock' && !query;
    empty = (
      <EmptyState
        page
        art={restock ? 'healthy' : 'search'}
        text={restock ? 'All good: every product has enough stock.' : 'No products match this filter.'}
      />
    );
  }

  return (
    <>
      <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
        {...tabScroll}
        data={isLoading ? [] : products}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            onEdit={openEdit}
            onAddStock={openStockSheet}
            onPostToday={() => router.push('/seller/today')}
            onMore={setMoreFor}
            onToggleVisibility={toggleVisibility}
            onView={(p) => router.push(`/product/${p.slug}`)}
            onDelete={setConfirmFor}
          />
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={t.primary[600]} style={styles.more} /> : null}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[sellerPageStyles.content, styles.content]}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[t.primary[600]]} tintColor={t.primary[600]} />
        )}
      />

      <ProductsStatusSheet
        open={statusSheet}
        status={status}
        summary={summary}
        onSelect={selectStatus}
        onClose={() => setStatusSheet(false)}
      />
      <ProductMoreSheet
        product={moreFor}
        busy={busy}
        onToggleVisibility={(p) => { setMoreFor(null); toggleVisibility(p); }}
        onView={(p) => { setMoreFor(null); router.push(`/product/${p.slug}`); }}
        onDelete={(p) => {
          // The confirm is a second modal: open it once the sheet has slid
          // away (iOS shows one modal at a time).
          setMoreFor(null);
          clearTimeout(confirmTimer.current);
          confirmTimer.current = setTimeout(() => setConfirmFor(p), SHEET_CLOSE_MS);
        }}
        onClose={() => setMoreFor(null)}
      />
      <ProductStockSheet
        product={stockFor}
        amount={stockAmount}
        onChangeAmount={setStockAmount}
        saving={Boolean(stockFor) && restockingId === stockFor?.id}
        onSave={saveStock}
        onClose={() => setStockFor(null)}
      />
      <OrderConfirmDialog
        open={Boolean(confirmFor)}
        title={`Delete "${confirmFor?.name || ''}"?`}
        message={productKind(confirmFor) === 'PACKAGE'
          ? 'This package will be removed from your store. The products in it stay as they are.'
          : 'This product will be permanently removed from your store and cannot be undone.'}
        confirmLabel="Delete"
        danger
        loading={busy}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmFor(null)}
      />
    </>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = themed(() => StyleSheet.create({
  // Lets an empty list's message fill the page and centre in it.
  content: { flexGrow: 1 },
  separator: { height: 10 },
  skeletons: { gap: 10 },
  more: { marginVertical: 16 },

  // .spm-package: a white 16px row inside the gutter.
  package: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
    paddingVertical: 14, paddingRight: 14, paddingLeft: 16, borderRadius: 16, backgroundColor: t.neutral[0],
  },
  packagePressed: { backgroundColor: t.neutral[50] },
  packageText: { flex: 1, minWidth: 0, gap: 1 },
  packageTitle: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  packageSub: { fontSize: 12.5, lineHeight: 17.5, color: t.neutral[500], ...font(400) },

}));
