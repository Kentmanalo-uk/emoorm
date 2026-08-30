import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon as ArrowLeft, ArrowsDownUpIcon as ArrowUpDown, ClockIcon as Clock3, HeartIcon as Heart, MapPinIcon as MapPin, ChatCircleIcon as MessageCircle, PackageIcon as Package, MagnifyingGlassIcon as Search, StarIcon as Star, StorefrontIcon as StoreIcon, UserCircleIcon as UserRound, UsersIcon as Users } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import ProductCard from '../../src/components/ProductCard';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import { ProductGridSkeleton } from '../../src/components/SkeletonLayouts';
import useAuthStore from '../../src/store/authStore';
import useCartStore from '../../src/store/cartStore';
import useRequireAuth from '../../src/hooks/useRequireAuth';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { colors, control, fontFamily, radius, spacing, typography } from '../../src/theme';

const SORTS = [
  { key: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'price_asc', label: 'Price: Low to High', sortBy: 'price', sortOrder: 'asc' },
  { key: 'price_desc', label: 'Price: High to Low', sortBy: 'price', sortOrder: 'desc' },
  { key: 'popular', label: 'Most Popular', sortBy: 'orderCount', sortOrder: 'desc' },
];

const activeStatus = (store) => {
  if (store?.isActive) return 'Active now';
  const timestamp = store?.updatedAt || store?.createdAt;
  if (!timestamp) return 'Active recently';
  const elapsedMinutes = Math.max(1, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (elapsedMinutes < 60) return `Active ${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `Active ${elapsedHours}hr ago`;
  return `Active ${Math.floor(elapsedHours / 24)}d ago`;
};

export default function StoreDetail() {
  const { slug } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const requireAuth = useRequireAuth();
  const addItem = useCartStore((state) => state.addItem);
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [loadingStore, setLoadingStore] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState('newest');
  const [followBusy, setFollowBusy] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const fetchStore = useCallback(async () => {
    setLoadingStore(true);
    try {
      const res = await apiClient.get(ENDPOINTS.STORES.STOREFRONT(slug));
      setStore(res.data);
    } catch (err) {
      toast.error('Failed to load store', err.message);
      router.replace('/stores');
    } finally {
      setLoadingStore(false);
    }
  }, [router, slug]);

  useEffect(() => { fetchStore(); }, [fetchStore]);

  const fetchProducts = useCallback(async () => {
    if (!store) return;
    setLoadingProducts(true);
    try {
      const selectedSort = SORTS.find((item) => item.key === sortKey) || SORTS[0];
      const params = {
        storeId: store.id,
        page: pagination.page,
        pageSize: 16,
        sortBy: category === 'new' ? 'createdAt' : selectedSort.sortBy,
        sortOrder: category === 'new' ? 'desc' : selectedSort.sortOrder,
      };
      if (category !== 'all' && category !== 'new') params.categoryId = category;
      if (search) params.search = search;
      const res = await apiClient.get(ENDPOINTS.PRODUCTS, { params });
      setProducts(res.data || []);
      setPagination((current) => ({ ...current, total: res.pagination?.total || 0, totalPages: res.pagination?.totalPages || 0 }));
    } catch (err) {
      toast.error('Failed to load products', err.message);
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [category, pagination.page, search, sortKey, store]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const changeCategory = (value) => {
    setCategory(value);
    setPagination((current) => ({ ...current, page: 1 }));
  };

  const toggleFollow = async () => {
    if (!store || store.ownerId === user?.id) return;
    if (!requireAuth(() => { }, `/store/${slug}`)) return;
    setFollowBusy(true);
    try {
      const res = store.isFollowing
        ? await apiClient.delete(ENDPOINTS.FOLLOWS.FOLLOW(store.id))
        : await apiClient.post(ENDPOINTS.FOLLOWS.FOLLOW(store.id));
      setStore((current) => ({ ...current, isFollowing: res.data.following, followerCount: res.data.followerCount }));
      toast.success(res.data.following ? `You now follow ${store.name}` : `Unfollowed ${store.name}`);
    } catch (err) {
      toast.error(err.message || 'Failed to update follow');
    } finally {
      setFollowBusy(false);
    }
  };

  const messageStore = () => requireAuth(
    () => router.push(`/messages?store=${store.id}`),
    `/store/${slug}`
  );

  const addToCart = (product) => {
    try {
      addItem({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.images?.[0],
        storeId: product.storeId,
        storeName: store.name,
        storeLogo: store.logo || store.logoUrl,
        storeSlug: store.slug,
        stock: product.stock,
        slug: product.slug,
        categoryId: product.categoryId,
      }, 1);
      toast.success(`${product.name} added to cart`);
    } catch (err) {
      toast.error(err.message || 'Failed to add to cart');
    }
  };

  if (loadingStore) return <StoreDetailSkeleton topInset={insets.top} />;
  if (!store) return null;

  const banner = store.bannerImage || store.coverImage;
  const logo = store.logoUrl || store.logo;
  const initials = store.name?.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
  const categories = [{ id: 'all', name: 'All Products' }, { id: 'new', name: 'New Listings' }, ...(store.categories || [])];
  const currentSort = SORTS.find((item) => item.key === sortKey) || SORTS[0];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top, minHeight: 56 + insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.iconButton} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><ArrowLeft size={21} color={colors.textPrimary} /></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{store.name}</Text>
        <View style={styles.iconButton} />
      </View>
      <FlatList
        data={loadingProducts ? [] : products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl }]}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              {banner ? <Image source={{ uri: resolveImg(banner) }} style={styles.banner} /> : <View style={[styles.banner, styles.bannerFallback]}><StoreIcon size={34} color={colors.secondary} opacity={0.22} /><Text style={styles.bannerLabel}>LOCAL STOREFRONT</Text></View>}
              <View style={styles.profileBody}>
                <View style={styles.identityCard}>
                  {logo ? <Image source={{ uri: resolveImg(logo) }} style={styles.logo} /> : <View style={styles.logoFallback}><Text style={styles.initials}>{initials}</Text></View>}
                  <View style={styles.identityText}>
                    <Text style={styles.storeName} numberOfLines={2}>{store.name}</Text>
                    <View style={styles.activeRow}><View style={[styles.activeDot, !store.isActive && styles.inactiveDot]} /><Text style={styles.activeText}>{activeStatus(store)}</Text></View>
                  </View>
                </View>
                <View style={styles.storeMetaRow}>
                  {store.municipality?.name ? <View style={styles.location}><MapPin size={15} color={colors.textMuted} /><Text style={styles.locationText}>{store.municipality.name}</Text></View> : null}
                  <Text style={styles.storeType}>Local marketplace seller</Text>
                </View>
                {store.description ? <View style={styles.about}><Text style={styles.sectionEyebrow}>ABOUT</Text><Text style={styles.description}>{store.description}</Text></View> : null}
                <View style={styles.stats}>
                  <Stat icon={<Star size={15} color={colors.star} weight="fill" />} value={Number(store.stats?.averageRating || 0).toFixed(1)} label={`${store.stats?.reviewCount || 0} reviews`} />
                  <Stat icon={<Package size={15} color={colors.secondary} />} value={store.stats?.productCount || 0} label="products" />
                  <Stat icon={<Users size={15} color={colors.secondary} />} value={store.followerCount || 0} label="followers" last />
                </View>
                <View style={styles.heroActions}>
                  {store.ownerId !== user?.id ? (
                    <Pressable accessibilityRole="button" style={[styles.followButton, store.isFollowing && styles.followingButton]} onPress={toggleFollow} disabled={followBusy}>
                      {followBusy ? <ActivityIndicator color={store.isFollowing ? colors.secondary : colors.white} /> : <><Heart size={17} color={store.isFollowing ? colors.secondary : colors.white} weight={store.isFollowing ? 'fill' : 'regular'} /><Text style={[styles.followText, store.isFollowing && styles.followingText]}>{store.isFollowing ? 'Following' : 'Follow'}</Text></>}
                    </Pressable>
                  ) : null}
                  <Pressable accessibilityRole="button" style={styles.messageButton} onPress={messageStore}><MessageCircle size={17} color={colors.secondary} /><Text style={styles.messageText}>Message</Text></Pressable>
                </View>
              </View>
            </View>

            {store.owner?.fullName || store.pickupAddress || store.businessHours ? <View style={styles.infoSection}>
              <Text style={styles.infoTitle}>Store details</Text>
              <View style={styles.infoStrip}>
                {store.owner?.fullName ? <StoreInfo Icon={UserRound} label="Seller" value={store.owner.fullName} /> : null}
                {store.pickupAddress ? <StoreInfo Icon={MapPin} label="Pickup" value={store.pickupAddress} /> : null}
                {store.businessHours ? <StoreInfo Icon={Clock3} label="Hours" value={store.businessHours} /> : null}
              </View>
            </View> : null}

            <View style={styles.catalogSection}>
              <View style={styles.productsHeader}>
                <View><Text style={styles.productsTitle}>Shop products</Text><Text style={styles.productsCount}>{pagination.total} {pagination.total === 1 ? 'item' : 'items'}</Text></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Sort products. Current: ${currentSort.label}`} style={styles.sortButton} onPress={() => {
                  const index = SORTS.findIndex((item) => item.key === sortKey);
                  setSortKey(SORTS[(index + 1) % SORTS.length].key);
                  setPagination((current) => ({ ...current, page: 1 }));
                }}><ArrowUpDown size={15} color={colors.textPrimary} /><Text style={styles.sortText}>{currentSort.key === 'newest' ? 'Newest' : currentSort.key === 'popular' ? 'Popular' : currentSort.key === 'price_asc' ? 'Price: Low' : 'Price: High'}</Text></Pressable>
              </View>
              <View style={styles.searchBar}><Search size={17} color={colors.gray400} /><TextInput style={styles.searchInput} value={rawSearch} onChangeText={setRawSearch} onSubmitEditing={() => { setSearch(rawSearch.trim()); setPagination((current) => ({ ...current, page: 1 })); }} placeholder="Search this store" placeholderTextColor={colors.textMuted} returnKeyType="search" /></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                {categories.map((item) => <Pressable accessibilityRole="button" key={item.id} style={[styles.tab, category === item.id && styles.tabActive]} onPress={() => changeCategory(item.id)}><Text style={[styles.tabText, category === item.id && styles.tabTextActive]}>{item.name}</Text></Pressable>)}
              </ScrollView>
            </View>
            {loadingProducts ? <ProductGridSkeleton count={4} /> : null}
            {!loadingProducts && products.length === 0 ? <View style={styles.empty}><StoreIcon size={38} color={colors.gray400} /><Text style={styles.emptyText}>No products match these filters.</Text></View> : null}
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <ProductCard name={item.name} price={item.price} imageUrl={resolveImg(item.images?.[0])} rating={item.averageRating} reviewCount={item.reviewCount} onPress={() => router.push(`/product/${item.slug}`)} onAddToCart={() => addToCart(item)} />
          </View>
        )}
        ListFooterComponent={pagination.totalPages > 1 ? (
          <View style={styles.pagination}>
            <Pressable style={[styles.pageButton, pagination.page <= 1 && styles.disabled]} disabled={pagination.page <= 1} onPress={() => setPagination((current) => ({ ...current, page: current.page - 1 }))}><Text style={styles.pageText}>Previous</Text></Pressable>
            <Text style={styles.pageInfo}>Page {pagination.page} of {pagination.totalPages}</Text>
            <Pressable style={[styles.pageButton, pagination.page >= pagination.totalPages && styles.disabled]} disabled={pagination.page >= pagination.totalPages} onPress={() => setPagination((current) => ({ ...current, page: current.page + 1 }))}><Text style={styles.pageText}>Next</Text></Pressable>
          </View>
        ) : null}
      />
    </View>
  );
}

