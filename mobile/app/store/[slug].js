import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Image, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AirplaneTiltIcon, ArrowDownIcon, ArrowUpIcon, CaretLeftIcon, CaretRightIcon, ClockIcon, FlagIcon, GridFourIcon, InfoIcon,
  MagnifyingGlassIcon, MapPinIcon, MoneyIcon, PackageIcon, RowsIcon, SealCheckIcon, ShareNetworkIcon, ShoppingCartIcon,
  SquaresFourIcon, StarIcon, StorefrontIcon, TicketIcon, TruckIcon, UserIcon, XIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import EmptyArt from '../../src/components/EmptyArt';
import ShopHome from '../../src/components/shop/ShopHome';
import ShopMoreMenu from '../../src/components/shop/ShopMoreMenu';
import { ShopGridCard, ShopProductRow } from '../../src/components/shop/ShopProductRow';
import ShopReportSheet from '../../src/components/shop/ShopReportSheet';
import { ShopGridSkeleton, ShopHomeSkeleton, ShopPageSkeleton } from '../../src/components/shop/ShopSkeletons';
import { awayUntil, nowLabel, shortDate, voucherSummary, weekLines } from '../../src/components/shop/shopHours';
import { ShopGradient, mix, shopColors } from '../../src/components/shop/shopTheme';
import { getCachedData, setCachedData } from '../../src/lib/dataCache';
import { API_BASE_URL } from '../../src/lib/config';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { saleInfo } from '../../src/lib/variantPricing';
import useAuthStore from '../../src/store/authStore';
import useCartStore, { cartKeyFor } from '../../src/store/cartStore';
import { font, t } from '../../src/theme';

/*
 * A shop's page on phones (web/src/pages/StoreDetail.jsx, the is-phone
 * layout, StoreDetail.css "Phone store profile" and styles/phone-app.css):
 * the top bar over the shop's cover (white once scrolled), the shop card,
 * away notice and vouchers, Home / Products / Categories / About, and the
 * product list or grid.
 */

const SORTS = [
  { key: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'price_asc', label: 'Price: Low to High', sortBy: 'price', sortOrder: 'asc' },
  { key: 'price_desc', label: 'Price: High to Low', sortBy: 'price', sortOrder: 'desc' },
  { key: 'best', label: 'Best Selling', sortBy: 'orderCount', sortOrder: 'desc' },
  { key: 'popular', label: 'Most Popular', sortBy: 'orderCount', sortOrder: 'desc' },
];
const PAGE_SIZE = 16;
const BAR = 56;
const storeKey = (slug) => `shop-page:store:${slug}`;
const productsKey = (storeId, page, category, sort, search) => (
  `shop-page:products:${storeId}:${JSON.stringify([page, category, sort, search.trim()])}`
);
const SITE = API_BASE_URL.replace(/\/api\/?$/, '');

function useDebounce(value, delay = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return v;
}

