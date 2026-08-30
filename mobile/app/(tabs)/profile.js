import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PencilSimpleIcon as Edit, PackageIcon as Package, HeartIcon as Heart, ChatTextIcon as MessageSquare, BellIcon as Bell, StorefrontIcon as Store, UserIcon as User,
  ShoppingBagIcon as ShoppingBag, TruckIcon as Truck, GearIcon as Settings, MapPinIcon as MapPin, StarIcon as Star, QuestionIcon as CircleHelp, CaretRightIcon as ChevronRight,
  QrCodeIcon as QrCode,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import useWishlistStore from '../../src/store/wishlistStore';
import { ProfileSkeleton } from '../../src/components/SkeletonLayouts';
import Button from '../../src/components/Button';
import ProductCard from '../../src/components/ProductCard';
import RoleSwitchOverlay from '../../src/components/RoleSwitchOverlay';
import { getCacheEntry, getCachedData, refreshCachedData } from '../../src/lib/dataCache';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

const PROFILE_CACHE_KEY = 'profile:summary';
const PROFILE_CACHE_TTL = 60 * 1000;
const SUGGESTIONS_CACHE_KEY = 'profile:suggestions';
const SUGGESTIONS_CACHE_TTL = 5 * 60 * 1000;

// Mirrors web/src/pages/Profile.jsx: header card (avatar/stats), My Purchase status
// grid, and a Services shortcut grid. Wishlist/Settings/Followed-Stores are still
// Phase 7 work, so those service items show a "coming soon" toast for now.
export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const wishlistCount = useWishlistStore((s) => s.items.length);

  const initialData = getCacheEntry(PROFILE_CACHE_KEY)?.data;
  const [profile, setProfile] = useState(initialData?.profile || null);
  const [stats, setStats] = useState(initialData?.stats || { toPayCount: 0, toShipCount: 0, toReceiveCount: 0, toPickupCount: 0, followingCount: 0, reviewCount: 0 });
  const [isLoading, setIsLoading] = useState(!initialData);
  const [switching, setSwitching] = useState(false);

  const initialSuggestions = getCacheEntry(SUGGESTIONS_CACHE_KEY)?.data;
  const [suggestions, setSuggestions] = useState(initialSuggestions || []);
  const [suggestionsLoading, setSuggestionsLoading] = useState(!initialSuggestions);

  const fetchProfileData = useCallback(async () => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    const fresh = getCachedData(PROFILE_CACHE_KEY, PROFILE_CACHE_TTL);
    if (fresh) {
      setProfile(fresh.profile);
      setStats(fresh.stats);
      setIsLoading(false);
      return;
    }
    try {
      const data = await refreshCachedData(PROFILE_CACHE_KEY, async () => {
        const [profileRes, ordersRes, followsRes, reviewsRes] = await Promise.all([
          apiClient.get(ENDPOINTS.AUTH.PROFILE),
          apiClient.get(ENDPOINTS.ORDERS.MY_ORDERS),
          apiClient.get(ENDPOINTS.FOLLOWS.MINE).catch(() => ({ data: [] })),
          apiClient.get(ENDPOINTS.REVIEWS.MY_REVIEWS).catch(() => ({ data: [] })),
        ]);
        const orders = ordersRes.data || [];
        return {
          profile: profileRes.data, stats: {
            toPayCount: orders.filter((o) => o.status === 'PENDING').length,
            toShipCount: orders.filter((o) => o.status === 'CONFIRMED').length,
            toReceiveCount: orders.filter((o) => o.status === 'PREPARING').length,
            toPickupCount: orders.filter((o) => o.status === 'READY').length,
            followingCount: followsRes.data?.length || 0,
            reviewCount: reviewsRes.data?.length || 0,
          }
        };
      });
      setProfile(data.profile);
      setStats(data.stats);
    } catch (err) {
      toast.error('Failed to load profile', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) fetchProfileData();
  }, [fetchProfileData, isAuthenticated]);

  useEffect(() => {
    const fresh = getCachedData(SUGGESTIONS_CACHE_KEY, SUGGESTIONS_CACHE_TTL);
    if (fresh) {
      setSuggestions(fresh);
      setSuggestionsLoading(false);
      return;
    }
    setSuggestionsLoading(true);
    refreshCachedData(SUGGESTIONS_CACHE_KEY, async () => {
      const response = await apiClient.get(ENDPOINTS.PRODUCTS, { params: { pageSize: 6, sortBy: 'createdAt', sortOrder: 'desc' } });
      return response.data || [];
    })
      .then(setSuggestions)
      .catch(() => setSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, []);

  const navigateTo = (path, requiresAuth = true) => {
    if (!isAuthenticated && requiresAuth) {
      router.push({ pathname: '/login', params: { redirect: path } });
      return;
    }
    router.push(path);
  };

  const purchaseTiles = [
    { key: 'to-pay', status: 'PENDING', label: 'To Pay', Icon: ShoppingBag, count: stats.toPayCount },
    { key: 'to-ship', status: 'CONFIRMED', label: 'To Ship', Icon: Package, count: stats.toShipCount },
    { key: 'to-receive', status: 'READY', label: 'To Receive', Icon: Truck, count: stats.toReceiveCount },
    { key: 'to-pickup', status: 'READY', label: 'To Pick Up', Icon: Store, count: stats.toPickupCount },
  ];

  const serviceSections = [
    {
      title: 'Activity',
      items: [
        { label: 'Notifications', Icon: Bell, path: '/notifications' },
        { label: 'Messages', Icon: MessageSquare, path: '/messages' },
        { label: 'Reviews', Icon: Star, path: '/reviews' },
      ],
    },
    {
      title: 'Shopping',
      items: [
        { label: 'Wishlist', Icon: Heart, path: '/wishlist' },
        { label: 'Following', Icon: Store, path: '/followed-stores' },
        { label: 'Addresses', Icon: MapPin, path: '/addresses' },
      ],
    },
    {
      title: 'More',
      items: [
        { label: 'Settings', Icon: Settings, path: '/settings' },
        { label: 'Help Center', Icon: CircleHelp, path: '/help-center', requiresAuth: false },
        { label: isAuthenticated && user?.role === 'SELLER' ? 'Seller Center' : 'Start Selling', Icon: ShoppingBag, path: isAuthenticated && user?.role === 'SELLER' ? '/seller' : '/seller-apply', animated: true },
      ],
    },
  ];

  const handleServicePress = ({ path, requiresAuth, animated }) => {
    if (animated && isAuthenticated) {
      setSwitching(true);
      setTimeout(() => { navigateTo(path, requiresAuth); setSwitching(false); }, 650);
      return;
    }
    navigateTo(path, requiresAuth);
  };

  if (isAuthenticated && isLoading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ProfileSkeleton />
      </View>
    );
  }

  const displayName = isAuthenticated ? profile?.fullName || user?.fullName : null;

  return (
    <>
      <ScrollView
        style={styles.screen}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.lg, paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl },
        ]}
      >
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>Profile</Text>
          <View style={styles.headerActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Scan QR to login" style={styles.headerAction} onPress={() => navigateTo('/qr-scan')}>
              <QrCode size={20} color={colors.textPrimary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Profile settings" style={styles.headerAction} onPress={() => navigateTo('/settings')}>
              <Settings size={20} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.headerCard}>
          <View style={styles.identityRow}>
            {isAuthenticated && profile?.profilePhoto ? (
              <Image source={{ uri: resolveImg(profile.profilePhoto) }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, isAuthenticated && styles.avatarAuthenticated]}>
                {isAuthenticated
                  ? <Text style={styles.avatarInitial}>{displayName?.charAt(0)?.toUpperCase() || 'U'}</Text>
                  : <User size={30} color={colors.textMuted} />}
              </View>
            )}
            <View style={styles.headerInfo}>
              {isAuthenticated ? (
                <>
                  <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.email} numberOfLines={1}>{profile?.email || user?.email}</Text>
                </>
              ) : (
                <Text style={styles.guestMessage}>Sign in to access your profile</Text>
              )}
            </View>
            {isAuthenticated ? (
              <Pressable accessibilityRole="button" style={styles.editButton} onPress={() => navigateTo('/edit-profile')}>
                <Edit size={15} color={colors.secondary} />
                <Text style={styles.editButtonText}>Edit</Text>
              </Pressable>
            ) : null}
          </View>
          {!isAuthenticated ? (
            <View style={styles.guestActions}>
              <Button title="Sign In" onPress={() => router.push({ pathname: '/login', params: { redirect: '/profile' } })} style={styles.guestAction} />
              <Button title="Sign Up" variant="secondary" onPress={() => router.push({ pathname: '/register', params: { redirect: '/profile' } })} style={styles.guestAction} />
            </View>
          ) : null}
          <View style={styles.statsRow}>
            <View style={styles.statItem}><Text style={styles.statNumber}>{isAuthenticated ? stats.followingCount : '—'}</Text><Text style={styles.statLabel}>Following</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}><Text style={styles.statNumber}>{isAuthenticated ? wishlistCount : '—'}</Text><Text style={styles.statLabel}>Wishlist</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}><Text style={styles.statNumber}>{isAuthenticated ? stats.reviewCount : '—'}</Text><Text style={styles.statLabel}>Reviews</Text></View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Purchase</Text>
            <Pressable accessibilityRole="button" style={styles.sectionAction} onPress={() => navigateTo('/orders')}>
              <Text style={styles.sectionLink}>See all</Text>
              <ChevronRight size={15} color={colors.textMuted} />
            </Pressable>
          </View>
          <View style={styles.purchaseGrid}>
            {purchaseTiles.map(({ key, status, label, Icon, count }) => (
              <Pressable accessibilityRole="button" key={key} style={({ pressed }) => [styles.purchaseItem, pressed && styles.pressed]} onPress={() => navigateTo(`/orders?status=${status}`)}>
                <View style={styles.purchaseIconWrap}>
                  <Icon size={21} color={colors.textPrimary} />
                  {isAuthenticated && count > 0 ? (
                    <View style={styles.purchaseBadge}>
                      <Text style={styles.purchaseBadgeText}>{count}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.purchaseLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {serviceSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.servicesList}>
              {section.items.map((item, index) => (
                <ServiceRow
                  key={item.label}
                  label={item.label}
                  Icon={item.Icon}
                  last={index === section.items.length - 1}
                  onPress={() => handleServicePress(item)}
                />
              ))}
            </View>
          </View>
        ))}

        {suggestions.length > 0 || suggestionsLoading ? (
          <View style={styles.suggestionsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>You May Also Like</Text>
              <Pressable accessibilityRole="button" style={styles.sectionAction} onPress={() => navigateTo('/products', false)}>
                <Text style={styles.sectionLink}>See all</Text>
                <ChevronRight size={15} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.productsGrid}>
              {suggestions.map((product) => (
                <ProductCard
                  key={product.id}
                  name={product.name}
                  price={product.price}
                  imageUrl={resolveImg(product.images?.[0])}
                  rating={product.averageRating}
                  reviewCount={product.reviewCount}
                  onPress={() => navigateTo(`/product/${product.slug}`, false)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <RoleSwitchOverlay
        visible={switching}
        label={user?.role === 'SELLER' ? 'Switching to Seller Center...' : 'Switching to Seller...'}
        Icon={ShoppingBag}
      />
    </>
  );
}

function ServiceRow({ label, Icon, last, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.serviceItem, !last && styles.serviceDivider, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.serviceIconWrap}>
        <Icon size={23} color={colors.secondary} weight="fill" />
      </View>
      <Text style={styles.serviceLabel}>{label}</Text>
      <ChevronRight size={18} color={colors.gray300} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { paddingHorizontal: spacing.lg, gap: spacing.lg },

  pageHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pageTitle: { ...typography.h1, color: colors.textPrimary },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.white },

  headerCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 68, height: 68, borderRadius: radius.full },
  avatarPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarAuthenticated: { backgroundColor: colors.primary },
  avatarInitial: { ...typography.h2, color: colors.white },
  headerInfo: { flex: 1, gap: spacing.xs },
  name: { ...typography.h2, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textSecondary },
  statsRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLight },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.borderLight },
  statNumber: { ...typography.h3, fontFamily: fontFamily.bold, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textMuted },
  editButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm },
  editButtonText: { ...typography.caption, color: colors.secondary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  guestMessage: { ...typography.body, color: colors.textPrimary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  guestActions: { flexDirection: 'row', gap: spacing.sm },
  guestAction: { flex: 1 },

  section: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  sectionAction: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: spacing.sm },
  sectionLink: { ...typography.caption, color: colors.secondary, fontWeight: '600', fontFamily: fontFamily.semiBold },

  purchaseGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  purchaseItem: { minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, width: '24%' },
  purchaseIconWrap: { position: 'relative', width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  purchaseBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.error,
    borderWidth: 1.5,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  purchaseBadgeText: { fontSize: 9, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.white },
  purchaseLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },

  servicesList: { marginHorizontal: -spacing.lg, marginBottom: -spacing.md },
  serviceItem: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  serviceDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  serviceIconWrap: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: { ...typography.body, flex: 1, color: colors.textPrimary },

  suggestionsSection: { gap: spacing.md },
  productsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between' },

  pressed: { opacity: 0.58 },
});
