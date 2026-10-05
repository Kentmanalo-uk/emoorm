import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowCounterClockwiseIcon, BellIcon, CaretRightIcon, ChatTextIcon, EnvelopeSimpleIcon, EyeIcon, GearIcon,
  HeartIcon, LifebuoyIcon, FlagIcon, MapPinIcon, PackageIcon, PencilSimpleIcon, QuestionIcon, ShoppingBagIcon,
  StarIcon, StorefrontIcon,
} from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import { getCacheEntry, refreshCachedData } from '../../src/lib/dataCache';
import useAuthStore from '../../src/store/authStore';
import useWishlistStore from '../../src/store/wishlistStore';
import ShellBarButton from '../../src/components/ShellBarButton';
import ShellPageMenu from '../../src/components/ShellPageMenu';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import RoleSwitchOverlay, { useAccountSwitchStore } from '../../src/components/RoleSwitchOverlay';
import CartConfirmDialog from '../../src/components/cart/CartConfirmDialog';
import { GradientUserIcon, GreenToolIcon, useSvgId } from '../../src/components/profile/ProfileIcons';
import { PfRow, PfSection, PfTitle, SignOutRow } from '../../src/components/profile/ProfileUI';
import RecentlyViewed from '../../src/components/profile/RecentlyViewed';
import { countBuyerTabs, errorText } from '../../src/components/profile/profileLib';
import { syncWishlist } from '../../src/components/profile/wishlistSync';
import { font, t } from '../../src/theme';

const CACHE_KEY = 'profile:summary';

const PURCHASE = [
  ['To Pay', 'bag', 'to_pay'],
  ['To Ship', 'package', 'to_ship'],
  ['To Receive', 'truck', 'to_receive'],
  ['To Pick Up', 'store', 'to_pickup'],
];

/**
 * The Profile tab on phones (web/src/pages/Profile.jsx, phone layout; for a
 * visitor web/src/components/ProfileGuest.jsx): the account card with its
 * counts, My Purchase, recently viewed, the lists reaching every account
 * page, and Log out.
 */
export default function Profile() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <SignedIn /> : <Guest />;
}

/** Everything the page shows; the account and its orders first, the rest never hold it up. */
const loadSummary = async () => {
  const [profileRes, ordersRes] = await Promise.all([
    apiClient.get('/auth/profile'),
    apiClient.get('/orders/my/orders'),
  ]);
  const tabs = countBuyerTabs(ordersRes.data || []);
  const [following, reviews] = await Promise.allSettled([
    apiClient.get('/follows/me'),
    apiClient.get('/reviews/my/reviews', { params: { page: 1, pageSize: 1 } }),
    syncWishlist(),
  ]);
  return {
    profile: profileRes.data,
    stats: {
      toPayCount: tabs.to_pay || 0,
      toShipCount: tabs.to_ship || 0,
      toReceiveCount: tabs.to_receive || 0,
      toPickupCount: tabs.to_pickup || 0,
    },
    followingCount: following.status === 'fulfilled' && Array.isArray(following.value?.data) ? following.value.data.length : 0,
    reviewCount: reviews.status === 'fulfilled'
      ? reviews.value?.pagination?.total ?? (reviews.value?.data || []).length
      : 0,
  };
};

