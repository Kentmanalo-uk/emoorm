import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  ArrowCounterClockwiseIcon, BellIcon, CaretRightIcon, ChatTextIcon, EnvelopeSimpleIcon, EyeIcon, GearIcon, GiftIcon, InfoIcon, ScanIcon,
  HandshakeIcon, HeartIcon, LifebuoyIcon, FlagIcon, MapPinIcon, PackageIcon, QuestionIcon, ShoppingBagIcon,
  StarIcon, StorefrontIcon, UsersThreeIcon,
} from '../../src/lib/icons';
import apiClient from '../../src/api/client';
import { resolveImg } from '../../src/lib/media';
import Avatar from '../../src/components/avatars/Avatar';
import { toast } from '../../src/lib/toast';
import { getCacheEntry, refreshCachedData } from '../../src/lib/dataCache';
import useAuthStore from '../../src/store/authStore';
import useWishlistStore from '../../src/store/wishlistStore';
import ShellBarButton from '../../src/components/ShellBarButton';
import { GoogleMark } from '../../src/components/auth/AuthForm';
import { useTabBarScroll } from '../../src/components/Glass';
import ShellPageMenu from '../../src/components/ShellPageMenu';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import { startAccountSwitch, useAccountSwitchStore } from '../../src/components/RoleSwitchOverlay';
import { GradientUserIcon, GreenToolIcon, useSvgId } from '../../src/components/profile/ProfileIcons';
import { PfRow, PfSection, PfTitle } from '../../src/components/profile/ProfileUI';
import RecentlyViewed from '../../src/components/profile/RecentlyViewed';
import { countBuyerTabs, errorText } from '../../src/components/profile/profileLib';
import { syncWishlist } from '../../src/components/profile/wishlistSync';
import MoreProducts from '../../src/components/home/MoreProducts';
import { font, t, themed } from '../../src/theme';
import HeaderGlow from '../../src/components/HeaderGlow';
import { openSwitchAccount } from '../../src/components/SwitchAccountSheet';
import { loadSavedAccounts, useSavedAccounts } from '../../src/store/savedAccounts';
import { PageLoader } from '../../src/components/BrandLoader';
import { PullScrollView } from '../../src/components/PullList';
import { useReferralSettings } from '../../src/lib/invite';

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
  const [resending, setResending] = useState(false);
  // Invite friends shows only while a super admin has invites on.
  const invitesOn = useReferralSettings().enabled;

  const [pullKey, setPullKey] = useState(0);

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
  }, [updateUser, pullKey]));

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
  const enterShop = () => startAccountSwitch('seller', '/seller', { replace: true });

  const name = profile?.fullName || user?.fullName || 'Your account';
  const email = profile?.email || user?.email;
  // From the store, not the snapshot: a picture picked a moment ago is
  // already here, and clearing a photo is not undone by a stale one.
  const photo = resolveImg(user?.profilePhoto ?? profile?.profilePhoto);
  const avatarKey = user?.avatarKey ?? profile?.avatarKey;
  /*
   * Signed up (or in) with Continue with Google: the picture wears a small
   * Google mark, so it is obvious which way back in to use. It stands for
   * the address being confirmed as well, and needs nothing else to say so:
   * signing in through Google sets isVerified itself (auth.service.js), so
   * every account with a googleId is already a confirmed one.
   *
   * This did briefly also require isVerified, which only ever subtracted:
   * one missing or late flag and the mark vanished from an account that
   * plainly had Google behind it.
   *
   * googleId is the third fallback because signing in through Google hands
   * back the account with that id on it but no hasGoogle -- the flag is
   * made by getProfile, which has not run yet. Without this the mark was
   * missing for the first seconds after a Google sign-in, which is exactly
   * when someone would look for it.
   */
  /*
   * On for everyone, for now, by request.
   *
   * The real test is the line under it and is still computed, so putting
   * this back is a one-word change: set ALWAYS to false. While it stands,
   * every account wears the mark, including ones made with an email and a
   * password, which cannot sign in through Google at all -- so the badge
   * is decoration here rather than a fact about the account.
   */
  const ALWAYS = true;
  const linkedToGoogle = Boolean(profile?.hasGoogle ?? user?.hasGoogle ?? user?.googleId);
  const usesGoogle = ALWAYS || linkedToGoogle;

  const header = (
    <ProfileHeader>
      {/* Log in on a computer: scan the website's "Log in with QR" code (qr-scan). */}
      {user?.id ? (
        <ShellBarButton label="Scan to log in on a computer" onPress={() => router.push('/qr-scan')}>
          <ScanIcon size={28} color={t.neutral[700]} />
        </ShellBarButton>
      ) : null}
      <ShellBarButton label="Settings" onPress={() => router.push('/settings')}>
        <GearIcon size={28} color={t.neutral[700]} />
      </ShellBarButton>
      <ShellPageMenu
        extra={user?.id ? [{ key: 'public', Icon: EyeIcon, label: 'View public profile', to: `/u/${user.id}` }] : []}
      />
    </ProfileHeader>
  );

  if (!summary) {
    return (
      <View style={styles.screen}>
        <ProfileScroll onPull={() => setPullKey((key) => key + 1)} header={header}><ProfileLoading /></ProfileScroll>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ProfileScroll
        onPull={() => setPullKey((key) => key + 1)}
        header={header}
        footer={<MoreProducts refreshKey={pullKey} />}
      >
        {/* Account card: tap to edit the name and photo. */}
        <View style={styles.card}>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Edit profile"
            onPress={() => router.push('/edit-profile')}
            style={({ pressed }) => [styles.id, pressed && styles.pressed]}
          >
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                {photo
                  ? <Image source={{ uri: photo }} style={styles.avatarImg} />
                  : <Avatar seed={user?.id} name={avatarKey} size={64} />}
              </View>
              {usesGoogle ? (
                <View
                  style={styles.googleMark}
                  accessibilityLabel={linkedToGoogle ? 'Signed in with Google, email confirmed' : 'Google'}
                >
                  <GoogleMark size={16} />
                </View>
              ) : null}
            </View>
            <View style={styles.idText}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {email ? (
                <View style={styles.emailLine}>
                  <Text style={styles.email} numberOfLines={1}>{email}</Text>
                  {emailUnverified ? <Text style={styles.unverified}>Unverified</Text> : null}
                </View>
              ) : null}
            </View>
            <CaretRightIcon size={18} color={t.neutral[300]} />
          </Pressable>
          {emailUnverified ? (
            <View style={styles.confirm} accessibilityRole="summary">
              <EnvelopeSimpleIcon size={29} weight="fill" color={t.warning[600]} />
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
          <PfRow Icon={HandshakeIcon} label="My Offers" onPress={() => router.push('/offers')} />
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
          {invitesOn ? <PfRow Icon={GiftIcon} label="Invite friends" onPress={() => router.push('/invite-friends')} /> : null}
          <PfRow Icon={LifebuoyIcon} label="Help & Support" onPress={() => router.push('/support')} />
          <PfRow Icon={FlagIcon} label="My Reports" onPress={() => router.push('/reports')} />
          <PfRow Icon={InfoIcon} label="About Emoorm" onPress={() => router.push('/about')} />
          <PfRow Icon={GearIcon} label="Settings" onPress={() => router.push('/settings')} />
        </PfSection>
      </ProfileScroll>
    </View>
  );
}

/** The Profile tab for a visitor: the same page, with a sign-in card in place of the account card. */
function Guest() {
  const router = useRouter();
  const toLogin = (redirect) => router.push({ pathname: '/login', params: { redirect } });
  // Accounts saved on this phone (Switch account): back into one without logging in.
  const saved = useSavedAccounts((s) => s.accounts);
  useEffect(() => { loadSavedAccounts(); }, []);
  return (
    <View style={styles.screen}>
      <ProfileScroll
        header={(
          <ProfileHeader>
            <ShellBarButton label="Help and support" onPress={() => router.push('/help-center')}>
              <QuestionIcon size={28} color={t.neutral[700]} />
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
              <Text style={[styles.guestBtnText, { color: t.onBrand }]}>Log in</Text>
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => router.push('/register')} style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.9 }]}>
              <Text style={styles.guestBtnText}>Sign up</Text>
            </Pressable>
          </View>
        </View>

        {saved.length ? (
          <PfSection list>
            <PfRow first Icon={UsersThreeIcon} label={`Saved accounts (${saved.length})`} onPress={openSwitchAccount} />
          </PfSection>
        ) : null}

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
          <PfRow Icon={InfoIcon} label="About Emoorm" onPress={() => router.push('/about')} />
        </PfSection>
      </ProfileScroll>
    </View>
  );
}

