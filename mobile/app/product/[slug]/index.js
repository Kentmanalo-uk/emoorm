import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Image, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  CalendarCheckIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, ChatCircleIcon, ClockIcon, FlagIcon, HeartIcon,
  InfoIcon, MagnifyingGlassIcon, MapPinIcon, PackageIcon, PlusIcon, ShareNetworkIcon, ShoppingCartIcon,
  ShoppingCartSimpleIcon, StorefrontIcon, TruckIcon,
} from 'phosphor-react-native';
import apiClient from '../../../src/api/client';
import ShellBarButton from '../../../src/components/ShellBarButton';
import ShellPageMenu from '../../../src/components/ShellPageMenu';
import EmptyArt from '../../../src/components/EmptyArt';
import { SaleEnds } from '../../../src/components/SaleTag';
import TodayTag from '../../../src/components/TodayTag';
import LoadingSkeleton from '../../../src/components/LoadingSkeleton';
import useAuthStore from '../../../src/store/authStore';
import useCartStore from '../../../src/store/cartStore';
import useWishlistStore from '../../../src/store/wishlistStore';
import { getCachedData, setCachedData, invalidateCachedData } from '../../../src/lib/dataCache';
import { resolveImg } from '../../../src/lib/media';
import { toast } from '../../../src/lib/toast';
import {
  fulfillmentLabel, isOpen as windowOpen, isTodayProduct, leftLabel, spanLabel, windowState,
} from '../../../src/lib/availability';
import {
  priceForSelection, pricedVariation, priceRange, priceTiersOf, saleInfo, stockForSelection, unitPriceFor,
} from '../../../src/lib/variantPricing';
import { font, t } from '../../../src/theme';
import ProductOptionSheet from '../../../src/components/product/ProductOptionSheet';
import ProductQuestions from '../../../src/components/product/ProductQuestions';
import ReviewItem, { Stars } from '../../../src/components/product/ReviewItem';
import ShippingEstimate from '../../../src/components/product/ShippingEstimate';
import ReportSheet from '../../../src/components/product/ReportSheet';
import IdentityDialog from '../../../src/components/product/IdentityDialog';
import ProductSection, { SectionBody, SectionHead, SectionTitle } from '../../../src/components/product/ProductSection';
import { RelatedGrid, ShopShelf } from '../../../src/components/product/ProductShelves';
import {
  awayUntil, cartKeyFor, cartRefusal, dayLabel, estimate, fetchIdentityStatus, followStore, getFollowStatus, localDate, money,
  parseImages, peso, rangeLabel, readyDay, recordView, shortDate, storeServiceLines, subscribeToFollowChanges, unfollowStore,
} from '../../../src/components/product/productLib';

const PLACEHOLDER = require('../../../assets/pdp-placeholder-product.png');

// The section tabs (key, label), in reading order.
const PHONE_SECTIONS = [
  ['overview', 'Overview'],
  ['reviews', 'Reviews'],
  ['details', 'Details'],
  ['foryou', 'For you'],
];
const HEAD_H = 56;
const TABS_H = 42;

/**
 * The product page at phone size (web/src/pages/ProductDetails.jsx with its
 * phone layout): photos, the green-to-pink price band, the title with its
 * Available Today tag, delivery and options, reviews, questions, the shop and
 * its shelf, details, "You may also like", and the action bar.
 */
export default function ProductDetails() {
  const { slug: rawSlug } = useLocalSearchParams();
  const slug = String(rawSlug || '');
  return <ProductPage key={slug} slug={slug} />;
}