function SignedIn() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const wishlistCount = useWishlistStore((s) => s.items.length);
  const cachedShop = useAccountSwitchStore((s) => s.shop);
  const shop = cachedShop && (!cachedShop.ownerId || cachedShop.ownerId === user?.id) ? cachedShop : null;
  const [summary, setSummary] = useState(() => getCacheEntry(CACHE_KEY)?.data || null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [switching, setSwitching] = useState(false);

  // From what it showed last time while it is asked for again.
  useFocusEffect(useCallback(() => {
    let live = true;
    refreshCachedData(CACHE_KEY, loadSummary)
      .then((data) => {
        if (!live) return;
        setSummary(data);
        if (data?.profile) updateUser({ ...useAuthStore.getState().user, ...data.profile });
      })
      .catch((err) => { if (live) toast.error(errorText(err, 'Failed to load profile')); });
    return () => { live = false; };
  }, [updateUser]));

  const profile = summary?.profile || null;
  const stats = summary?.stats || { toPayCount: 0, toShipCount: 0, toReceiveCount: 0, toPickupCount: 0 };
  const followingCount = summary?.followingCount || 0;
  const reviewCount = summary?.reviewCount || 0;
  const counts = { to_pay: stats.toPayCount, to_ship: stats.toShipCount, to_receive: stats.toReceiveCount, to_pickup: stats.toPickupCount };

  // A typed-email account stays "Unverified" until it opens its welcome link.
  const emailUnverified = (profile?.isVerified ?? user?.isVerified) === false;
  const resendConfirmation = async () => {
    setResending(true);
    try {
      const res = await apiClient.post('/auth/resend-verification');
      toast.success(`We sent a new link to ${res.data?.email || 'your email'}.`);
    } catch (err) {
      toast.error(err.message || 'Could not send a new link. Try again in a minute.');
    } finally {
      setResending(false);
    }
  };

  // "My shop": the switch to the Seller Center, with the account-switch screen.
  const enterShop = () => {
    setSwitching(true);
    setTimeout(() => { router.push('/seller'); setTimeout(() => setSwitching(false), 400); }, 750);
  };

  const name = profile?.fullName || user?.fullName || 'Your account';
  const email = profile?.email || user?.email;
  const photo = resolveImg(profile?.profilePhoto || user?.profilePhoto);

  const header = (
    <ProfileHeader>
      {user?.id ? (
        <ShellBarButton label="View public profile" onPress={() => router.push(`/u/${user.id}`)}>
          <EyeIcon size={19} color={t.neutral[700]} />
        </ShellBarButton>
      ) : null}
      <ShellBarButton label="Settings" onPress={() => router.push('/settings')}>
        <GearIcon size={19} color={t.neutral[700]} />
      </ShellBarButton>
      <ShellPageMenu />
    </ProfileHeader>
  );

  if (!summary) {
    return (
      <View style={styles.screen}>
        <ProfileScroll header={header}><ProfileLoading /></ProfileScroll>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ProfileScroll header={header}>
        {/* Account card: tap to edit the name and photo. */}
        <View style={styles.card}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Edit profile"
            onPress={() => router.push('/edit-profile')}
            style={({ pressed }) => [styles.id, pressed && styles.pressed]}
          >
            <View style={styles.avatar}>
              {photo ? <Image source={{ uri: photo }} style={styles.avatarImg} /> : <AvatarTint><GradientUserIcon size={64} /></AvatarTint>}
            </View>
            <View style={styles.idText}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {email ? (
                <View style={styles.emailLine}>
                  <Text style={styles.email} numberOfLines={1}>{email}</Text>
                  {emailUnverified ? <Text style={styles.unverified}>Unverified</Text> : null}
                </View>
              ) : null}
              <View style={styles.editLink}>
                <PencilSimpleIcon size={12} weight="bold" color={t.primary[700]} />
                <Text style={styles.editText}>Edit profile</Text>
              </View>
            </View>
            <CaretRightIcon size={18} color={t.neutral[300]} />
          </Pressable>
          {emailUnverified ? (
            <View style={styles.confirm} accessibilityRole="summary">
              <EnvelopeSimpleIcon size={20} weight="fill" color={t.warning[600]} />
              <View style={styles.confirmText}>
                <Text style={styles.confirmTitle}>Confirm your email</Text>
                <Text style={styles.confirmBody}>Open the link we sent to your inbox.</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={resendConfirmation} disabled={resending} style={[styles.confirmBtn, resending && { opacity: 0.6 }]}>
                <Text style={styles.confirmBtnText}>{resending ? 'Sending…' : 'Resend'}</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.stats}>
            <Stat value={followingCount} label="Following" onPress={() => router.push('/followed-stores')} />
            <Stat value={wishlistCount} label="Wishlist" onPress={() => router.push('/wishlist')} line />
            <Stat value={reviewCount} label="Reviews" onPress={() => router.push('/reviews')} line />
          </View>
        </View>

        <Purchase counts={counts} onOpen={(to) => router.push(to)} />

        <RecentlyViewed userId={user?.id} />

        <PfSection list>
          <PfTitle list>Orders &amp; shopping</PfTitle>
          <PfRow first Icon={PackageIcon} label="My Orders" onPress={() => router.push('/orders')} />
          <PfRow Icon={ArrowCounterClockwiseIcon} label="Returns & refunds" onPress={() => router.push('/returns')} />
          <PfRow Icon={MapPinIcon} label="My Addresses" onPress={() => router.push('/addresses')} />
          <PfRow Icon={HeartIcon} label="Wishlist" hint={wishlistCount || null} onPress={() => router.push('/wishlist')} />
          <PfRow Icon={StorefrontIcon} label="Followed Stores" hint={followingCount || null} onPress={() => router.push('/followed-stores')} />
          <PfRow Icon={StarIcon} label="My Reviews" hint={reviewCount || null} onPress={() => router.push('/reviews')} />
        </PfSection>

        <PfSection list>
          <PfTitle list>Inbox</PfTitle>
          <PfRow first Icon={ChatTextIcon} label="Messages" onPress={() => router.push('/messages')} />
          <PfRow Icon={BellIcon} label="Notifications" onPress={() => router.push('/notifications')} />
        </PfSection>

        <PfSection list>
          <PfTitle list>More</PfTitle>
          {user?.role === 'SELLER'
            ? <PfRow first Icon={StorefrontIcon} label="My shop" hint={shop?.name || null} onPress={enterShop} />
            : <PfRow first Icon={ShoppingBagIcon} label="Sell on Emoorm" onPress={() => router.push('/seller-apply')} />}
          <PfRow Icon={LifebuoyIcon} label="Help & Support" onPress={() => router.push('/support')} />
          <PfRow Icon={FlagIcon} label="My Reports" onPress={() => router.push('/reports')} />
          <PfRow Icon={GearIcon} label="Settings" onPress={() => router.push('/settings')} />
        </PfSection>

        <SignOutRow onPress={() => setSignOutOpen(true)} />
      </ProfileScroll>

      <CartConfirmDialog
        open={signOutOpen}
        title="Log out?"
        message="You will need to log in again to place orders and see your account."
        confirmLabel="Log out"
        danger
        onConfirm={async () => { setSignOutOpen(false); await logout(); router.replace('/profile'); }}
        onCancel={() => setSignOutOpen(false)}
      />
      <RoleSwitchOverlay visible={switching} target="seller" />
    </View>
  );
}

/** The Profile tab for a visitor: the same page, with a sign-in card in place of the account card. */
function Guest() {
  const router = useRouter();
  const toLogin = (redirect) => router.push({ pathname: '/login', params: { redirect } });
  return (
    <View style={styles.screen}>
      <ProfileScroll
        header={(
          <ProfileHeader>
            <ShellBarButton label="Help and support" onPress={() => router.push('/help-center')}>
              <QuestionIcon size={19} color={t.neutral[700]} />
            </ShellBarButton>
            <ShellPageMenu />
          </ProfileHeader>
        )}
      >
        <View style={styles.card}>
          <View style={styles.id}>
            <View style={styles.avatar}><AvatarTint><GradientUserIcon size={64} /></AvatarTint></View>
            <View style={styles.idText}>
              <Text style={styles.name}>Welcome to E-MOORM</Text>
              <Text style={styles.guestText}>Log in to track orders, save favourites and chat with local sellers.</Text>
            </View>
          </View>
          <View style={styles.guestActions}>
            <Pressable accessibilityRole="link" onPress={() => toLogin('/profile')} style={({ pressed }) => [styles.guestBtn, styles.guestPrimary, pressed && { opacity: 0.9 }]}>
              <LoginGradient />
              <Text style={[styles.guestBtnText, { color: '#fff' }]}>Log in</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push('/register')} style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.9 }]}>
              <Text style={styles.guestBtnText}>Sign up</Text>
            </Pressable>
          </View>
        </View>

        <Purchase counts={{}} onOpen={(to) => toLogin(to)} />

        <RecentlyViewed />

        <PfSection list>
          <PfTitle list>Orders &amp; shopping</PfTitle>
          <PfRow first Icon={PackageIcon} label="My Orders" onPress={() => toLogin('/orders')} />
          <PfRow Icon={ArrowCounterClockwiseIcon} label="Returns & refunds" onPress={() => toLogin('/returns')} />
          <PfRow Icon={MapPinIcon} label="My Addresses" onPress={() => toLogin('/addresses')} />
          <PfRow Icon={HeartIcon} label="Wishlist" onPress={() => toLogin('/wishlist')} />
          <PfRow Icon={StorefrontIcon} label="Followed Stores" onPress={() => toLogin('/followed-stores')} />
          <PfRow Icon={StarIcon} label="My Reviews" onPress={() => toLogin('/reviews')} />
        </PfSection>

        <PfSection list>
          <PfTitle list>Inbox</PfTitle>
          <PfRow first Icon={ChatTextIcon} label="Messages" onPress={() => toLogin('/messages')} />
          <PfRow Icon={BellIcon} label="Notifications" onPress={() => toLogin('/notifications')} />
        </PfSection>

        <PfSection list last>
          <PfTitle list>More</PfTitle>
          <PfRow first Icon={ShoppingBagIcon} label="Sell on Emoorm" onPress={() => router.push('/seller-apply')} />
          <PfRow Icon={LifebuoyIcon} label="Help & Support" onPress={() => router.push('/help-center')} />
        </PfSection>
      </ProfileScroll>
    </View>
  );
}

