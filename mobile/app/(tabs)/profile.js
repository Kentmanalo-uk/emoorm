import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Edit, Package, Heart, MessageSquare, Bell, Store,
  ShoppingBag, Clock, Truck, Settings, LogOut,
} from 'lucide-react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import useAuthStore from '../../src/store/authStore';
import { colors, fontFamily, radius, spacing, typography } from '../../src/theme';

// Mirrors web/src/pages/Profile.jsx: header card (avatar/stats), My Purchase status
// grid, and a Services shortcut grid. Wishlist/Settings/Followed-Stores are still
// Phase 7 work, so those service items show a "coming soon" toast for now.
export default function Profile() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ toPayCount: 0, toShipCount: 0, toReceiveCount: 0, toPickupCount: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchProfileData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [profileRes, ordersRes] = await Promise.all([
        apiClient.get(ENDPOINTS.AUTH.PROFILE),
        apiClient.get(ENDPOINTS.ORDERS.MY_ORDERS),
      ]);
      setProfile(profileRes.data);
      const orders = ordersRes.data || [];
      setStats({
        toPayCount: orders.filter((o) => o.status === 'PENDING').length,
        toShipCount: orders.filter((o) => o.status === 'CONFIRMED').length,
        toReceiveCount: orders.filter((o) => o.status === 'PREPARING').length,
        toPickupCount: orders.filter((o) => o.status === 'READY').length,
      });
    } catch (err) {
      toast.error('Failed to load profile', err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  const comingSoon = (label) => toast.info(label, 'This lands in a future phase.');

  const purchaseTiles = [
    { key: 'pending', label: 'To Pay', Icon: ShoppingBag, count: stats.toPayCount },
    { key: 'processing', label: 'To Ship', Icon: Package, count: stats.toShipCount },
    { key: 'shipped', label: 'To Receive', Icon: Truck, count: stats.toReceiveCount },
    { key: 'ready', label: 'To Pick Up', Icon: Store, count: stats.toPickupCount },
  ];

  const serviceItems = [
    { label: 'Notifications', Icon: Bell, onPress: () => router.push('/notifications') },
    { label: 'Messages', Icon: MessageSquare, onPress: () => router.push('/messages') },
    { label: 'Wishlist', Icon: Heart, onPress: () => comingSoon('Wishlist') },
    { label: 'Settings', Icon: Settings, onPress: () => comingSoon('Settings') },
  ];

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const displayName = profile?.fullName || user?.fullName;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Header card */}
      <View style={styles.headerCard}>
        <View style={styles.headerLeft}>
          {profile?.profilePhoto ? (
            <Image source={{ uri: resolveImg(profile.profilePhoto) }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{displayName?.charAt(0)?.toUpperCase() || 'U'}</Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.email} numberOfLines={1}>{profile?.email || user?.email}</Text>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>0</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>0</Text>
                <Text style={styles.statLabel}>Wishlist</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statNumber}>0</Text>
                <Text style={styles.statLabel}>Reviews</Text>
              </View>
            </View>
          </View>
        </View>
        <Pressable style={styles.editButton} onPress={() => comingSoon('Edit Profile')}>
          <Edit size={16} color={colors.secondary} />
          <Text style={styles.editButtonText}>Edit</Text>
        </Pressable>
      </View>

      {/* My Purchase */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Purchase</Text>
          <Pressable onPress={() => router.push('/orders')}>
            <Text style={styles.sectionLink}>See All</Text>
          </Pressable>
        </View>
        <View style={styles.purchaseGrid}>
          {purchaseTiles.map(({ key, label, Icon, count }) => (
            <Pressable key={key} style={styles.purchaseItem} onPress={() => router.push('/orders')}>
              <View style={styles.purchaseIconWrap}>
                <Icon size={22} color={colors.textPrimary} />
                {count > 0 ? (
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

      {/* Services */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Services</Text>
        <View style={styles.servicesGrid}>
          {serviceItems.map(({ label, Icon, onPress }) => (
            <Pressable key={label} style={styles.serviceItem} onPress={onPress}>
              <View style={styles.serviceIconWrap}>
                <Icon size={20} color={colors.textPrimary} />
              </View>
              <Text style={styles.serviceLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Pressable style={styles.devLink} onPress={() => router.push('/design-system')}>
        <Text style={styles.devLinkText}>View design system demo →</Text>
      </Pressable>

      <Pressable style={styles.logoutButton} onPress={logout}>
        <LogOut size={16} color={colors.error} />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', flex: 1, gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: radius.full },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { ...typography.h2, color: colors.white },
  headerInfo: { flex: 1, gap: 2 },
  name: { ...typography.h3, color: colors.textPrimary },
  email: { ...typography.caption, color: colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  statItem: { alignItems: 'center' },
  statNumber: { ...typography.body, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.textPrimary },
  statLabel: { ...typography.caption, color: colors.textMuted },
  editButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editButtonText: { ...typography.caption, color: colors.secondary, fontWeight: '600', fontFamily: fontFamily.semiBold },

  section: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...typography.h3, color: colors.textPrimary },
  sectionLink: { ...typography.caption, color: colors.secondary, fontWeight: '600', fontFamily: fontFamily.semiBold },

  purchaseGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  purchaseItem: { alignItems: 'center', gap: spacing.xs, width: '22%' },
  purchaseIconWrap: { position: 'relative' },
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

  servicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  serviceItem: { alignItems: 'center', gap: spacing.xs, width: '22%' },
  serviceIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: colors.bgGreenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },

  devLink: { alignItems: 'center', paddingVertical: spacing.sm },
  devLinkText: { ...typography.caption, color: colors.textMuted },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  logoutText: { ...typography.body, color: colors.error, fontWeight: '600', fontFamily: fontFamily.semiBold },
});