function Stat({ icon, value, label, last = false }) {
  return <View style={[styles.stat, last && styles.statLast]}>{icon}<Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

function StoreInfo({ Icon, label, value }) {
  return <View style={styles.infoRow}><View style={styles.infoIcon}><Icon size={17} color={colors.secondary} /></View><View style={styles.infoBody}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>;
}

function StoreDetailSkeleton({ topInset }) {
  return <View style={styles.screen} accessibilityLabel="Loading store"><View style={[styles.header, { paddingTop: topInset, minHeight: 56 + topInset }]}><LoadingSkeleton width={44} height={44} borderRadius={radius.full} /><LoadingSkeleton width={128} height={18} /><View style={styles.iconButton} /></View><LoadingSkeleton width="100%" height={180} borderRadius={0} /><View style={styles.skeletonProfile}><View style={styles.skeletonIdentity}><LoadingSkeleton width={84} height={84} borderRadius={radius.lg} /><View style={styles.skeletonText}><LoadingSkeleton width="68%" height={22} /><LoadingSkeleton width="42%" height={13} /></View></View><LoadingSkeleton width="100%" height={70} borderRadius={radius.lg} /><LoadingSkeleton width="100%" height={48} borderRadius={radius.lg} /></View><ProductGridSkeleton count={4} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary }, centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.white },
  iconButton: { width: control.iconSize, height: control.iconSize, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' }, headerTitle: { ...typography.h3, flex: 1, textAlign: 'center', color: colors.textPrimary },
  content: {}, hero: { backgroundColor: colors.white }, banner: { width: '100%', height: 180 }, bannerFallback: { alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingBottom: spacing.xl, backgroundColor: colors.bgGreenLight }, bannerLabel: { fontSize: 10, lineHeight: 14, fontFamily: fontFamily.semiBold, color: colors.secondary },
  profileBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  identityCard: { flexDirection: 'row', gap: spacing.md, marginTop: -42, alignItems: 'flex-end' }, logo: { width: 88, height: 88, borderRadius: radius.lg, borderWidth: 4, borderColor: colors.white, backgroundColor: colors.gray100 },
  logoFallback: { width: 88, height: 88, borderRadius: radius.lg, borderWidth: 4, borderColor: colors.white, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgGreenLight }, initials: { ...typography.h2, color: colors.secondary },
  identityText: { flex: 1, paddingBottom: spacing.xs, gap: spacing.xs }, storeName: { ...typography.h2, color: colors.textPrimary }, activeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, activeDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.success }, activeText: { ...typography.caption, color: colors.textSecondary }, inactiveDot: { backgroundColor: colors.gray400 },
  storeMetaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }, storeType: { ...typography.caption, color: colors.textMuted },
  about: { gap: spacing.xs, marginTop: spacing.lg }, sectionEyebrow: { fontSize: 11, lineHeight: 15, fontFamily: fontFamily.semiBold, color: colors.textMuted }, description: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  stats: { minHeight: 72, flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.gray50 }, stat: { flex: 1, alignItems: 'center', gap: 2, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.borderLight }, statLast: { borderRightWidth: 0 }, statValue: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.bold, fontWeight: '700' }, statLabel: { ...typography.caption, color: colors.textMuted },
  location: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, locationText: { ...typography.caption, color: colors.textSecondary }, heroActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  followButton: { flex: 1, height: control.height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: radius.lg, backgroundColor: colors.secondary }, followingButton: { borderWidth: 1, borderColor: colors.secondary, backgroundColor: colors.white }, followText: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.white }, followingText: { color: colors.secondary },
  messageButton: { flex: 1, height: control.height, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderColor: colors.secondary, borderRadius: radius.lg, backgroundColor: colors.white }, messageText: { ...typography.body, fontFamily: fontFamily.semiBold, color: colors.secondary },
  infoSection: { marginTop: spacing.md, padding: spacing.lg, backgroundColor: colors.white }, infoTitle: { ...typography.h3, marginBottom: spacing.sm, color: colors.textPrimary }, infoStrip: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, borderRadius: radius.lg, paddingHorizontal: spacing.md, backgroundColor: colors.gray50, overflow: 'hidden' }, infoRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight }, infoIcon: { width: 36, height: 36, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white }, infoBody: { flex: 1, gap: 2 }, infoLabel: { ...typography.caption, color: colors.textMuted }, infoValue: { ...typography.body, color: colors.textPrimary },
  catalogSection: { marginTop: spacing.md, paddingTop: spacing.xl, backgroundColor: colors.bgSecondary }, productsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg }, productsTitle: { ...typography.h2, color: colors.textPrimary }, productsCount: { ...typography.caption, marginTop: 2, color: colors.textMuted }, sortButton: { minHeight: 40, maxWidth: 132, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, borderRadius: radius.lg, backgroundColor: colors.white }, sortText: { ...typography.caption, flexShrink: 1, color: colors.textPrimary },
  searchBar: { height: control.compactHeight, marginHorizontal: spacing.lg, marginVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, borderRadius: radius.lg, backgroundColor: colors.white }, searchInput: { ...typography.body, flex: 1, color: colors.textPrimary },
  tabs: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm }, tab: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight, borderRadius: radius.full, backgroundColor: colors.white }, tabActive: { borderColor: colors.secondary, backgroundColor: colors.secondary }, tabText: { ...typography.caption, fontFamily: fontFamily.medium, color: colors.textSecondary }, tabTextActive: { fontFamily: fontFamily.semiBold, color: colors.white },
  productsLoader: { marginVertical: spacing.xl }, empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl }, emptyText: { ...typography.body, color: colors.textSecondary }, gridRow: { gap: spacing.md, paddingHorizontal: spacing.lg }, gridItem: { flex: 1, marginBottom: spacing.md },
  pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg }, pageButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.lg, backgroundColor: colors.white }, pageText: { ...typography.caption, color: colors.secondary }, pageInfo: { ...typography.caption, color: colors.textSecondary }, disabled: { opacity: 0.4 },
  skeletonProfile: { padding: spacing.lg, gap: spacing.lg, backgroundColor: colors.white }, skeletonIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, skeletonText: { flex: 1, gap: spacing.sm },
});