/**
 * The page scrolls under its bar: the 12px above the bar scrolls away and the
 * bar stays pinned (the website's sticky .profile-mobile-page-header).
 */
function ProfileScroll({ header, children }) {
  const insets = useSafeAreaInsets();
  return (
    <>
      <View style={{ height: insets.top, backgroundColor: t.neutral[0] }} />
      <ScrollView style={styles.scroll} stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false}>
        <View style={styles.headGap} />
        {header}
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </>
  );
}

/** The page's own bar (.profile-mobile-page-header): "Profile" and plain icon buttons. */
function ProfileHeader({ children }) {
  return (
    <View style={styles.headWrap}>
      <View style={styles.head}>
        <Text style={styles.headTitle} accessibilityRole="header">Profile</Text>
        <View style={styles.headActions}>{children}</View>
      </View>
    </View>
  );
}

function Purchase({ counts, onOpen }) {
  return (
    <PfSection>
      <View style={styles.sectionHead}>
        <PfTitle>My Purchase</PfTitle>
        <Pressable accessibilityRole="link" onPress={() => onOpen('/orders')} style={styles.seeAll}>
          <Text style={styles.seeAllText}>See all</Text>
          <CaretRightIcon size={13} weight="bold" color={t.neutral[500]} />
        </Pressable>
      </View>
      <View style={styles.purchase}>
        {PURCHASE.map(([label, icon, status]) => {
          const count = counts[status] || 0;
          return (
            <Pressable key={label} accessibilityRole="link" accessibilityLabel={label} onPress={() => onOpen(`/orders?status=${status}`)} style={styles.purchaseItem}>
              <View style={styles.purchaseIcon}>
                <GreenToolIcon name={icon} size={27} />
                {count > 0 ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View>
                ) : null}
              </View>
              <Text style={styles.purchaseLabel}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </PfSection>
  );
}

function Stat({ value, label, onPress, line = false }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.stat, line && styles.statLine, pressed && styles.pressed]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

/** The soft green-to-pink tint behind the default picture (135deg, #ecfdf5 → #fdf2f8). */
function AvatarTint({ children }) {
  const id = useSvgId('pftint');
  return (
    <View style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#ecfdf5" />
            <Stop offset="1" stopColor="#fdf2f8" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {/* A view of its own, so the picture paints over the tint. */}
      <View style={StyleSheet.absoluteFill}>{children}</View>
    </View>
  );
}

/** Log in: E-MOORM green with a touch of pink toward its end (110deg, #059669 70% → #E0559B 175%). */
function LoginGradient() {
  const id = useSvgId('pflogin');
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0.32" x2="1" y2="0.68">
          <Stop offset="0" stopColor="#059669" />
          <Stop offset="0.7" stopColor="#059669" />
          <Stop offset="1" stopColor="#438377" />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/** While the page is asked for the first time (web ProfileSkeleton). */
function ProfileLoading() {
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.card, styles.skRow]}>
        <LoadingSkeleton width={64} height={64} borderRadius={32} />
        <View style={{ flex: 1, gap: 8 }}>
          <LoadingSkeleton width="55%" height={16} />
          <LoadingSkeleton width="40%" height={11} />
        </View>
      </View>
      <View style={[styles.card, styles.skCounts]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: 6 }}>
            <LoadingSkeleton width={28} height={18} />
            <LoadingSkeleton width={56} height={10} />
          </View>
        ))}
      </View>
      <View style={[styles.card, { padding: 16, gap: 14 }]}>
        <LoadingSkeleton width={110} height={14} />
        <View style={styles.skCounts}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <LoadingSkeleton width={28} height={28} borderRadius={8} />
              <LoadingSkeleton width={48} height={10} />
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.card, { padding: 16, gap: 18 }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.skRow, { padding: 0 }]}>
            <LoadingSkeleton width={22} height={22} borderRadius={6} />
            <LoadingSkeleton width="50%" height={13} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { gap: 12, paddingTop: 12, paddingBottom: 28 },

  headGap: { height: 12, backgroundColor: t.neutral[0] },
  headWrap: { backgroundColor: t.neutral[0], zIndex: 120 },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44, paddingLeft: 12, paddingRight: 8,
    borderBottomWidth: 1, borderBottomColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  headTitle: { fontSize: 22, lineHeight: 25.3, letterSpacing: -0.2, color: t.neutral[900], ...font(500) },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  card: { backgroundColor: t.neutral[0], borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
  id: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  pressed: { backgroundColor: t.neutral[50] },
  avatar: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: t.primary[50] },
  avatarImg: { width: 64, height: 64 },
  idText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 19, lineHeight: 30.4, color: t.neutral[900], ...font(500) },
  emailLine: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  email: { flexShrink: 1, fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },
  unverified: {
    flexShrink: 0, marginLeft: 6, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.warning[50], color: t.warning[700], fontSize: 11, lineHeight: 18, ...font(500),
  },
  editLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  editText: { fontSize: 13.5, lineHeight: 21.6, color: t.primary[700], ...font(500) },
  guestText: { fontSize: 14, lineHeight: 20.3, color: t.neutral[500], ...font(400) },
  guestActions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 16 },
  guestBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', height: 44, overflow: 'hidden',
    borderWidth: 1, borderColor: t.primary[600], borderRadius: 12, backgroundColor: t.neutral[0],
  },
  guestPrimary: { borderColor: 'transparent' },
  guestBtnText: { fontSize: 15, lineHeight: 20, color: t.primary[700], ...font(500) },

  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.warning[50] },
  confirmText: { flex: 1, minWidth: 0 },
  confirmTitle: { fontSize: 13, lineHeight: 17.55, color: t.neutral[900], ...font(500) },
  confirmBody: { fontSize: 13, lineHeight: 17.55, color: t.neutral[700], ...font(400) },
  confirmBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.warning[600] },
  confirmBtnText: { fontSize: 13, lineHeight: 17, color: '#fff', ...font(500) },

  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.neutral[100] },
  stat: { flex: 1, alignItems: 'center', gap: 1, paddingVertical: 12 },
  statLine: { borderLeftWidth: 1, borderLeftColor: t.neutral[100] },
  statValue: { fontSize: 19, lineHeight: 30.4, color: t.neutral[900], ...font(500) },
  statLabel: { fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(500) },
  purchase: { flexDirection: 'row', marginTop: 12 },
  purchaseItem: { flex: 1, alignItems: 'center', gap: 7 },
  purchaseIcon: { height: 32, alignItems: 'center', justifyContent: 'center' },
  purchaseLabel: { fontSize: 13.5, lineHeight: 21.6, color: t.neutral[700], ...font(400) },
  badge: {
    position: 'absolute', top: -4, right: -10, minWidth: 18, height: 18, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: t.neutral[0], borderRadius: 999, backgroundColor: t.accent[500],
  },
  badgeText: { fontSize: 10.5, lineHeight: 14, color: '#fff', ...font(500) },

  skRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  skCounts: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14 },
});