/**
 * The page scrolls under its bar, which is fixed at the top as Home's search
 * bar is (the 12px above it stays put too).
 */
function ProfileScroll({ header, children, footer = null, onPull }) {
  // Signed out there is nothing of theirs to reload.
  const List = onPull ? PullScrollView : ScrollView;
  const insets = useSafeAreaInsets();
  const tabScroll = useTabBarScroll();
  return (
    <>
      <HeaderGlow height={insets.top + GLOW_HEIGHT} />
      <View style={{ height: insets.top }} />
      <View style={styles.headGap} />
      {header}
      <List onPull={onPull} showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        {...tabScroll}
      >
        <View style={styles.content}>{children}</View>
        {footer}
      </List>
    </>
  );
}

// How far down the wash reaches under the status bar: the page's bar only (headGap 12 + bar 44).
const GLOW_HEIGHT = 56;

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
                <GreenToolIcon name={icon} size={29} />
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
  return <PageLoader minHeight={360} label="Loading your profile" />;
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  content: { gap: 12, paddingTop: 12, paddingBottom: 28 },

  headGap: { height: 12 },
  headWrap: { zIndex: 120 },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 44, paddingLeft: 12, paddingRight: 8,
  },
  headTitle: { fontSize: 22, lineHeight: 25.3, letterSpacing: -0.2, color: t.neutral[900], ...font(500) },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  card: { borderBottomWidth: 8, borderBottomColor: t.neutral[100] },
  id: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  pressed: { backgroundColor: t.neutral[50] },
  // The avatar clips what is inside it, so the mark sits in a wrapper
  // around it rather than in the circle.
  avatarWrap: { width: 64, height: 64 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: t.primary[50],
    boxShadow: `0px 0px 0px 1px ${t.neutral[200]}`,
  },
  /*
   * The G sits on the picture's edge at the lower right, white disc
   * first so it reads against a dark photo as well as a pale avatar.
   * -3 puts its centre on the circle itself rather than beside it, which
   * is what makes it look attached rather than dropped next to.
   */
  googleMark: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    // No ring and no shadow: the white disc is enough to lift it off the
    // picture, and an outline round a four-colour mark only muddies it.
    backgroundColor: t.neutral[0],
  },
  avatarImg: { width: 64, height: 64 },
  idText: { flex: 1, minWidth: 0, gap: 1 },
  /*
   * Both lines carried body leading -- 1.6 times their own size -- and
   * half of that sits above the text and half below, so the name and the
   * email were held about 12pt apart by nothing but air. At heading
   * leading they read as the pair they are.
   */
  name: { fontSize: 19, lineHeight: 24, color: t.neutral[900], ...font(500) },
  emailLine: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  email: { flexShrink: 1, fontSize: 14, lineHeight: 18, color: t.neutral[500], ...font(400) },
  unverified: {
    flexShrink: 0, marginLeft: 6, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.warning[50], color: t.warning[700], fontSize: 11, lineHeight: 18, ...font(500),
  },
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
  confirmBtnText: { fontSize: 13, lineHeight: 17, color: t.onBrand, ...font(500) },

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
  badgeText: { fontSize: 10.5, lineHeight: 14, color: t.onBrand, ...font(500) },

  skRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  skCounts: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14 },
}));