function ProductPage({ slug }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const addItem = useCartStore((s) => s.addItem);
  const cartCount = useCartStore((s) => s.items.reduce((n, item) => n + (item.quantity || 0), 0));
  const toggleWishItem = useWishlistStore((s) => s.toggleItem);
  const wishItems = useWishlistStore((s) => s.items);

  // A product seen before shows at once while it is asked for again.
  const [product, setProduct] = useState(() => getCachedData(`product:${slug}`) || null);
  const [isLoading, setIsLoading] = useState(() => !getCachedData(`product:${slug}`));
  const [activeSlide, setActiveSlide] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariations, setSelectedVariations] = useState({});
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [sameShopProducts, setSameShopProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [ratingStats, setRatingStats] = useState(null);
  const [shopUnread, setShopUnread] = useState({ shopId: null, count: 0 });
  const [failedLogo, setFailedLogo] = useState('');
  const [shipQuote, setShipQuote] = useState(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [sheetMode, setSheetMode] = useState(null);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [storeFollow, setStoreFollow] = useState({ following: false, count: null, busy: false });
  const [descOpen, setDescOpen] = useState(false);
  const [phoneTab, setPhoneTab] = useState({ on: false, key: 'overview' });
  const [galleryH, setGalleryH] = useState(Math.round((screenW * 6) / 5));
  const [band, setBand] = useState({ w: 0, h: 0 });

  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const sectionY = useRef({});
  const sectionNodes = useRef({});
  const sectionRefs = useRef({});
  const tabsAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);

  /* ── loading ─────────────────────────────────────────────────────────── */

  const fetchRelated = async (categoryId, productId) => {
    try {
      const res = await apiClient.get('/products', { params: { categoryId, pageSize: 8 } });
      setRelatedProducts((res.data || []).filter((p) => p.id !== productId).slice(0, 6));
    } catch { /* the shelf stays empty */ }
  };
  const fetchSameShop = async (storeId, productId) => {
    try {
      const res = await apiClient.get('/products', { params: { storeId, pageSize: 8 } });
      setSameShopProducts((res.data || []).filter((p) => p.id !== productId).slice(0, 6));
    } catch { /* the shelf stays empty */ }
  };
  const fetchReviews = async (productId) => {
    try {
      const res = await apiClient.get(`/reviews/product/${productId}`);
      setReviews(res.data || []);
      setRatingStats(res.ratingStats || null);
    } catch { /* no reviews shown */ }
  };

  useEffect(() => {
    let live = true;
    const kept = getCachedData(`product:${slug}`);
    const loadAround = (item) => {
      if (item?.categoryId) fetchRelated(item.categoryId, item.id);
      if (item?.storeId) fetchSameShop(item.storeId, item.id);
      if (item?.id) fetchReviews(item.id);
    };
    if (kept) loadAround(kept);
    (async () => {
      try {
        const res = await apiClient.get(`/products/slug/${slug}`);
        if (!live) return;
        setProduct(res.data);
        setCachedData(`product:${slug}`, res.data);
        if (!kept) loadAround(res.data);
      } catch (error) {
        if (!live) return;
        if (error.status === 404) {
          invalidateCachedData(`product:${slug}`);
          toast.error('Product not found');
          router.replace('/products');
        }
      } finally {
        if (live) setIsLoading(false);
      }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Unread messages from this shop on Chat.
  const shopId = product?.store?.id;
  useEffect(() => {
    if (!isAuthenticated || !shopId) return undefined;
    let cancelled = false;
    apiClient.get('/messages/conversations')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        const convo = list.find((c) => c.role === 'buyer' && c.store?.id === shopId);
        if (!cancelled) setShopUnread({ shopId, count: Number(convo?.unreadCount || 0) });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAuthenticated, shopId]);

  // The shop's live follow state (the product payload carries none).
  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    setStoreFollow({ following: false, count: null, busy: false });
    getFollowStatus(shopId)
      .then((st) => { if (!cancelled) setStoreFollow((cur) => ({ ...cur, following: !!st.following, count: st.followerCount ?? 0 })); })
      .catch(() => {});
    const unsub = subscribeToFollowChanges((msg) => {
      if (!msg || msg.storeId !== shopId) return;
      setStoreFollow((cur) => ({
        ...cur,
        following: msg.type === 'follow' ? true : msg.type === 'unfollow' ? false : cur.following,
        count: msg.data?.followerCount ?? cur.count,
      }));
    });
    return () => { cancelled = true; unsub(); };
  }, [shopId, isAuthenticated]);

  // Recently viewed (Home), and a page view for the shop's analytics.
  const viewedId = product?.status === 'APPROVED' && product.slug === slug ? product.id : null;
  useEffect(() => {
    if (!viewedId) return;
    recordView(user?.id, product);
    apiClient.post(`/views/product/${viewedId}`).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewedId]);

  /* ── actions ─────────────────────────────────────────────────────────── */

  const loginRedirect = () => router.push(`/login?redirect=${encodeURIComponent(`/product/${slug}`)}`);
  const wishlisted = !!product && wishItems.some((item) => item.id === product.id);

  const toggleWishlist = () => {
    if (!isAuthenticated) { loginRedirect(); return; }
    const wasIn = wishlisted;
    toggleWishItem(product);
    toast.success(wasIn ? 'Removed from wishlist' : 'Added to wishlist');
  };

  const toggleStoreFollow = async () => {
    if (!isAuthenticated) { loginRedirect(); return; }
    if (!product?.store || storeFollow.busy) return;
    setStoreFollow((cur) => ({ ...cur, busy: true }));
    try {
      const res = storeFollow.following ? await unfollowStore(product.store.id) : await followStore(product.store.id);
      setStoreFollow({ following: !!res.following, count: res.followerCount ?? 0, busy: false });
      toast.success(res.following ? `You now follow ${product.store.name}` : `Unfollowed ${product.store.name}`);
    } catch (err) {
      setStoreFollow((cur) => ({ ...cur, busy: false }));
      toast.error(err.message || 'Could not update follow');
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) { loginRedirect(); return false; }
    const defs = Array.isArray(product.variations) ? product.variations : [];
    setIsAddingToCart(true);
    try {
      const line = {
        id: product.id,
        name: product.name,
        price: priceForSelection(product, selectedVariations),
        priceTiers: product.priceTiers,
        image: parseImages(product.images)[0] || null,
        storeId: product.storeId,
        storeName: product.store?.name,
        storeLogo: product.store?.logoUrl || product.store?.logo || null,
        storeSlug: product.store?.slug,
        stock: stockForSelection(product, selectedVariations),
        listingKind: product.listingKind,
        availability: product.availability,
        slug: product.slug,
        categoryId: product.categoryId,
        productId: product.id,
        selectedVariations: defs.length ? selectedVariations : null,
        store: product.store,
      };
      const refusal = cartRefusal(line);
      if (refusal) throw new Error(refusal);
      addItem(line, quantity);
      toast.success('Added to cart');
      return true;
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
      return false;
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Buy now: straight to checkout with just this line selected.
  const goToCheckout = () => {
    const defs = Array.isArray(product.variations) ? product.variations : [];
    const key = cartKeyFor({ id: product.id, selectedVariations: defs.length ? selectedVariations : null });
    // The checkout screen reads its lines as a JSON list of cart keys.
    router.push({ pathname: '/checkout', params: { selectedIds: JSON.stringify([key]) } });
  };

  const requireVerifiedIdentity = async () => {
    try {
      const status = await fetchIdentityStatus();
      if (!status?.requiredForCheckout || status.status === 'VERIFIED') return true;
    } catch (error) {
      toast.error(error?.message || 'Could not check your verification status');
      return false;
    }
    setIdentityOpen(true);
    return false;
  };

  // The sheet has already checked every option group.
  const confirmSheet = async () => {
    const mode = sheetMode;
    if (!isAuthenticated) { setSheetMode(null); loginRedirect(); return; }
    if (mode === 'buy' && !(await requireVerifiedIdentity())) { setSheetMode(null); return; }
    // On failure (e.g. more than the stock) the sheet stays open with the toast.
    if (handleAddToCart() === false) return;
    setSheetMode(null);
    if (mode === 'buy') goToCheckout();
  };

  const closeSheet = useCallback(() => setSheetMode(null), []);

  // The row under the shop: straight into the cart, or to the product first.
  const quickAdd = (p) => {
    if (Array.isArray(p.variations) && p.variations.length) {
      router.push(`/product/${p.slug}`);
      return;
    }
    try {
      const line = {
        id: p.id,
        productId: p.id,
        name: p.name,
        price: saleInfo(p).price,
        priceTiers: p.priceTiers,
        image: parseImages(p.images)[0] || null,
        storeId: p.storeId || p.store?.id,
        storeName: p.store?.name,
        storeLogo: p.store?.logo || null,
        storeSlug: p.store?.slug,
        readyToSell: p.store?.readyToSell,
        vacationUntil: p.store?.vacationUntil,
        stock: p.stock,
        listingKind: p.listingKind,
        availability: p.availability,
        slug: p.slug,
        categoryId: p.categoryId,
        selectedVariations: null,
      };
      const refusal = cartRefusal(line);
      if (refusal) throw new Error(refusal);
      addItem(line, 1);
      toast.success('Added to cart');
    } catch (err) {
      toast.error(err.message || 'Could not add to cart');
    }
  };

  const handleShare = async () => {
    try {
      const url = `https://emoorm.shop/product/${product.slug}`;
      await Share.share({ title: product.name, message: `${product.name} — ${peso(product.price)} on E-MOORM ${url}`, url });
    } catch {
      // Closing the share menu needs no message.
    }
  };

  const openReport = () => {
    if (!isAuthenticated) { loginRedirect(); return; }
    setShowReport(true);
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /* ── section tabs ────────────────────────────────────────────────────── */

  const onScroll = (e) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.current = y;
    let key = 'overview';
    for (const [k] of PHONE_SECTIONS) {
      const top = sectionY.current[k];
      if (k !== 'overview' && top != null && top - y - TABS_H - 12 <= 0) key = k;
    }
    const on = y > galleryH * 0.6;
    setPhoneTab((cur) => (cur.on === on && cur.key === key ? cur : { on, key }));
  };

  useEffect(() => {
    Animated.timing(tabsAnim, { toValue: phoneTab.on ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [phoneTab.on, tabsAnim]);

  const goToSection = (key) => {
    const top = sectionY.current[key];
    const y = key === 'overview' || top == null ? 0 : top - TABS_H + 1;
    scrollRef.current?.scrollTo({ y, animated: true });
  };
  // Where each section starts in the scrolled content. Measured again
  // whenever the content changes size (onLayout alone misses a section
  // pushed down by content loading above it on the web build).
  const sectionRef = (key) => {
    sectionRefs.current[key] = sectionRefs.current[key] || ((node) => { sectionNodes.current[key] = node; });
    return sectionRefs.current[key];
  };
  const measureSections = () => {
    const content = contentRef.current;
    if (!content) return;
    Object.entries(sectionNodes.current).forEach(([key, node]) => {
      if (!node?.measureLayout) return;
      node.measureLayout(content, (x, y) => { sectionY.current[key] = y; }, () => {});
    });
  };

  /* ── derived ─────────────────────────────────────────────────────────── */

  const etaLines = useMemo(() => {
    const st = product?.store;
    if (!st || st.readyToSell === false || awayUntil(st)) return [];
    if (isTodayProduct(product)) {
      const w = product.availability;
      return w ? [`Ready ${spanLabel(w.readyFrom, w.readyUntil)}`] : [];
    }
    const mode = st.fulfillmentMode || 'DELIVERY';
    const lower = (s) => s.replace(/Today|Tomorrow/g, (w) => w.toLowerCase());
    return [
      ...(mode !== 'PICKUP' ? [`Arrives ${lower(rangeLabel(estimate(st, { method: 'DELIVERY', townId: user?.municipalityId })))} if delivered by the shop`] : []),
      ...(mode !== 'DELIVERY' ? [`Ready for pickup ${lower(dayLabel(readyDay(st)))}`] : []),
    ];
  }, [product, user?.municipalityId]);

  if (isLoading && !product) {
    return <ProductSkeleton insets={insets} width={screenW} onBack={goBack} />;
  }

  if (!product) {
    return (
      <View style={[styles.screen, styles.notFound, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <PackageIcon size={56} color={t.neutral[400]} />
        <Text style={styles.notFoundTitle}>Product not found</Text>
        <Pressable style={styles.notFoundBtn} onPress={() => router.replace('/products')}>
          <Text style={styles.notFoundBtnText}>Browse products</Text>
        </Pressable>
      </View>
    );
  }

  const images = parseImages(product.images);
  const isOutOfStock = product.stock === 0;
  const away = awayUntil(product.store);
  const todayItem = isTodayProduct(product);
  const todayWindow = product.availability || null;
  const todayClosed = todayItem && !windowOpen(todayWindow);
  const notTakingOrders = product.store?.readyToSell === false || Boolean(away) || todayClosed;
  const closedLabel = away
    ? `Shop away until ${shortDate(away)}`
    : todayClosed ? windowState(todayWindow).text : 'Not taking orders yet';
  const cannotBuy = isOutOfStock || notTakingOrders;
  const pricedGroup = pricedVariation(product.variations);
  const range = priceRange(product);
  const optionPriced = !!pricedGroup && range.min !== range.max;
  const optionChosen = !!(pricedGroup && selectedVariations[pricedGroup.name]);
  const unitPrice = unitPriceFor(product, selectedVariations, quantity);
  const tiers = priceTiersOf(product);
  const priceLabel = optionPriced && !optionChosen ? `${money(range.min)} – ₱${money(range.max)}` : money(unitPrice);
  const place = product.municipality?.name || product.store?.municipality?.name || 'Oriental Mindoro';
  const soldCount = Number(product.soldCount ?? 0);
  const serviceLines = storeServiceLines(product.store);
  const avgRating = Number(product.averageRating ?? ratingStats?.averageRating ?? 0);
  const reviewCount = Number(product.reviewCount ?? ratingStats?.totalReviews ?? reviews.length);
  const shopLogo = product.store && (product.store.logoUrl || product.store.logo) ? resolveImg(product.store.logoUrl || product.store.logo) : '';
  const chatUnread = isAuthenticated && shopUnread.shopId === product.store?.id ? shopUnread.count : 0;
  const sellerQuote = shipQuote?.productId === product.id && shipQuote.seller?.offered ? shipQuote.seller : null;
  const freeShipping = Boolean(sellerQuote && sellerQuote.covered !== false && sellerQuote.fee != null && Number(sellerQuote.fee) === 0);
  const buyNote = freeShipping ? 'Free shipping' : product.store?.acceptsCod ? 'Cash on delivery' : '';
  const defs = Array.isArray(product.variations) ? product.variations : [];
  const optionsValue = (() => {
    const picked = defs.filter((v) => selectedVariations[v.name]).map((v) => `${v.name}: ${selectedVariations[v.name]}`);
    const qty = `Qty ${quantity}`;
    if (!defs.length) return qty;
    if (picked.length < defs.length) return `Select ${defs.map((v) => v.name).join(', ')}`;
    return `${picked.join(', ')} · ${qty}`;
  })();
  const isOwnStore = Boolean(user?.id && (product.store?.ownerId || product.store?.owner?.id) === user.id);
  const sale = saleInfo(product);
  // A countdown (last three days of a sale) or bulk prices crowd the band:
  // the old price drops under the price and the place gives way first.
  const saleLeft = sale.endsAt ? sale.endsAt.getTime() - Date.now() : null;
  const crowded = tiers.length > 0 || (saleLeft != null && saleLeft > 0 && saleLeft <= 3 * 86400e3);
  const description = product.description || '';
  const longDesc = description.length > 260;

  const menuItems = [
    {
      key: 'wish',
      Icon: wishlisted ? HeartFill : HeartIcon,
      label: wishlisted ? 'Saved to wishlist' : 'Save to wishlist',
      onPress: toggleWishlist,
    },
    product.store && { key: 'shop', Icon: StorefrontIcon, label: 'Visit shop', to: `/store/${product.store.slug}` },
    { key: 'report', Icon: FlagIcon, label: 'Report listing', onPress: openReport },
  ].filter(Boolean);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top bar: back, the category as a search field, cart, ⋯ */}
      <View style={[styles.head, { paddingTop: insets.top }]}>
        <View style={styles.topbar}>
          <ShellBarButton label="Back" onPress={goBack}>
            <CaretLeftIcon size={22} weight="bold" color={t.neutral[900]} />
          </ShellBarButton>
          <Pressable style={styles.search} onPress={() => router.push('/products')} accessibilityRole="search" accessibilityLabel="Search products">
            <MagnifyingGlassIcon size={17} color={t.neutral[500]} />
            <Text style={styles.searchText} numberOfLines={1}>{product.category?.name || 'Search products'}</Text>
          </Pressable>
          <ShellBarButton label={`Cart, ${cartCount} items`} onPress={() => router.push('/cart')}>
            <ShoppingCartIcon size={22} color={t.neutral[900]} />
            {cartCount > 0 ? (
              <View style={styles.cartBadge}><Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View>
            ) : null}
          </ShellBarButton>
          <ShellPageMenu items={menuItems} label="More options" />
        </View>
        <Animated.View
          pointerEvents={phoneTab.on ? 'auto' : 'none'}
          accessibilityElementsHidden={!phoneTab.on}
          style={[styles.tabs, {
            opacity: tabsAnim,
            transform: [{ translateY: tabsAnim.interpolate({ inputRange: [0, 1], outputRange: [-TABS_H, 0] }) }],
          }]}
        >
          {PHONE_SECTIONS.map(([key, label]) => (
            <Pressable key={key} style={styles.tab} onPress={() => goToSection(key)} accessibilityRole="tab" accessibilityState={{ selected: phoneTab.key === key }}>
              <Text style={[styles.tabText, phoneTab.key === key && styles.tabTextOn]}>{label}</Text>
              {phoneTab.key === key ? <View style={styles.tabLine} /> : null}
            </Pressable>
          ))}
        </Animated.View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={measureSections}
        onScroll={onScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Gallery: one photo per screen width, swipe to change */}
        <View style={styles.gallery} onLayout={(e) => { setGalleryH(e.nativeEvent.layout.height); sectionY.current.overview = 0; }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / screenW);
              if (i !== activeSlide) setActiveSlide(i);
            }}
          >
            {(images.length ? images : [null]).map((img, i) => (
              <GallerySlide key={`${img}-${i}`} src={img} width={screenW} label={i === 0 ? product.name : `${product.name} ${i + 1}`} />
            ))}
          </ScrollView>
          {images.length > 1 ? (
            <View style={styles.counter}><Text style={styles.counterText}>{activeSlide + 1}/{images.length}</Text></View>
          ) : null}
          {product.status === 'PENDING' ? (
            <View style={styles.pending}><Text style={styles.pendingText}>PENDING REVIEW</Text></View>
          ) : null}
        </View>

        {/* Price band: brand green under the price, accent pink on the right */}
        <View style={styles.priceBand} onLayout={(e) => setBand({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {band.w ? <BandGradient w={band.w} h={band.h} /> : null}
          <View style={[styles.priceMain, crowded && styles.priceMainCrowded]}>
            <View style={styles.priceLine}>
              <Text style={styles.pricePeso}>₱</Text>
              {/* Inline on the website: a range wraps after the dash, the small ₱ stays on line one. */}
              {priceLabel.split(' – ').map((part, i, all) => (
                <Text key={part} style={styles.priceText}>{i < all.length - 1 ? `${part} – ` : part}</Text>
              ))}
            </View>
            {sale.regular ? (
              <View style={[styles.bandWas, crowded && styles.bandWasCrowded]}>
                <Text style={styles.bandWasOld}>{peso(sale.regular)}</Text>
                <Text style={styles.bandWasOff}>-{Math.round((1 - sale.price / sale.regular) * 100)}%</Text>
              </View>
            ) : null}
          </View>
          {/* The countdown and bulk prices sit in the band's row, as on the website. */}
          <SaleEnds product={product} style={styles.bandEnds} />
          {tiers.length > 0 ? <BandBulk tiers={tiers} /> : null}
          <View style={[styles.priceSide, crowded && styles.priceSideCrowded]}>
            <View style={styles.place}>
              <MapPinIcon size={12} color="#fff" />
              <Text style={styles.placeText} numberOfLines={1}>{place}</Text>
            </View>
          </View>
        </View>

        {/* Title, rating, and the grey card of rows */}
        <View style={styles.heroInfo}>
          <Text style={styles.title} numberOfLines={2} accessibilityRole="header">
            {todayItem && product.availability ? <TodayTag mode={product.availability.mode} size={11.5} style={styles.titleTag} /> : null}
            {product.name}
          </Text>
          <View style={styles.titleTools}>
            <Pressable
              style={styles.bookmark}
              onPress={toggleWishlist}
              accessibilityRole="button"
              accessibilityLabel={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              accessibilityState={{ selected: wishlisted }}
            >
              <HeartIcon size={23} weight={wishlisted ? 'fill' : 'regular'} color={wishlisted ? t.accent[500] : t.neutral[700]} />
            </Pressable>
            <Pressable style={styles.bookmark} onPress={handleShare} accessibilityRole="button" accessibilityLabel="Share">
              <ShareNetworkIcon size={22} color={t.neutral[700]} />
            </Pressable>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.rating}>
              {reviewCount > 0 ? (
                <>
                  <Stars rating={avgRating} size={14} />
                  <Text style={styles.ratingScore}>{avgRating.toFixed(1)}</Text>
                </>
              ) : (
                <Text style={styles.metaMuted}>New</Text>
              )}
            </View>
            <View style={styles.metaDivider} />
            <Text style={styles.metaLink} onPress={() => goToSection('reviews')}>
              {reviewCount} {reviewCount === 1 ? 'rating' : 'ratings'}
            </Text>
            {soldCount > 0 ? (
              <>
                <View style={styles.metaDivider} />
                <Text style={styles.metaMuted}>{soldCount} sold</Text>
              </>
            ) : null}
          </View>

          <View style={styles.rows}>
            {todayItem ? (
              <Row label="Available today:">
                {todayWindow ? (
                  <>
                    <View style={[styles.line, styles.lineWrap]}>
                      <TodayTag mode={todayWindow.mode} size={12} style={styles.todayTag} />
                      <Text style={[styles.todayState, styles[`today_${windowState(todayWindow, product.stock).tone}`]]}>
                        {windowState(todayWindow, product.stock).text}
                      </Text>
                      {windowOpen(todayWindow) ? <TimeLeft until={todayWindow.ordersCloseAt} prefix="· ends in" /> : null}
                    </View>
                    {todayWindow.prepMinutes ? (
                      <View style={styles.line}>
                        <ClockIcon size={14} color={t.neutral[500]} style={styles.lineIcon} />
                        <Text style={styles.lineText}>Made in about {todayWindow.prepMinutes} min after you order</Text>
                      </View>
                    ) : null}
                    <View style={styles.line}>
                      <TruckIcon size={14} color={t.neutral[500]} style={styles.lineIcon} />
                      <Text style={styles.lineText}>{fulfillmentLabel(todayWindow.fulfillment)}</Text>
                    </View>
                    {todayWindow.note ? <Text style={[styles.lineText, styles.todayNote]}>{todayWindow.note}</Text> : null}
                  </>
                ) : (
                  <View style={styles.line}>
                    <Text style={[styles.lineText, styles.todayState, styles.today_ended]}>Not available now. The shop posts it on the days it has it.</Text>
                  </View>
                )}
              </Row>
            ) : null}

            <Row label="Delivery Options:" top={Boolean(todayItem)}>
              <View style={styles.line}>
                <MapPinIcon size={14} color={t.neutral[500]} style={styles.lineIcon} />
                <Text style={[styles.lineText, styles.lineStrong]}>{place}</Text>
              </View>
              {etaLines.map((text) => (
                <View style={styles.line} key={text}>
                  <CalendarCheckIcon size={14} color={t.primary[700]} style={styles.lineIcon} />
                  <Text style={[styles.lineText, styles.eta]}>{text}</Text>
                </View>
              ))}
              {serviceLines.length > 0 ? serviceLines.map(({ Icon, text }) => (
                <View style={styles.line} key={text}>
                  <Icon size={14} color={t.neutral[500]} style={styles.lineIcon} />
                  <Text style={styles.lineText}>{text}</Text>
                </View>
              )) : (
                <Text style={[styles.lineText, styles.muted]}>Fulfilment and payment options are shown at checkout</Text>
              )}
            </Row>

            <ShippingRow product={product} unitPrice={unitPrice} municipalityId={isAuthenticated ? user?.municipalityId : undefined} onQuote={setShipQuote} />

            <Row label="Return & Warranty:" top>
              <View style={styles.line}>
                <InfoIcon size={14} color={t.neutral[500]} style={styles.lineIcon} />
                <Text style={styles.lineText}>{product.returnPolicy ? 'See seller policy below' : 'No seller return policy provided'}</Text>
              </View>
            </Row>

            {product.returnPolicy ? (
              <Row label="Seller return policy:">
                <Text style={styles.policy}>{product.returnPolicy}</Text>
              </Row>
            ) : null}

            <Pressable style={styles.optionsRow} onPress={() => setSheetMode('cart')} accessibilityRole="button">
              <Text style={[styles.rowLabel, styles.optionsLabel]}>{defs.length > 0 ? 'Options' : 'Quantity'}</Text>
              <Text style={styles.optionsValue} numberOfLines={1}>{optionsValue}</Text>
              <CaretRightIcon size={16} color={t.neutral[500]} />
            </Pressable>
          </View>
        </View>

        {/* Reviews */}
        <ProductSection sectionRef={sectionRef('reviews')}>
          <SectionHead style={styles.reviewsHead}>
            <SectionTitle count={reviewCount}>Reviews</SectionTitle>
            {reviews.length > 0 ? (
              <Pressable style={styles.viewAll} onPress={() => router.push(`/product/${product.slug}/reviews`)}>
                <Text style={styles.viewAllText}>View all</Text>
                <CaretRightIcon size={14} weight="bold" color={t.primary[700]} />
              </Pressable>
            ) : null}
          </SectionHead>
          {reviewCount > 0 ? (
            <View style={styles.ratingSum}>
              <Text style={styles.ratingSumScore}>{avgRating.toFixed(1)}</Text>
              <Stars rating={avgRating} size={14} />
              <Text style={styles.ratingSumText}>{reviewCount} {reviewCount === 1 ? 'rating' : 'ratings'}</Text>
            </View>
          ) : null}
          {product.status === 'APPROVED' ? (
            <Pressable style={styles.askLink} onPress={() => goToSection('questions')} accessibilityRole="button">
              <ChatCircleIcon size={15} color={t.primary[700]} />
              <Text style={styles.askLinkText}>Ask the shop about this product</Text>
              <CaretRightIcon size={14} color={t.primary[700]} style={styles.askCaret} />
            </Pressable>
          ) : null}
          <SectionBody>
            {reviews.length === 0 ? (
              <View style={styles.reviewsEmpty}>
                <EmptyArt name="reviews" size={72} style={styles.reviewsEmptyArt} />
                <Text style={styles.reviewsEmptyText}>No reviews yet. Be the first to review this product.</Text>
              </View>
            ) : reviews.slice(0, 10).map((r, i, all) => <ReviewItem key={r.id} review={r} last={i === all.length - 1} />)}
          </SectionBody>
        </ProductSection>

        {/* Questions and the shop's answers */}
        {product.status === 'APPROVED' ? (
          <ProductQuestions product={product} isOwnProduct={Boolean(user?.id && product.store?.owner?.id === user.id)} sectionRef={sectionRef('questions')} />
        ) : null}

        {/* The shop, and its shelf under it */}
        {product.store ? (
          <View style={styles.storeCard}>
            <View style={styles.storeLeft}>
              <StoreAvatar uri={shopLogo} />
              <View style={styles.storeText}>
                <Text style={styles.storeName} numberOfLines={1} ellipsizeMode="clip">{product.store.name}</Text>
                {storeFollow.count !== null ? (
                  <Text style={styles.storeFollowers}>{storeFollow.count} {storeFollow.count === 1 ? 'follower' : 'followers'}</Text>
                ) : null}
                {product.store.municipality?.name ? (
                  <View style={styles.storeMeta}>
                    <MapPinIcon size={12} color={t.neutral[500]} />
                    <Text style={styles.storeMetaText} numberOfLines={1}>{product.store.municipality.name}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.storeActions}>
              {!isOwnStore ? (
                <Pressable
                  style={[styles.storeBtn, styles.followBtn, storeFollow.following && styles.followingBtn, storeFollow.busy && styles.busy]}
                  onPress={toggleStoreFollow}
                  disabled={storeFollow.busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: storeFollow.following }}
                >
                  <Text style={[styles.storeBtnText, styles.followText, storeFollow.following && styles.followingText]}>
                    {storeFollow.following ? 'Following' : 'Follow'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.storeBtn} onPress={() => router.push(`/store/${product.store.slug}`)} accessibilityRole="link">
                <Text style={styles.storeBtnText}>Visit Store</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <ShopShelf sameShop={sameShopProducts} related={relatedProducts} onQuickAdd={quickAdd} />

        {/* Details: the specifications as chips, then the description */}
        <ProductSection sectionRef={sectionRef('details')}>
          <SectionHead><SectionTitle>Specifications</SectionTitle></SectionHead>
          <SectionBody style={styles.specsBody}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.specs}>
              <Spec label="Category" value={product.category?.name || '—'} />
              <Spec label="Origin" value={place} />
              <Spec label="Sold by" value={product.store?.name || '—'} />
              <Spec label="Stock" value={String(product.stock)} />
              <Spec label="SKU" value={product.id?.slice(0, 8).toUpperCase()} />
              <Spec label="Listed" value={localDate(product.createdAt)} />
            </ScrollView>
          </SectionBody>
        </ProductSection>
        <View style={styles.descCard}>
          <SectionHead style={styles.descHead}><SectionTitle>Product Description</SectionTitle></SectionHead>
          <SectionBody>
            <View style={[styles.desc, longDesc && !descOpen && styles.descClamped]}>
              {description
                ? description.split(/\n{2,}/).map((para, i, all) => (
                  <Text key={i} style={[styles.descP, i === all.length - 1 && styles.descPLast]}>{para}</Text>
                ))
                : <Text style={styles.descEmpty}>No description provided by the seller.</Text>}
              {longDesc && !descOpen ? <DescFade /> : null}
            </View>
            {longDesc ? (
              <Pressable style={styles.seeMore} onPress={() => setDescOpen((v) => !v)} accessibilityState={{ expanded: descOpen }}>
                <Text style={styles.seeMoreText}>{descOpen ? 'See less' : 'See more'}</Text>
                <CaretDownIcon size={14} color={t.primary[700]} style={descOpen ? styles.caretUp : null} />
              </Pressable>
            ) : null}
          </SectionBody>
        </View>

        <RelatedGrid products={relatedProducts} categoryId={product.categoryId} sectionRef={sectionRef('foryou')} />
      </ScrollView>

      {/* Action bar: Shop (its logo), Chat, add to cart, Buy now */}
      <View style={[styles.actionbar, { paddingBottom: 8 + insets.bottom }]}>
        <Pressable style={styles.action} onPress={() => router.push(product.store ? `/store/${product.store.slug}` : '/stores')} accessibilityRole="link">
          {shopLogo && failedLogo !== shopLogo
            ? <Image source={{ uri: shopLogo }} style={styles.shopLogo} onError={() => setFailedLogo(shopLogo)} />
            : <StorefrontIcon size={21} color={t.neutral[700]} />}
          <Text style={styles.actionText}>Shop</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => router.push(product.store ? `/messages?store=${product.store.id}` : '/messages')} accessibilityRole="link">
          <View>
            <ChatCircleIcon size={21} color={t.neutral[700]} />
            {chatUnread > 0 ? (
              <View style={styles.actionBadge}><Text style={styles.badgeText}>{chatUnread > 99 ? '99+' : chatUnread}</Text></View>
            ) : null}
          </View>
          <Text style={styles.actionText}>Chat</Text>
        </Pressable>
        {cannotBuy ? (
          <View style={[styles.buy, styles.closed]} accessibilityState={{ disabled: true }}>
            <Text style={[styles.buyText, styles.closedText]} numberOfLines={1}>{notTakingOrders ? closedLabel : 'Out of stock'}</Text>
          </View>
        ) : (
          <>
            <Pressable
              style={[styles.addcart, isAddingToCart && styles.disabled]}
              onPress={() => setSheetMode('cart')}
              disabled={isAddingToCart}
              accessibilityRole="button"
              accessibilityLabel="Add to cart"
            >
              <ShoppingCartSimpleIcon size={26} color={t.primary[700]} />
              <View style={styles.addcartPlus}><PlusIcon size={11} weight="bold" color={t.primary[700]} /></View>
            </Pressable>
            <Pressable style={[styles.buy, isAddingToCart && styles.disabled]} onPress={() => setSheetMode('buy')} disabled={isAddingToCart} accessibilityRole="button">
              <Text style={styles.buyText}>Buy now</Text>
              <View style={styles.buySmall}>
                <Text style={styles.buySmallText}>
                  {optionPriced && !optionChosen ? `from ${peso(range.min)}` : peso(unitPrice * quantity)}
                </Text>
                {buyNote ? (
                  <>
                    <View style={styles.buyRule} />
                    <Text style={styles.buySmallText}>{buyNote}</Text>
                  </>
                ) : null}
              </View>
            </Pressable>
          </>
        )}
      </View>

      <ProductOptionSheet
        mode={sheetMode}
        product={product}
        image={images[0]}
        selected={selectedVariations}
        onSelect={(name, value) => setSelectedVariations((current) => ({ ...current, [name]: value }))}
        quantity={quantity}
        onQuantity={setQuantity}
        onConfirm={confirmSheet}
        onClose={closeSheet}
        busy={isAddingToCart}
      />

      {showReport ? (
        <ReportSheet type="PRODUCT" productId={product.id} targetName={product.name} onClose={() => setShowReport(false)} />
      ) : null}
      <IdentityDialog
        open={identityOpen}
        onCancel={() => setIdentityOpen(false)}
        onVerify={() => { setIdentityOpen(false); router.push('/verification'); }}
      />
    </View>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

const HeartFill = (props) => <HeartIcon {...props} weight="fill" />;

/** A .pdp-row: rows after the first have a faint line on top too (phone CSS). */
function Row({ label, children, last, top }) {
  return (
    <View style={[styles.row, top && styles.rowTop, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowContent}>{children}</View>
    </View>
  );
}

/** "Shipping:" with the quote; the row stays (empty) until the quote comes, as on the website. */
function ShippingRow(props) {
  return (
    <Row label="Shipping:" top>
      <ShippingEstimate {...props} />
    </Row>
  );
}

function Spec({ label, value }) {
  return (
    <View style={styles.spec}>
      <Text style={styles.specLabel}>{label}</Text>
      <Text style={styles.specValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function GallerySlide({ src, width, label }) {
  const [failed, setFailed] = useState(false);
  const uri = src ? resolveImg(src) : null;
  return (
    <View style={[styles.slide, { width, height: Math.round((width * 6) / 5) }]} accessibilityRole="image" accessibilityLabel={label}>
      <Image
        source={uri && !failed ? { uri } : PLACEHOLDER}
        style={styles.slideImg}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

function StoreAvatar({ uri }) {
  const [failed, setFailed] = useState(false);
  return (
    <View style={styles.storeAvatar}>
      {uri && !failed
        ? <Image source={{ uri }} style={styles.storeAvatarImg} onError={() => setFailed(true)} />
        : <StorefrontIcon size={22} color={t.primary[700]} />}
    </View>
  );
}

/** The 95° sweep: brand green under the price, accent pink on the right. */
function BandGradient({ w, h }) {
  // CSS angle 95°: the line runs right and a little down, its length set so
  // the corners get the end colours (as linear-gradient() does).
  const a = (95 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = w / 2;
  const cy = h / 2;
  return (
    <Svg style={StyleSheet.absoluteFill} width={w} height={h}>
      <Defs>
        <LinearGradient
          id="pdp-band"
          gradientUnits="userSpaceOnUse"
          x1={cx - (dx * len) / 2}
          y1={cy - (dy * len) / 2}
          x2={cx + (dx * len) / 2}
          y2={cy + (dy * len) / 2}
        >
          <Stop offset="0" stopColor={t.primary[600]} />
          <Stop offset="0.06" stopColor={t.primary[600]} />
          <Stop offset="0.94" stopColor={t.accent[500]} />
          <Stop offset="1" stopColor={t.accent[500]} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={w} height={h} fill="url(#pdp-band)" />
    </Svg>
  );
}

/**
 * Bulk prices inside the price band (web .sale-bulk as a flex item of the
 * band): it narrows to its longest word, so the words stack.
 */
function BandBulk({ tiers }) {
  const tierText = tiers.map((tier) => `${tier.minQty}+ ${peso(tier.price)} each`);
  // About 7px a character at 12.5px: the narrowest the website lets it get.
  const longest = Math.max(...['Buy', 'more,', 'pay', 'less:', ...tierText.join(' ').split(' ')].map((w) => w.length));
  return (
    <View style={[styles.bandBulk, { minWidth: 20 + longest * 7 }]}>
      <Text style={[styles.bandBulkText, styles.bandBulkLead]}>Buy more, pay less:</Text>
      {tierText.map((text, i) => (
        <Text key={text} style={styles.bandBulkText}>
          {i > 0 ? <Text style={styles.bandBulkDot}>·  </Text> : null}
          {text}
        </Text>
      ))}
    </View>
  );
}

/** White fade over a clamped description's last lines. */
function DescFade() {
  return (
    <Svg style={styles.descFade} width="100%" height="48" pointerEvents="none">
      <Defs>
        <LinearGradient id="pdp-desc-fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#fff" stopOpacity="0" />
          <Stop offset="1" stopColor="#fff" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="48" fill="url(#pdp-desc-fade)" />
    </Svg>
  );
}

/** "· ends in 2h 10m", refreshed every 30 seconds (web TimeLeft). */
function TimeLeft({ until, prefix }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until || new Date(until).getTime() <= now) return null;
  return <Text style={styles.todayLeft} accessibilityRole="timer">{prefix} {leftLabel(until, now)}</Text>;
}

function ProductSkeleton({ insets, width, onBack }) {
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.head, { paddingTop: insets.top }]}>
        <View style={styles.topbar}>
          <ShellBarButton label="Back" onPress={onBack}>
            <CaretLeftIcon size={22} weight="bold" color={t.neutral[900]} />
          </ShellBarButton>
          <View style={styles.search} />
        </View>
      </View>
      <ScrollView style={styles.scroll} accessibilityLabel="Loading product">
        <LoadingSkeleton width={width} height={Math.round((width * 6) / 5)} borderRadius={0} />
        <View style={styles.skelBlock}>
          <LoadingSkeleton width="92%" height={18} />
          <LoadingSkeleton width="72%" height={18} />
          <LoadingSkeleton width={180} height={34} borderRadius={4} />
          <LoadingSkeleton width="100%" height={120} borderRadius={12} />
        </View>
        <View style={[styles.skelBlock, styles.skelGap]}>
          <LoadingSkeleton width={140} height={16} />
          <LoadingSkeleton width="100%" height={13} />
          <LoadingSkeleton width="80%" height={13} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  scroll: { flex: 1 },
  // The page's bottom padding above the action bar (layout-main 76px + 8px, less the 65px bar).
  scrollContent: { paddingBottom: 19 },

  head: { zIndex: 130, backgroundColor: '#fff' },
  topbar: {
    zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: HEAD_H, paddingHorizontal: 4,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: t.neutral[200],
  },
  search: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, marginHorizontal: 4, paddingHorizontal: 14,
    backgroundColor: t.neutral[100],
  },
  searchText: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500] },
  cartBadge: {
    position: 'absolute', top: -3 + 0, right: -5 + 0, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999,
    borderWidth: 1.5, borderColor: '#fff', backgroundColor: t.accent[500], alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10.5, lineHeight: 13, ...font(500), color: '#fff', textAlign: 'center' },
  tabs: {
    position: 'absolute', left: 0, right: 0, top: '100%', height: TABS_H, flexDirection: 'row',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: t.neutral[200],
    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 10, color: 'rgba(15, 23, 42, 0.05)' }],
  },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: t.neutral[500] },
  tabTextOn: { color: t.neutral[900] },
  tabLine: { position: 'absolute', bottom: 0, left: '50%', width: 28, height: 3, marginLeft: -14, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: t.primary[600] },

  gallery: { backgroundColor: '#fff' },
  slide: { backgroundColor: t.neutral[100] },
  slideImg: { width: '100%', height: '100%' },
  counter: { position: 'absolute', right: 12, bottom: 12, paddingVertical: 3, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(15, 23, 42, 0.72)' },
  counterText: { fontSize: 12, lineHeight: 19.2, ...font(500), color: '#fff', letterSpacing: 0.24 },
  pending: { position: 'absolute', left: 12, bottom: 12, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3, backgroundColor: t.warning[100] },
  pendingText: { fontSize: 11, lineHeight: 14, ...font(500), color: t.warning[800], letterSpacing: 0.22 },

  priceBand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: 16, overflow: 'hidden' },
  priceMain: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1 },
  pricePeso: { marginRight: 2, fontSize: 18, lineHeight: 30, ...font(500), color: '#fff', top: -2 },
  priceText: { fontSize: 30, lineHeight: 30, ...font(500), color: '#fff', letterSpacing: -0.3 },
  priceLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', flexShrink: 1 },
  priceMainCrowded: { flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 },
  bandWas: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  bandWasCrowded: { height: 30 },
  bandEnds: { flexShrink: 0, alignSelf: 'center' },
  bandBulk: {
    flexShrink: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4, columnGap: 8,
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: t.primary[50],
  },
  bandBulkText: { flexShrink: 1, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.primary[800] },
  bandBulkLead: { ...font(500) },
  bandBulkDot: { color: t.primary[400] },
  priceSideCrowded: { flexShrink: 1000, minWidth: 0, overflow: 'hidden' },
  bandWasOld: { fontSize: 13, lineHeight: 13, ...font(400), color: 'rgba(255,255,255,0.8)', textDecorationLine: 'line-through' },
  bandWasOff: {
    paddingVertical: 2, paddingHorizontal: 5, borderRadius: 4, overflow: 'hidden',
    fontSize: 11, lineHeight: 11, ...font(500), color: t.danger[700], backgroundColor: t.danger[50],
  },
  priceSide: { alignItems: 'flex-end', gap: 5, minWidth: 0, maxWidth: '45%', flexShrink: 0 },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.88, maxWidth: '100%' },
  placeText: { flexShrink: 1, fontSize: 12, lineHeight: 19.2, ...font(400), color: '#fff' },

  heroInfo: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: '#fff', gap: 12 },
  title: { marginBottom: 8, paddingRight: 80, fontSize: 17, lineHeight: 22.95, ...font(500), color: t.neutral[900] },
  titleTag: { marginRight: 6, paddingHorizontal: 6, marginBottom: -4 },
  titleTools: { position: 'absolute', top: 2, right: 6, flexDirection: 'row' },
  bookmark: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12, flexWrap: 'wrap' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingScore: {
    fontSize: 12, lineHeight: 19.2, ...font(500), color: t.warning[500], paddingBottom: 1,
    borderBottomWidth: 1, borderStyle: 'dotted', borderBottomColor: t.warning[500],
  },
  metaMuted: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  metaDivider: { width: 1, height: 14, backgroundColor: t.neutral[200] },
  metaLink: { fontSize: 12, lineHeight: 14.4, ...font(400), color: t.primary[700] },

  rows: { paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.neutral[50] },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.neutral[200] },
  rowTop: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { marginBottom: 6, fontSize: 12.5, lineHeight: 20, ...font(500), color: t.neutral[500] },
  rowContent: { gap: 5 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lineWrap: { flexWrap: 'wrap', alignItems: 'center' },
  lineIcon: { marginTop: 3.5 },
  lineText: { flexShrink: 1, fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[700] },
  lineStrong: { ...font(500), color: t.neutral[900] },
  eta: { ...font(500), color: t.primary[700] },
  muted: { color: t.neutral[500] },
  policy: { fontSize: 14, lineHeight: 21.7, ...font(400), color: t.neutral[700] },
  todayTag: { marginRight: 0 },
  todayState: { fontSize: 14, lineHeight: 21, ...font(500), color: t.primary[700] },
  today_live: {},
  today_soon: { color: '#b45309' },
  today_ended: { color: t.neutral[600], ...font(500) },
  todayLeft: { fontSize: 13, lineHeight: 21, ...font(400), color: t.neutral[600] },
  todayNote: { color: t.neutral[600], fontStyle: 'italic' },
  optionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  optionsLabel: { marginBottom: 0 },
  optionsValue: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[800] },

  reviewsHead: { minHeight: 0 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 32 },
  viewAllText: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.primary[700] },
  ratingSum: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, paddingHorizontal: 16 },
  ratingSumScore: { fontSize: 22, lineHeight: 22, ...font(500), color: t.neutral[900] },
  ratingSumText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  askLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, marginHorizontal: 16, paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: t.neutral[50],
  },
  askLinkText: { fontSize: 13.5, lineHeight: 21.6, ...font(500), color: t.primary[700] },
  askCaret: { marginLeft: 'auto' },
  reviewsEmpty: { paddingVertical: 4 },
  reviewsEmptyArt: { alignSelf: 'center' },
  reviewsEmptyText: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },

  storeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, paddingTop: 12, paddingHorizontal: 16, paddingBottom: 6, backgroundColor: '#fff' },
  storeLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  storeAvatar: { width: 44, height: 44, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50] },
  storeAvatarImg: { width: 44, height: 44 },
  storeText: { flex: 1, minWidth: 0, gap: 1 },
  storeName: { fontSize: 15, lineHeight: 18.75, ...font(500), color: t.neutral[900] },
  storeFollowers: { fontSize: 12.5, lineHeight: 16.25, ...font(400), color: t.neutral[600] },
  storeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  storeMetaText: { flexShrink: 1, fontSize: 12.5, lineHeight: 16.25, ...font(400), color: t.neutral[500] },
  storeActions: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  storeBtn: {
    minHeight: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: t.primary[600],
    alignItems: 'center', justifyContent: 'center',
  },
  storeBtnText: { fontSize: 13, lineHeight: 15.6, ...font(500), color: t.primary[700] },
  followBtn: { backgroundColor: t.primary[600] },
  followText: { color: '#fff' },
  followingBtn: { borderColor: t.neutral[300], backgroundColor: '#fff' },
  followingText: { color: t.neutral[700] },
  busy: { opacity: 0.6 },

  specsBody: { paddingHorizontal: 0 },
  specs: { gap: 8, paddingHorizontal: 16 },
  spec: { maxWidth: 180, gap: 2, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.neutral[50] },
  specLabel: { fontSize: 11.5, lineHeight: 18.4, ...font(500), color: t.neutral[500] },
  specValue: { fontSize: 13.5, lineHeight: 21.6, ...font(500), color: t.neutral[900] },
  descCard: { backgroundColor: '#fff' },
  descHead: { paddingTop: 4, minHeight: 28 },
  desc: { overflow: 'hidden' },
  descClamped: { maxHeight: 14 * 1.7 * 8 },
  descP: { marginBottom: 12, fontSize: 14, lineHeight: 23.8, ...font(400), color: t.neutral[700] },
  descPLast: { marginBottom: 0 },
  descEmpty: { paddingVertical: 4, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  descFade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  seeMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, paddingTop: 8 },
  seeMoreText: { fontSize: 13.5, lineHeight: 21.6, ...font(500), color: t.primary[700] },
  caretUp: { transform: [{ rotate: '180deg' }] },

  actionbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingHorizontal: 10,
    borderTopWidth: 1, borderTopColor: t.neutral[200], backgroundColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 16, color: 'rgba(15, 23, 42, 0.06)' }],
  },
  action: { width: 46, flexShrink: 0, alignItems: 'center', gap: 2 },
  actionText: { fontSize: 11, lineHeight: 17.6, ...font(500), color: t.neutral[700] },
  shopLogo: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: t.neutral[200] },
  actionBadge: {
    position: 'absolute', top: -7, left: 13, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 999,
    borderWidth: 1.5, borderColor: '#fff', backgroundColor: t.accent[500], alignItems: 'center', justifyContent: 'center',
  },
  addcart: { width: 64, height: 48, flexShrink: 0, borderRadius: 999, backgroundColor: t.primary[50], alignItems: 'center', justifyContent: 'center' },
  addcartPlus: { position: 'absolute', top: 17.5, right: 25.5 },
  buy: { flex: 1, minWidth: 0, height: 48, borderRadius: 999, backgroundColor: t.primary[600], alignItems: 'center', justifyContent: 'center' },
  buyText: { fontSize: 16, lineHeight: 17.6, ...font(500), color: '#fff' },
  buySmall: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingHorizontal: 8, overflow: 'hidden', opacity: 0.9 },
  buySmallText: { flexShrink: 0, fontSize: 11.5, lineHeight: 13.8, ...font(500), color: '#fff' },
  buyRule: { width: 1, height: 10, backgroundColor: '#fff', opacity: 0.6 },
  closed: { backgroundColor: t.neutral[300], opacity: 0.5 },
  closedText: { color: t.neutral[700] },
  disabled: { opacity: 0.5 },

  notFound: { alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#fff' },
  notFoundTitle: { fontSize: 20, lineHeight: 26, ...font(500), color: t.neutral[900] },
  notFoundBtn: { height: 44, paddingHorizontal: 20, borderRadius: 8, backgroundColor: t.primary[600], justifyContent: 'center' },
  notFoundBtnText: { fontSize: 14, ...font(500), color: '#fff' },
  skelBlock: { padding: 16, gap: 12, backgroundColor: '#fff' },
  skelGap: { marginTop: 8 },
});