export default function StoreDetail() {
  const { slug } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);
  const cartCount = useCartStore((s) => s.items.reduce((n, item) => n + item.quantity, 0));

  const [store, setStore] = useState(() => getCachedData(storeKey(slug)) || null);
  const [isLoadingStore, setIsLoadingStore] = useState(() => !store);
  const [home, setHome] = useState(null);
  const [shopVouchers, setShopVouchers] = useState([]);
  const [mobileTab, setMobileTab] = useState('home');
  const [mobileLayout, setMobileLayout] = useState('list');
  const [searchOpen, setSearchOpen] = useState(false);
  const [focusSearch, setFocusSearch] = useState(false);
  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortKey, setSortKey] = useState('newest');
  const [rawSearch, setRawSearch] = useState('');
  const search = useDebounce(rawSearch, 350);
  const [products, setProducts] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [followBusy, setFollowBusy] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [barSolid, setBarSolid] = useState(false);
  const barAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const storeRequest = useRef(0);
  const productsRequest = useRef(0);

  const updateStore = useCallback((change) => setStore((cur) => {
    const next = typeof change === 'function' ? change(cur) : change;
    if (next?.slug) setCachedData(storeKey(next.slug), next);
    return next;
  }), []);

  // The bar turns white (smoothly) once the page is scrolled past the cover.
  useEffect(() => {
    Animated.timing(barAnim, { toValue: barSolid ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [barSolid, barAnim]);

  const fetchStore = useCallback(async () => {
    const request = ++storeRequest.current;
    const kept = getCachedData(storeKey(slug));
    if (kept) {
      setStore(kept);
      setIsLoadingStore(false);
    } else {
      setIsLoadingStore(true);
    }
    try {
      const res = await apiClient.get(`/stores/slug/${slug}/storefront`);
      if (request !== storeRequest.current) return;
      const fresh = res.data;
      updateStore((cur) => {
        const seen = cur && cur.id === fresh?.id ? cur : null;
        return {
          ...fresh,
          isFollowing: seen ? !!seen.isFollowing : false,
          followerCount: seen ? seen.followerCount : (fresh?.stats?.followerCount ?? 0),
        };
      });
      if (fresh?.id) {
        apiClient.get(`/follows/status/${fresh.id}`)
          .then((st) => updateStore((cur) => (cur && cur.id === fresh.id
            ? { ...cur, isFollowing: !!st.data?.following, followerCount: st.data?.followerCount ?? cur.followerCount }
            : cur)))
          .catch(() => { /* keep the cached count */ });
      }
    } catch (err) {
      if (request !== storeRequest.current) return;
      if (err.status === 404 || err.response?.status === 404) {
        setCachedData(storeKey(slug), null);
        router.replace('/stores');
      } else {
        toast.error('Failed to load store');
      }
    } finally {
      if (request === storeRequest.current) setIsLoadingStore(false);
    }
  }, [slug, router, updateStore]);

  useEffect(() => { fetchStore(); }, [fetchStore]);

  const storeId = store?.id;
  useEffect(() => {
    if (!storeId) return undefined;
    let live = true;
    const request = ++productsRequest.current;
    const key = productsKey(storeId, page, activeCategory, sortKey, search);
    const kept = getCachedData(key);
    if (kept) {
      setProducts(kept.products || []);
      if (kept.pagination) setPagination(kept.pagination);
      setIsLoadingProducts(false);
    } else {
      setIsLoadingProducts(true);
    }
    const isNewTab = activeCategory === 'new';
    const s = SORTS.find((x) => x.key === sortKey) || SORTS[0];
    const params = {
      storeId,
      page,
      pageSize: PAGE_SIZE,
      sortBy: isNewTab ? 'createdAt' : s.sortBy,
      sortOrder: isNewTab ? 'desc' : s.sortOrder,
    };
    if (activeCategory !== 'all' && activeCategory !== 'new') params.categoryId = activeCategory;
    if (search.trim()) params.search = search.trim();
    apiClient.get('/products', { params })
      .then((res) => {
        if (!live || request !== productsRequest.current) return;
        const list = res.data || [];
        setProducts(list);
        if (res.pagination) setPagination(res.pagination);
        setCachedData(key, { products: list, pagination: res.pagination || { total: list.length, totalPages: 1 } });
      })
      .catch(() => { if (live && request === productsRequest.current) toast.error('Failed to load products'); })
      .finally(() => { if (live && request === productsRequest.current) setIsLoadingProducts(false); });
    return () => { live = false; };
  }, [storeId, page, activeCategory, sortKey, search]);

  useEffect(() => {
    if (!storeId) return undefined;
    let cancelled = false;
    apiClient.get(`/vouchers/store/${storeId}`)
      .then((res) => { if (!cancelled) setShopVouchers(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [storeId]);

  const storeSlug = store?.slug;
  useEffect(() => {
    if (!storeSlug) return undefined;
    let cancelled = false;
    apiClient.get(`/stores/slug/${storeSlug}/home`)
      .then((res) => { if (!cancelled) setHome(res.data?.sections || []); })
      .catch(() => { if (!cancelled) setHome([]); });
    return () => { cancelled = true; };
  }, [storeSlug]);

  const { primary } = useMemo(() => shopColors(store), [store]);

  if (isLoadingStore || !store) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        {isLoadingStore ? <ShopPageSkeleton top={insets.top} /> : null}
      </View>
    );
  }

  const hasHome = Array.isArray(home) && home.length > 0;
  const phoneTab = mobileTab === 'home' ? (home === null || hasHome ? 'home' : 'products') : mobileTab;
  const initials = store.name ? store.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() : '?';
  const banner = store.bannerImage || store.coverImage;
  const stats = store.stats || {};
  const rating = Number(stats.averageRating || 0);
  const reviewCount = stats.reviewCount || 0;
  const productCount = stats.productCount || 0;
  const followerCount = store.followerCount || 0;
  const isFollowing = !!store.isFollowing;
  const isOwnStore = Boolean(user?.id && store.ownerId === user.id);
  const away = awayUntil(store);
  const hoursNow = nowLabel(store);
  const week = weekLines(store);
  const categories = Array.isArray(store.categories) ? store.categories : [];
  const offersDelivery = store.fulfillmentMode === 'DELIVERY' || store.fulfillmentMode === 'BOTH';
  const offersPickup = store.fulfillmentMode === 'PICKUP' || store.fulfillmentMode === 'BOTH';
  const perkLabels = [offersDelivery && 'Delivery', offersPickup && 'Pickup', store.acceptsCod && 'COD'].filter(Boolean);
  const activeCategoryName = categories.find((c) => c.id === activeCategory)?.name;
  const priceSort = sortKey === 'price_asc' || sortKey === 'price_desc';
  const deep = mix(primary, 0.63, '#000');
  const top = insets.top;

  const onCategoryChange = (id) => { setActiveCategory(id); setPage(1); };
  const onSortChange = (key) => { setSortKey(key); setPage(1); };
  const onSearchChange = (val) => { setRawSearch(val); setPage(1); };
  const openSearch = () => { setMobileTab('products'); setSearchOpen(true); setFocusSearch(true); };
  const pickCategory = (id) => { onCategoryChange(id); setMobileTab('products'); };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/stores'));

  // Same rules as the product list: options are picked on the product page,
  // and guests may fill a cart.
  const addToCartPhone = (product) => {
    if (Array.isArray(product.variations) && product.variations.length > 0) {
      router.push(`/product/${product.slug}`);
      return false;
    }
    try {
      addItem({
        id: product.id,
        productId: product.id,
        name: product.name,
        price: saleInfo(product).price,
        image: (Array.isArray(product.images) ? product.images[0] : null) || '/placeholder-product.png',
        storeId: store.id,
        storeName: store.name,
        storeLogo: store.logo || null,
        readyToSell: store.readyToSell,
        vacationUntil: store.vacationUntil,
        stock: product.stock,
        listingKind: product.listingKind,
        availability: product.availability,
        slug: product.slug,
        categoryId: product.categoryId,
        selectedVariations: null,
      }, 1);
      toast.success(`${product.name} added to cart`);
      return true;
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
      return false;
    }
  };

  // Straight to checkout with just this item.
  const buyNowPhone = (product) => {
    if (!addToCartPhone(product)) return;
    const key = cartKeyFor({ id: product.id, selectedVariations: null });
    useCartStore.getState().setSelectedItems?.([key]);
    router.push({ pathname: '/checkout', params: { selectedIds: key } });
  };

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      router.push({ pathname: '/login', params: { redirect: `/store/${slug}` } });
      return;
    }
    if (isOwnStore) return;
    setFollowBusy(true);
    try {
      const res = isFollowing
        ? await apiClient.delete(`/follows/${store.id}`)
        : await apiClient.post(`/follows/${store.id}`);
      const data = res.data || {};
      updateStore((s) => (s ? { ...s, isFollowing: data.following, followerCount: data.followerCount } : s));
      toast.success(data.following ? `You now follow ${store.name}` : `Unfollowed ${store.name}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update follow');
    } finally {
      setFollowBusy(false);
    }
  };

  const openReport = () => {
    if (!isAuthenticated) { toast.error('Please login to report'); return; }
    setShowReport(true);
  };

  const openChat = () => {
    if (!isAuthenticated) { toast.error('Please login to chat'); return; }
    router.push({ pathname: '/messages', params: { store: store.id } });
  };

  const shareStore = async () => {
    const url = `${SITE}/store/${store.slug}`;
    try {
      await Share.share({ title: store.name, message: `Shop local at ${store.name} on E-MOORM\n${url}`, url });
    } catch { /* closed */ }
  };

  const copyCode = (code) => {
    const clip = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.clipboard : null;
    if (clip?.writeText) {
      clip.writeText(code).then(() => toast.success(`${code} copied. Paste it at checkout.`)).catch(() => toast.info(code));
    } else {
      toast.info(code);
    }
  };

  const onScroll = (e) => {
    const solid = e.nativeEvent.contentOffset.y > 120;
    if (solid !== barSolid) setBarSolid(solid);
  };

  const iconColor = barSolid ? t.neutral[700] : '#fff';
  const iconShadow = barSolid ? null : styles.iconShadow;
  const barBg = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,1)'] });
  const barLine = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['rgba(229,231,235,0)', t.neutral[200]] });
  const contentW = screenW - 24;
  // Categories: three columns 10px apart in the panel (12px margin, 16px padding).
  const catW = Math.floor(((screenW - 56 - 20) / 3) * 100) / 100;

  // ── products ──
  let productsBody = null;
  if (phoneTab === 'products') {
    if (isLoadingProducts) {
      productsBody = <ShopGridSkeleton width={contentW} />;
    } else if (products.length === 0) {
      productsBody = (
        <View style={styles.empty}>
          <EmptyArt name={search ? 'search' : 'products'} size={88} />
          <Text style={styles.emptyText}>
            {search
              ? `No products match “${search}”.`
              : activeCategory !== 'all'
                ? 'No products in this category yet.'
                : 'This store has no products yet.'}
          </Text>
          {search || activeCategory !== 'all' ? (
            <Pressable style={styles.resetBtn} onPress={() => { setRawSearch(''); onCategoryChange('all'); }} accessibilityRole="button">
              <Text style={styles.resetText}>Reset filters</Text>
            </Pressable>
          ) : null}
        </View>
      );
    } else if (mobileLayout === 'list') {
      productsBody = (
        <View style={styles.list}>
          {products.map((product) => (
            <ShopProductRow
              key={product.id}
              product={product}
              onAdd={() => addToCartPhone(product)}
              onBuy={() => buyNowPhone(product)}
              closed={store.readyToSell === false || Boolean(away)}
            />
          ))}
        </View>
      );
    } else {
      const w = (contentW - 4) / 2;
      productsBody = (
        <View style={styles.grid}>
          {products.map((product) => (
            <ShopGridCard key={product.id} product={product} accent={primary} style={{ width: w }} />
          ))}
        </View>
      );
    }
  }

  const tabs = [
    ...(home === null || hasHome ? [['home', 'Home']] : []),
    ['products', 'Products'],
    ['categories', 'Categories'],
    ['about', 'About'],
  ];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollBody}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.hero, { paddingTop: BAR + top }]}>
          <View style={[styles.backdrop, { height: 190 + BAR + top }]}>
            <ShopGradient
              angle={160}
              stops={[[mix(primary, 0.52, '#000'), 0], [mix(primary, 0.63, '#000'), 0.6], [mix(primary, 0.4, '#000'), 1]]}
              radial={{ cx: 1, cy: 0, rx: 1.2, ry: 0.9, stops: [['#ec4899', 0, 0.18], ['#ec4899', 0.55, 0]] }}
            />
            {banner ? (
              <Image source={{ uri: resolveImg(banner) }} style={styles.backdropImg} resizeMode="cover" />
            ) : null}
          </View>

          <View style={styles.card}>
            <Pressable style={styles.band} onPress={() => setMobileTab('about')} accessibilityRole="button">
              <ShopGradient angle={90} stops={[[mix(primary, 0.08, '#fff'), 0], [t.accent[50], 1]]} />
              <View style={styles.bandBrand}>
                <StorefrontIcon size={15} weight="fill" color={deep} />
                <Text style={[styles.bandBrandText, { color: deep }]}>Local shop</Text>
                {store.owner?.identityVerified ? <SealCheckIcon size={14} weight="fill" color={primary} /> : null}
              </View>
              <View style={styles.bandPerks}>
                <Text style={styles.bandPerksText} numberOfLines={1}>
                  {perkLabels.length ? perkLabels.join(' · ') : (store.municipality?.name || 'Oriental Mindoro')}
                </Text>
                <CaretRightIcon size={13} weight="bold" color={t.accent[700]} />
              </View>
            </Pressable>

            <View style={styles.main}>
              <View style={[styles.logo, !store.logo && styles.logoEmpty]}>
                {store.logo ? (
                  <Image source={{ uri: resolveImg(store.logo) }} style={styles.logoImg} />
                ) : (
                  <>
                    <ShopGradient angle={135} stops={[[mix(primary, 0.8, '#fff'), 0], [mix(primary, 0.8, '#000'), 1]]} />
                    <Text style={styles.logoText}>{initials}</Text>
                  </>
                )}
              </View>
              <View style={styles.idText}>
                <Pressable style={styles.name} onPress={() => setMobileTab('about')} accessibilityRole="button">
                  <Text style={styles.nameText} numberOfLines={1} accessibilityRole="header">{store.name}</Text>
                  <CaretRightIcon size={15} weight="bold" color={t.neutral[500]} />
                </Pressable>
                <View style={styles.ratingRow}>
                  {rating > 0 ? (
                    <View style={[styles.rating, { backgroundColor: primary }]}>
                      <StarIcon size={12} weight="fill" color="#fff" />
                      <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
                    </View>
                  ) : (
                    <View style={[styles.rating, styles.ratingNew]}>
                      <Text style={[styles.ratingText, styles.ratingNewText]}>New</Text>
                    </View>
                  )}
                  <Text style={styles.counts}>
                    {productCount} {productCount === 1 ? 'product' : 'products'} · {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
                  </Text>
                </View>
              </View>
              <View style={styles.cta}>
                {!isOwnStore ? (
                  <Pressable
                    style={[styles.ctaBtn, isFollowing ? styles.following : styles.follow, followBusy && styles.busy]}
                    onPress={handleToggleFollow}
                    disabled={followBusy}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.ctaText, { color: isFollowing ? t.accent[700] : '#fff' }]}>{isFollowing ? 'Following' : 'Follow'}</Text>
                  </Pressable>
                ) : null}
                <Pressable style={[styles.ctaBtn, styles.message]} onPress={openChat} accessibilityRole="button">
                  <Text style={[styles.ctaText, { color: t.neutral[800] }]}>Message</Text>
                </Pressable>
              </View>
            </View>

            {store.description || store.municipality?.name ? (
              <View style={[styles.note, { backgroundColor: mix(primary, 0.08, '#fff'), borderColor: mix(primary, 0.18, '#fff') }]}>
                <View style={styles.noteText}>
                  <View style={styles.noteTown}>
                    <MapPinIcon size={13} weight="fill" color={deep} />
                    <Text style={[styles.noteTownText, { color: deep }]}>{store.municipality?.name || 'Oriental Mindoro'}</Text>
                  </View>
                  {store.description ? <Text style={styles.noteDesc} numberOfLines={1}>{store.description}</Text> : null}
                </View>
                <Pressable style={[styles.noteBtn, { backgroundColor: primary }]} onPress={() => setMobileTab('about')} accessibilityRole="button">
                  <Text style={styles.noteBtnText}>View</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {away ? (
            <View style={styles.away} accessibilityRole="alert">
              <AirplaneTiltIcon size={18} weight="fill" color={t.warning[600]} style={styles.awayIcon} />
              <View style={styles.awayText}>
                <Text style={styles.awayTitle}>Away until {shortDate(away)}</Text>
                {/* An inline line of the block's 15px/24px text, as the website's span. */}
                <Text style={styles.awayStrut}><Text style={styles.awayNote}>{store.vacationNote || 'You can look around and follow the shop. Ordering opens when they are back.'}</Text></Text>
              </View>
            </View>
          ) : null}

          {shopVouchers.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.vouchers} contentContainerStyle={styles.vouchersRow}>
              {shopVouchers.map((v) => (
                <Pressable key={v.id} style={styles.voucher} onPress={() => copyCode(v.code)} accessibilityRole="button">
                  <TicketIcon size={18} weight="fill" color={t.danger[700]} />
                  <View>
                    <Text style={styles.voucherTitle}>{voucherSummary(v)}</Text>
                    <Text style={styles.voucherStrut}><Text style={styles.voucherCode}>{v.code} · Tap to copy</Text></Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.tabs} accessibilityRole="tablist">
            {tabs.map(([key, label]) => {
              const on = phoneTab === key;
              return (
                <Pressable key={key} style={styles.tab} onPress={() => setMobileTab(key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
                  {on ? <View style={[styles.tabBar, { backgroundColor: primary }]} /> : null}
                </Pressable>
              );
            })}
          </View>

          {phoneTab === 'home' ? (
            <View style={[styles.panel, styles.homePanel]}>
              {home === null
                ? <ShopHomeSkeleton />
                : <ShopHome sections={home} accent={primary} onAddToCart={(p) => addToCartPhone(p)} />}
            </View>
          ) : null}

          {phoneTab === 'categories' ? (
            <View style={styles.panel}>
              {categories.length === 0 ? (
                <View style={styles.emptyCats}>
                  <EmptyArt name="categories" size={72} />
                  <Text style={styles.muted}>This shop hasn’t sorted its products into categories yet.</Text>
                </View>
              ) : (
                <View style={styles.cats}>
                  <CategoryTile
                    width={catW}
                    label="All products"
                    count={productCount}
                    onPress={() => pickCategory('all')}
                    art={<View style={[styles.catImg, styles.catAll]}><SquaresFourIcon size={26} weight="fill" color={t.primary[600]} /></View>}
                  />
                  {categories.map((c) => (
                    <CategoryTile
                      key={c.id}
                      width={catW}
                      label={c.name}
                      count={c.count ?? ''}
                      onPress={() => pickCategory(c.id)}
                      art={(
                        <View style={styles.catImg}>
                          {c.image
                            ? <Image source={{ uri: resolveImg(c.image) }} style={styles.fill} resizeMode="cover" />
                            : <PackageIcon size={24} color={t.neutral[500]} />}
                        </View>
                      )}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {phoneTab === 'about' ? (
            <View style={styles.panel}>
              {store.description ? <Text style={styles.aboutDesc}>{store.description}</Text> : null}
              <View style={styles.aboutStats}>
                <AboutStat value={rating > 0 ? rating.toFixed(1) : '—'} label={`${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`} />
                <AboutStat value={productCount} label={productCount === 1 ? 'product' : 'products'} divider />
                <AboutStat value={followerCount} label={followerCount === 1 ? 'follower' : 'followers'} divider />
              </View>
              {offersDelivery || offersPickup || store.acceptsCod ? (
                <View style={styles.perks}>
                  {offersDelivery ? <Perk Icon={TruckIcon} label="Delivery" /> : null}
                  {offersPickup ? <Perk Icon={StorefrontIcon} label="Pickup" /> : null}
                  {store.acceptsCod ? <Perk Icon={MoneyIcon} label="Cash on delivery" /> : null}
                </View>
              ) : null}
              <View style={styles.details}>
                {store.owner?.fullName ? <Detail Icon={UserIcon} label="Seller" value={store.owner.fullName} /> : null}
                {store.owner?.identityVerified ? <Detail Icon={SealCheckIcon} label="ID" value="Seller identity verified" /> : null}
                {store.municipality?.name ? <Detail Icon={MapPinIcon} label="Town" value={store.municipality.name} /> : null}
                {store.pickupAddress ? <Detail Icon={StorefrontIcon} label="Pickup" value={store.pickupAddress} /> : null}
                {week.length > 0 ? (
                  <Detail Icon={ClockIcon} label="Hours" alignTop>
                    <View style={styles.hours}>
                      {hoursNow ? (
                        <Text style={[styles.hoursNow, hoursNow.startsWith('Open') && styles.hoursOpen]}>{hoursNow}</Text>
                      ) : null}
                      {week.map((line) => <Text key={line} style={styles.detailValue}>{line}</Text>)}
                    </View>
                  </Detail>
                ) : store.businessHours ? (
                  <Detail Icon={ClockIcon} label="Hours" value={store.businessHours} />
                ) : null}
                {store.createdAt ? (
                  <Detail
                    Icon={PackageIcon}
                    label="Joined"
                    value={new Date(store.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                  />
                ) : null}
              </View>
              {!isOwnStore ? (
                <Pressable style={styles.report} onPress={openReport} accessibilityRole="button">
                  <FlagIcon size={15} color={t.neutral[500]} />
                  <Text style={styles.reportText}>Report this shop</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {phoneTab === 'products' ? (
            <View style={styles.sortbar}>
              <View style={styles.sorts} accessibilityRole="toolbar" accessibilityLabel="Sort products">
                <SortButton first label="Newest" on={sortKey === 'newest'} onPress={() => onSortChange('newest')} />
                <SortButton label="Popular" on={sortKey === 'popular' || sortKey === 'best'} onPress={() => onSortChange('popular')} />
                <SortButton
                  label="Price"
                  on={priceSort}
                  onPress={() => onSortChange(sortKey === 'price_asc' ? 'price_desc' : 'price_asc')}
                  a11y={sortKey === 'price_desc' ? 'Price, high to low' : 'Price, low to high'}
                  icon={priceSort ? (sortKey === 'price_desc'
                    ? <ArrowDownIcon size={12} weight="bold" color={t.primary[600]} />
                    : <ArrowUpIcon size={12} weight="bold" color={t.primary[600]} />) : null}
                />
              </View>
              <Pressable
                style={styles.layoutBtn}
                onPress={() => setMobileLayout((v) => (v === 'list' ? 'grid' : 'list'))}
                accessibilityRole="button"
                accessibilityLabel={mobileLayout === 'list' ? 'Show as grid' : 'Show as list'}
              >
                {mobileLayout === 'list' ? <GridFourIcon size={20} color={t.neutral[700]} /> : <RowsIcon size={20} color={t.neutral[700]} />}
              </Pressable>
            </View>
          ) : null}

          {phoneTab === 'products' && (searchOpen || rawSearch || activeCategory !== 'all') ? (
            <View style={styles.filters}>
              {searchOpen || rawSearch ? (
                <View style={styles.search}>
                  <MagnifyingGlassIcon size={17} color={t.neutral[500]} />
                  <TextInput
                    style={styles.searchInput}
                    value={rawSearch}
                    onChangeText={onSearchChange}
                    placeholder={`Search ${store.name}`}
                    placeholderTextColor={t.neutral[400]}
                    accessibilityLabel="Search this shop"
                    returnKeyType="search"
                    autoFocus={focusSearch && !rawSearch}
                    onBlur={() => setFocusSearch(false)}
                  />
                  <Pressable
                    style={styles.searchClose}
                    onPress={() => { onSearchChange(''); setSearchOpen(false); }}
                    accessibilityRole="button"
                    accessibilityLabel="Close search"
                  >
                    <XIcon size={14} weight="bold" color={t.neutral[600]} />
                  </Pressable>
                </View>
              ) : null}
              {activeCategory !== 'all' && activeCategory !== 'new' && activeCategoryName ? (
                <Pressable style={styles.activeCat} onPress={() => onCategoryChange('all')} accessibilityRole="button">
                  <Text style={styles.activeCatText}>{activeCategoryName}</Text>
                  <XIcon size={12} weight="bold" color={t.primary[700]} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {phoneTab === 'products' ? (
          <View style={styles.productsSection}>
            {productsBody}
            {pagination.totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  style={[styles.pageBtn, page <= 1 && styles.pageBtnOff]}
                  disabled={page <= 1}
                  onPress={() => { setPage(page - 1); scrollRef.current?.scrollTo({ y: 400, animated: true }); }}
                  accessibilityRole="button"
                >
                  <CaretLeftIcon size={16} color={t.neutral[600]} />
                  <Text style={styles.pageBtnText}>Prev</Text>
                </Pressable>
                <Text style={styles.pageInfo}>Page {page} of {pagination.totalPages}</Text>
                <Pressable
                  style={[styles.pageBtn, page >= pagination.totalPages && styles.pageBtnOff]}
                  disabled={page >= pagination.totalPages}
                  onPress={() => { setPage(page + 1); scrollRef.current?.scrollTo({ y: 400, animated: true }); }}
                  accessibilityRole="button"
                >
                  <Text style={styles.pageBtnText}>Next</Text>
                  <CaretRightIcon size={16} color={t.neutral[600]} />
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Over the cover: clear with white icons, white with dark icons once scrolled. */}
      <Animated.View style={[styles.topbar, { paddingTop: top, height: BAR + top, backgroundColor: barBg, borderBottomColor: barLine }]}>
        <Pressable style={styles.icon} onPress={goBack} accessibilityRole="button" accessibilityLabel="Back">
          <View style={iconShadow}><CaretLeftIcon size={24} weight="bold" color={barSolid ? t.neutral[900] : '#fff'} /></View>
        </Pressable>
        <View style={styles.topRight}>
          <Pressable style={styles.icon} onPress={openSearch} accessibilityRole="button" accessibilityLabel="Search this shop">
            <View style={iconShadow}><MagnifyingGlassIcon size={22} color={iconColor} /></View>
          </Pressable>
          <Pressable style={styles.icon} onPress={shareStore} accessibilityRole="button" accessibilityLabel="Share shop">
            <View style={iconShadow}><ShareNetworkIcon size={22} color={iconColor} /></View>
          </Pressable>
          <Pressable style={styles.icon} onPress={() => router.push('/cart')} accessibilityRole="link" accessibilityLabel={`Cart, ${cartCount} items`}>
            <View style={iconShadow}><ShoppingCartIcon size={22} color={iconColor} /></View>
            {cartCount > 0 ? <Text style={styles.cartBadge}>{cartCount > 99 ? '99+' : cartCount}</Text> : null}
          </Pressable>
          <ShopMoreMenu
            color={iconColor}
            iconStyle={iconShadow}
            items={[
              { key: 'about', Icon: InfoIcon, label: 'About this shop', onPress: () => setMobileTab('about') },
              { key: 'all', Icon: StorefrontIcon, label: 'All stores', to: '/stores' },
              !isOwnStore && { key: 'report', Icon: FlagIcon, label: 'Report shop', onPress: openReport },
            ]}
          />
        </View>
      </Animated.View>

      {showReport ? <ShopReportSheet storeId={store.id} targetName={store.name} onClose={() => setShowReport(false)} /> : null}
    </View>
  );
}

function SortButton({ label, on, onPress, first = false, icon = null, a11y }) {
  return (
    <Pressable
      style={[styles.sort, first ? styles.sortFirst : styles.sortNext]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.sortText, on && styles.sortTextOn]}>{label}</Text>
      {icon}
    </Pressable>
  );
}

function CategoryTile({ label, count, art, onPress, width }) {
  return (
    <Pressable style={[styles.cat, { width }]} onPress={onPress} accessibilityRole="button">
      {art}
      <Text style={styles.catName} numberOfLines={1}>{label}</Text>
      <Text style={styles.catCount}>{count}</Text>
    </Pressable>
  );
}

function AboutStat({ value, label, divider = false }) {
  return (
    <View style={[styles.aboutStat, divider && styles.aboutStatDivider]}>
      <Text style={styles.aboutStatValue}>{value}</Text>
      <Text style={styles.aboutStatLabel}>{label}</Text>
    </View>
  );
}

function Perk({ Icon, label }) {
  return (
    <View style={styles.perk}>
      <Icon size={14} color={t.primary[600]} />
      <Text style={styles.perkText}>{label}</Text>
    </View>
  );
}

function Detail({ Icon, label, value, children, alignTop = false }) {
  return (
    <View style={[styles.detail, alignTop && styles.detailTop]}>
      <Icon size={15} color={t.neutral[500]} />
      <Text style={styles.detailLabel}>{label}</Text>
      {children || <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  scrollBody: { paddingBottom: 24 },
  fill: { width: '100%', height: '100%' },

  topbar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 120,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 6, borderBottomWidth: 1,
  },
  topRight: { flexDirection: 'row', alignItems: 'center' },
  icon: { position: 'relative', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  iconShadow: { filter: [{ dropShadow: { offsetX: 0, offsetY: 1, standardDeviation: 2, color: 'rgba(0, 0, 0, 0.35)' } }] },
  cartBadge: {
    position: 'absolute', top: 2, right: 0, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.accent[600], color: '#fff', fontSize: 10.5, lineHeight: 18, ...font(500), textAlign: 'center',
  },

  hero: { position: 'relative' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden' },
  backdropImg: { width: '100%', height: '100%', opacity: 0.35, mixBlendMode: 'luminosity' },

  card: { position: 'relative', zIndex: 2, marginTop: 4, marginHorizontal: 12, overflow: 'hidden', borderRadius: 18, backgroundColor: t.neutral[0] },
  band: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9, paddingHorizontal: 14, overflow: 'hidden' },
  bandBrand: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  bandBrandText: { fontSize: 13, lineHeight: 15.6, ...font(500) },
  bandPerks: { flexDirection: 'row', alignItems: 'center', gap: 3, minWidth: 0, flexShrink: 1 },
  bandPerksText: { fontSize: 12.5, lineHeight: 15, ...font(500), color: t.accent[700], flexShrink: 1 },

  main: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12 },
  logo: {
    width: 62, height: 62, flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 2, borderColor: t.neutral[100], borderRadius: 31,
  },
  logoEmpty: {},
  logoImg: { width: '100%', height: '100%', backgroundColor: t.neutral[0] },
  logoText: { fontSize: 20, lineHeight: 32, ...font(500), color: '#fff' },
  idText: { flex: 1, minWidth: 0 },
  name: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', alignSelf: 'flex-start' },
  nameText: { flexShrink: 1, fontSize: 17, lineHeight: 21.25, ...font(500), color: t.neutral[900] },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 8, marginTop: 6 },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 6 },
  ratingText: { fontSize: 12.5, lineHeight: 20, ...font(500), color: '#fff' },
  ratingNew: { backgroundColor: t.neutral[100] },
  ratingNewText: { color: t.neutral[600] },
  counts: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  cta: { width: 98, flexShrink: 0, gap: 6 },
  ctaBtn: { height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 13.5, lineHeight: 16.2, ...font(500) },
  follow: { backgroundColor: t.accent[600] },
  following: { backgroundColor: t.accent[50] },
  busy: { opacity: 0.6 },
  message: { backgroundColor: t.neutral[100] },

  note: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginBottom: 14,
    paddingVertical: 10, paddingRight: 10, paddingLeft: 12, borderWidth: 1, borderRadius: 12,
  },
  noteText: { flex: 1, minWidth: 0, gap: 2 },
  noteTown: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteTownText: { fontSize: 13.5, lineHeight: 21.6, ...font(500) },
  noteDesc: { fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[600] },
  noteBtn: { height: 30, paddingHorizontal: 14, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  noteBtnText: { fontSize: 13, lineHeight: 15.6, ...font(500), color: '#fff' },

  away: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12, marginHorizontal: 16,
    paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.warning[50],
  },
  awayIcon: { marginTop: 1 },
  awayText: { flex: 1 },
  awayTitle: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.warning[900] },
  awayStrut: { fontSize: 15, lineHeight: 24, ...font(400), color: t.warning[900] },
  awayNote: { fontSize: 13, lineHeight: 18.85, ...font(400), color: t.warning[900] },

  vouchers: { marginTop: 12, marginHorizontal: 16, flexGrow: 0 },
  vouchersRow: { gap: 8 },
  voucher: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderStyle: 'dashed', borderColor: t.danger[300], borderRadius: 10, backgroundColor: t.danger[50],
  },
  voucherTitle: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.danger[700] },
  voucherStrut: { fontSize: 15, lineHeight: 24, ...font(400), color: t.danger[600] },
  voucherCode: { fontSize: 11.5, lineHeight: 18.4, ...font(400), color: t.danger[600] },

  tabs: { flexDirection: 'row', marginTop: 12, borderBottomWidth: 1, borderBottomColor: t.neutral[200], backgroundColor: t.neutral[0] },
  tab: { flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 15, lineHeight: 18, ...font(500), color: t.neutral[500] },
  tabTextOn: { color: t.neutral[900] },
  tabBar: { position: 'absolute', left: '22%', right: '22%', bottom: -1, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },

  panel: { margin: 12, padding: 16, borderRadius: 16, backgroundColor: t.neutral[0] },
  homePanel: { paddingTop: 12, paddingHorizontal: 12, paddingBottom: 4 },
  emptyCats: { alignItems: 'center' },
  muted: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  cats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 10 },
  cat: { alignItems: 'center', gap: 3 },
  catImg: {
    width: '100%', aspectRatio: 1, marginBottom: 4, overflow: 'hidden', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  catAll: { backgroundColor: t.primary[50] },
  catName: { maxWidth: '100%', fontSize: 13, lineHeight: 15.6, ...font(500), color: t.neutral[900] },
  catCount: { fontSize: 12, lineHeight: 14.4, ...font(400), color: t.neutral[500] },

  aboutDesc: { marginBottom: 14, fontSize: 14.5, lineHeight: 22.475, ...font(400), color: t.neutral[700] },
  aboutStats: { flexDirection: 'row', paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.neutral[100] },
  aboutStat: { flex: 1, alignItems: 'center', gap: 2 },
  aboutStatDivider: { borderLeftWidth: 1, borderLeftColor: t.neutral[100] },
  aboutStatValue: { fontSize: 17, lineHeight: 27.2, ...font(500), color: t.neutral[900] },
  aboutStatLabel: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  perks: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 14 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.neutral[100] },
  perkText: { fontSize: 12.5, lineHeight: 20, ...font(500), color: t.neutral[700] },
  details: { gap: 10, marginTop: 16 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  detailTop: { alignItems: 'flex-start' },
  detailLabel: { width: 56, flexShrink: 0, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
  detailValue: { flexShrink: 1, minWidth: 0, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[800] },
  hours: { flexShrink: 1, gap: 2 },
  hoursNow: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[600] },
  hoursOpen: { color: t.primary[700] },
  report: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 6, alignSelf: 'flex-start' }, // the website's inline button sits in a taller line box
  reportText: { fontSize: 13.5, lineHeight: 16.2, ...font(400), color: t.neutral[500] },

  sortbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 8, backgroundColor: t.neutral[0] },
  sorts: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0, paddingHorizontal: 14 },
  sortFirst: { height: 44, paddingLeft: 0 },
  sortNext: { height: 16, borderLeftWidth: 1, borderLeftColor: t.neutral[200] },
  sortText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: t.neutral[500] },
  sortTextOn: { color: t.neutral[900] },
  layoutBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, paddingHorizontal: 12 },
  search: {
    flexBasis: '100%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 42,
    paddingLeft: 14, paddingRight: 6, borderWidth: 1.5, borderColor: t.primary[500], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  searchInput: { flex: 1, minWidth: 0, height: '100%', padding: 0, fontSize: 16, ...font(400), color: t.neutral[900], outlineStyle: 'none' },
  searchClose: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  activeCat: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.primary[600], borderRadius: 999, backgroundColor: t.primary[50],
  },
  activeCatText: { fontSize: 13, lineHeight: 15.6, ...font(500), color: t.primary[700] },

  productsSection: { paddingTop: 12, paddingHorizontal: 12 },
  list: { gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 36, paddingHorizontal: 20, borderRadius: 16, backgroundColor: t.neutral[0] },
  emptyText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  resetBtn: {
    minHeight: 44, paddingHorizontal: 10, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
  },
  resetText: { fontSize: 13, lineHeight: 15.6, ...font(500), color: t.neutral[600] },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 },
  pageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  pageBtnOff: { opacity: 0.4 },
  pageBtnText: { fontSize: 13, lineHeight: 15.6, ...font(400), color: t.neutral[600] },
  pageInfo: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
});
