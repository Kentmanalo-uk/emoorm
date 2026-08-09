import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Edit, Package, Heart, MessageSquare, Bell, Store, User,
  ShoppingBag, Truck, Settings, LogOut, MapPin, Star, CircleHelp, ChevronRight,
} from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import useWishlistStore from '../../src/store/wishlistStore';
import { ProfileSkeleton } from '../../src/components/SkeletonLayouts';
import Button from '../../src/components/Button';
import RoleSwitchOverlay from '../../src/components/RoleSwitchOverlay';
import { getCacheEntry, getCachedData, refreshCachedData } from '../../src/lib/dataCache';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

const PROFILE_CACHE_KEY = 'profile:summary';
const PROFILE_CACHE_TTL = 60 * 1000;

// Mirrors web/src/pages/Profile.jsx: header card (avatar/stats), My Purchase status
// grid, and a Services shortcut grid. Wishlist/Settings/Followed-Stores are still
// Phase 7 work, so those service items show a "coming soon" toast for now.
export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const wishlistCount = useWishlistStore((s) => s.items.length);

  const initialData = getCacheEntry(PROFILE_CACHE_KEY)?.data;
  const [profile, setProfile] = useState(initialData?.profile || null);
  const [stats, setStats] = useState(initialData?.stats || { toPayCount: 0, toShipCount: 0, toReceiveCount: 0, toPickupCount: 0, followingCount: 0, reviewCount: 0 });
  const [isLoading, setIsLoading] = useState(!initialData);
  const [switching, setSwitching] = useState(false);

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
        return { profile: profileRes.data, stats: {
          toPayCount: orders.filter((o) => o.status === 'PENDING').length,
          toShipCount: orders.filter((o) => o.status === 'CONFIRMED').length,
          toReceiveCount: orders.filter((o) => o.status === 'PREPARING').length,
          toPickupCount: orders.filter((o) => o.status === 'READY').length,
          followingCount: followsRes.data?.length || 0,
          reviewCount: reviewsRes.data?.length || 0,
        } };
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

  const serviceItems = [
    { label: 'Notifications', Icon: Bell, path: '/notifications' },
    { label: 'Messages', Icon: MessageSquare, path: '/messages' },
    { label: 'Wishlist', Icon: Heart, path: '/wishlist' },
    { label: 'Addresses', Icon: MapPin, path: '/addresses' },
    { label: 'Reviews', Icon: Star, path: '/reviews' },
    { label: 'Following', Icon: Store, path: '/followed-stores' },
    { label: 'Settings', Icon: Settings, path: '/settings' },
    { label: 'Help Center', Icon: CircleHelp, path: '/help-center', requiresAuth: false },
    { label: isAuthenticated && user?.role === 'SELLER' ? 'Seller Center' : 'Start Selling', Icon: ShoppingBag, path: isAuthenticated && user?.role === 'SELLER' ? '/seller' : '/seller-apply', animated: true },
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
        <Pressable accessibilityRole="button" accessibilityLabel="Profile settings" style={styles.headerAction} onPress={() => navigateTo('/settings')}>
          <Settings size={20} color={colors.textPrimary} />
        </Pressable>
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
            <Pressable accessibilityRole="button" style={styles.editButton} onPress={() => navigateTo('/settings')}>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Services</Text>
        <View style={styles.servicesList}>
          {serviceItems.map((item, index) => (
            <ServiceRow
              key={item.label}
              label={item.label}
              Icon={item.Icon}
              last={index === serviceItems.length - 1}
              onPress={() => handleServicePress(item)}
            />
          ))}
        </View>
      </View>

      <Pressable style={styles.devLink} onPress={() => navigateTo('/design-system', false)}>
        <Text style={styles.devLinkText}>View design system demo →</Text>
      </Pressable>

      {isAuthenticated ? (
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]} onPress={logout}>
          <LogOut size={18} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
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
        <Icon size={23} strokeWidth={1.6} color={colors.secondary} />
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
  purchaseIconWrap: { position: 'relative', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full, backgroundColor: colors.gray100 },
  purchaseBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: radius.full,
    backgroundColor: colors.error,
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

  devLink: { alignItems: 'center', paddingVertical: spacing.sm },
  devLinkText: { ...typography.caption, color: colors.textMuted },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    minHeight: 52,
    paddingVertical: spacing.md,
  },
  logoutText: { ...typography.body, color: colors.error, fontWeight: '600', fontFamily: fontFamily.semiBold },
  pressed: { opacity: 0.58 },
});
