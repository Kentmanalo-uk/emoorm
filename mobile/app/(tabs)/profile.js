import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  CaretRightIcon, EnvelopeSimpleIcon, EyeIcon, GearIcon, HeadsetIcon, InfoIcon, LifebuoyIcon, PackageIcon,
  QuestionIcon, ScanIcon, ShoppingBagIcon, StorefrontIcon, TruckIcon, UsersThreeIcon,
} from '../../src/lib/icons';
import {
  FlagArt, GiftArt, HeartArt, ParcelArt, PinArt, ReturnArt, ShopArt, StarArt, TagArt,
} from '../../src/components/art/FlatArt';
import apiClient from '../../src/api/client';
import { resolveImg } from '../../src/lib/media';
import Avatar from '../../src/components/avatars/Avatar';
import { toast } from '../../src/lib/toast';
import { getCacheEntry, refreshCachedData } from '../../src/lib/dataCache';
import useAuthStore from '../../src/store/authStore';
import ShellBarButton from '../../src/components/ShellBarButton';
import { GoogleMark } from '../../src/components/auth/AuthForm';
import { floatingTabBar, tabBarTop, useTabBarScroll } from '../../src/components/Glass';
import ShellPageMenu from '../../src/components/ShellPageMenu';
import { startAccountSwitch } from '../../src/components/RoleSwitchOverlay';
import { useSvgId } from '../../src/components/profile/ProfileIcons';
import { PfRow, PfSection, PfTitle } from '../../src/components/profile/ProfileUI';
import { ProfileLinks, ProfileTools } from '../../src/components/profile/ProfileTools';
import RecentlyViewed from '../../src/components/profile/RecentlyViewed';
import { countBuyerTabs, errorText } from '../../src/components/profile/profileLib';
import { syncWishlist } from '../../src/components/profile/wishlistSync';
import MoreProducts from '../../src/components/home/MoreProducts';
import { font, t, themed } from '../../src/theme';
import HeaderGlow, { useHeaderInk } from '../../src/components/HeaderGlow';
import { openSwitchAccount } from '../../src/components/SwitchAccountSheet';
import { loadSavedAccounts, useSavedAccounts } from '../../src/store/savedAccounts';
import { PageLoader } from '../../src/components/BrandLoader';
import { PullScrollView } from '../../src/components/PullList';
import { useReferralSettings } from '../../src/lib/invite';
import useAppSettings, { shortcutLook, shortcutScale } from '../../src/lib/appSettings';

const CACHE_KEY = 'profile:summary';

// My Purchase: thin grey outlines (web: weight light at 30 x the phone's
// 1.2 zoom = 36px, with an --icon-ink of 0.6 on the 1.5 stroke).
const PURCHASE = [
  ['To Pay', ShoppingBagIcon, 'to_pay'],
  ['To Ship', PackageIcon, 'to_ship'],
  ['To Receive', TruckIcon, 'to_receive'],
  ['To Pick Up', StorefrontIcon, 'to_pickup'],
];
const PURCHASE_ICON = 36;
const PURCHASE_STROKE = 1.5 * 0.6;

/*
 * The shortcuts (Home's marks): the same list signed in and out. `invite`
 * shows only while a super admin has invites on. The website's last tile,
 * Language, switches its Google Translate, which the app does not have, so
 * the app has no Language tile (as Settings has no Language row).
 */
const TOOLS = [
  ['orders', '/orders', 'My Orders', ParcelArt],
  ['returns', '/returns', 'Returns & Refunds', ReturnArt],
  ['addresses', '/addresses', 'My Addresses', PinArt],
  ['wishlist', '/wishlist', 'Wishlist', HeartArt],
  ['following', '/followed-stores', 'Followed Stores', ShopArt],
  ['reviews', '/reviews', 'My Reviews', StarArt],
  ['offers', '/offers', 'My Offers', TagArt],
  ['invite', '/invite-friends', 'Invite Friends', GiftArt],
  ['reports', '/reports', 'My Reports', FlagArt],
];

/** The shortcuts' look and size, as the super admin chose them. */
function useToolLook() {
  const settings = useAppSettings();
  return { look: shortcutLook(settings), scale: shortcutScale(settings) };
}

/**
 * The Profile tab on phones (web/src/pages/Profile.jsx, phone layout; for a
 * visitor web/src/components/ProfileGuest.jsx): the account card, My
 * Purchase, recently viewed, Home's marks as shortcuts to every account
 * page, a strip of help links, and for a seller a Switch to My Shop pill.
 * No Inbox section (Messages and Notifications are tabs) and no counts row.
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
  // The wishlist is brought up to date for the pages behind the shortcuts;
  // the page itself no longer shows counts of follows or reviews.
  await Promise.allSettled([syncWishlist()]);
  return {
    profile: profileRes.data,
    stats: {
      toPayCount: tabs.to_pay || 0,
      toShipCount: tabs.to_ship || 0,
      toReceiveCount: tabs.to_receive || 0,
      toPickupCount: tabs.to_pickup || 0,
    },
  };
};

function SignedIn() {
  // On the green header (super admin's choice) the bar is written in white.
  const ink = useHeaderInk();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [summary, setSummary] = useState(() => getCacheEntry(CACHE_KEY)?.data || null);
  const [resending, setResending] = useState(false);
  // Invite friends shows only while a super admin has invites on.
  const invitesOn = useReferralSettings().enabled;
  const { look, scale } = useToolLook();
  const isSeller = user?.role === 'SELLER';

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

  // Switch to My Shop: to the Seller Center, with the account-switch screen.
  const enterShop = () => startAccountSwitch('seller', '/seller', { replace: true });

  const tools = TOOLS
    .filter(([key]) => key !== 'invite' || invitesOn)
    .map(([key, to, label, Art]) => ({ key, label, Art, onPress: () => router.push(to) }));
  const links = [
    { key: 'help', Icon: LifebuoyIcon, label: 'Help Centre', onPress: () => router.push('/help-center') },
    { key: 'support', Icon: HeadsetIcon, label: 'Help & Support', onPress: () => router.push('/support') },
    { key: 'about', Icon: InfoIcon, label: 'About E-MOORM', onPress: () => router.push('/about') },
    !isSeller && { key: 'sell', Icon: StorefrontIcon, label: 'Sell on E-MOORM', onPress: () => router.push('/sell') },
  ].filter(Boolean);

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
          <ScanIcon size={28} color={ink ? ink.icon : t.neutral[700]} />
        </ShellBarButton>
      ) : null}
      <ShellBarButton label="Settings" onPress={() => router.push('/settings')}>
        <GearIcon size={28} color={ink ? ink.icon : t.neutral[700]} />
      </ShellBarButton>
      <ShellPageMenu
        barInk={ink}
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
        room={isSeller ? 64 : 0}
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
        </View>

        <Purchase counts={counts} onOpen={(to) => router.push(to)} />

        <RecentlyViewed userId={user?.id} />

        {/* The same marks as Home's shortcuts, in the look and size a super
            admin chose for them, in pages swiped sideways. */}
        <ProfileTools tools={tools} look={look} scale={scale} />

        {/* Help and the rest, on one strip. */}
        <ProfileLinks links={links} />
      </ProfileScroll>

      {/* A seller's way to their shop: a black pill easing in above the tab bar. */}
      {isSeller ? <ShopSwitchPill onPress={enterShop} /> : null}
    </View>
  );
}

/** The Profile tab for a visitor: the same page, with a sign-in card in place of the account card. */
function Guest() {
  // On the green header (super admin's choice) the bar is written in white.
  const ink = useHeaderInk();
  const router = useRouter();
  const toLogin = (redirect) => router.push({ pathname: '/login', params: { redirect } });
  // Accounts saved on this phone (Switch account): back into one without logging in.
  const saved = useSavedAccounts((s) => s.accounts);
  useEffect(() => { loadSavedAccounts(); }, []);
  const { look, scale } = useToolLook();
  // No Invite Friends signed out (the website's guest page has none).
  const tools = TOOLS
    .filter(([key]) => key !== 'invite')
    .map(([key, to, label, Art]) => ({ key, label, Art, onPress: () => toLogin(to) }));
  const links = [
    { key: 'help', Icon: LifebuoyIcon, label: 'Help Centre', onPress: () => router.push('/help-center') },
    { key: 'support', Icon: HeadsetIcon, label: 'Help & Support', onPress: () => toLogin('/support') },
    { key: 'about', Icon: InfoIcon, label: 'About E-MOORM', onPress: () => router.push('/about') },
    { key: 'sell', Icon: StorefrontIcon, label: 'Sell on E-MOORM', onPress: () => router.push('/sell') },
  ];
  return (
    <View style={styles.screen}>
      <ProfileScroll
        header={(
          <ProfileHeader>
            <ShellBarButton label="Help and support" onPress={() => router.push('/help-center')}>
              <QuestionIcon size={28} color={ink ? ink.icon : t.neutral[700]} />
            </ShellBarButton>
            <ShellPageMenu barInk={ink} />
          </ProfileHeader>
        )}
      >
        {/* The welcome card (web ProfileGuest.css .pf-guest-card): strong pink
            behind the white welcome, fading to white below the buttons, the
            sprout avatar, and Log in / Sign up under the welcome in bold. */}
        <View style={styles.card}>
          <GuestCardWash />
          <View style={styles.id}>
            <View style={styles.avatar}><AvatarTint><Avatar name="sprout" size={64} /></AvatarTint></View>
            <View style={styles.idText}>
              <Text style={styles.guestTitle} numberOfLines={1}>Welcome to E-MOORM</Text>
              <View style={styles.guestActions}>
                <Pressable accessibilityRole="link" onPress={() => toLogin('/profile')} style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.9 }]}>
                  <LoginGradient />
                  <Text style={[styles.guestBtnText, styles.guestBtnPrimaryText]}>Log in</Text>
                </Pressable>
                <Pressable accessibilityRole="link" onPress={() => router.push('/register')} style={({ pressed }) => [styles.guestBtn, styles.guestBtnQuiet, pressed && { opacity: 0.9 }]}>
                  <Text style={styles.guestBtnText}>Sign up</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {saved.length ? (
          <PfSection list>
            <PfRow first Icon={UsersThreeIcon} label={`Saved accounts (${saved.length})`} onPress={openSwitchAccount} />
          </PfSection>
        ) : null}

        <Purchase counts={{}} onOpen={(to) => toLogin(to)} />

        <RecentlyViewed />

        {/* The signed-in Profile's shortcuts and strip; what needs an
            account asks for one first. */}
        <ProfileTools tools={tools} look={look} scale={scale} />
        <ProfileLinks links={links} />
      </ProfileScroll>
    </View>
  );
}

/**
 * The page scrolls under its bar, which is fixed at the top as Home's search
 * bar is (the 12px above it stays put too).
 */
function ProfileScroll({
  header, children, footer = null, onPull, room = 0,
}) {
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
        {/* Room at the end so a pill over the page never covers the last row. */}
        {room ? <View style={{ height: room }} /> : null}
      </List>
    </>
  );
}

// How far down the wash reaches under the status bar: the page's bar only (headGap 12 + bar 44).
const GLOW_HEIGHT = 56;

/** The page's own bar (.profile-mobile-page-header): "Profile" and plain icon buttons. */
function ProfileHeader({ children }) {
  const ink = useHeaderInk();
  return (
    <View style={styles.headWrap}>
      <View style={styles.head}>
        <Text style={[styles.headTitle, ink && { color: ink.strong }]} accessibilityRole="header">Profile</Text>
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
        {PURCHASE.map(([label, Icon, status]) => {
          const count = counts[status] || 0;
          return (
            <Pressable key={label} accessibilityRole="link" accessibilityLabel={label} onPress={() => onOpen(`/orders?status=${status}`)} style={styles.purchaseItem}>
              <View style={styles.purchaseIcon}>
                <Icon size={PURCHASE_ICON} weight="light" strokeWidth={PURCHASE_STROKE} color={t.neutral[500]} />
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

/**
 * A seller's way to their shop (web .pf-m-switch): a black pill easing up
 * into place above the tab bar each time Profile is opened, and switching to
 * the Seller Center with the account switch's screen.
 */
function ShopSwitchPill({ onPress }) {
  const insets = useSafeAreaInsets();
  const shown = useRef(new Animated.Value(0)).current;

  // From 18px lower and a little smaller, after a moment (0.5s, 0.25s in,
  // the website's --pop-ease); at once when the phone asks for less motion.
  useFocusEffect(useCallback(() => {
    let live = true;
    let run = null;
    shown.setValue(0);
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (!live) return;
        if (reduce) { shown.setValue(1); return; }
        run = Animated.timing(shown, {
          toValue: 1,
          duration: 500,
          delay: 250,
          easing: Easing.bezier(0.65, 0, 0.35, 1),
          useNativeDriver: true,
        });
        run.start();
      });
    return () => { live = false; if (run) run.stop(); };
  }, [shown]));

  // Over the page's foot: above the tab bar where it lies over the page
  // (iOS 26), else above the page's bottom edge, which is the bar's top.
  const bottom = (floatingTabBar ? tabBarTop(insets) : 0) + 14;
  const motion = {
    opacity: shown,
    transform: [
      { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
    ],
  };

  return (
    <View pointerEvents="box-none" style={[styles.switchWrap, { bottom }]}>
      <Animated.View style={motion}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch to My Shop"
          onPress={onPress}
          style={({ pressed }) => [styles.switchPill, pressed && styles.switchPressed]}
        >
          <StorefrontIcon size={18} weight="fill" color={t.neutral[0]} />
          <Text style={styles.switchText}>Switch to My Shop</Text>
        </Pressable>
      </Animated.View>
    </View>
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

/** The guest card's wash: accent 600 → 500 (50%) → 200 (84%) → white, top to bottom. */
function GuestCardWash() {
  const id = useSvgId('pfguest');
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.accent[600]} />
          <Stop offset="0.5" stopColor={t.accent[500]} />
          <Stop offset="0.84" stopColor={t.accent[200]} />
          <Stop offset="1" stopColor={t.neutral[0]} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
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
  // The website's 19px welcome at body leading (1.6), in white on the pink.
  guestTitle: { fontSize: 19, lineHeight: 30.4, color: '#fff', ...font(500) },
  // Log in and Sign up side by side under it, in true bold.
  guestActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  guestBtn: {
    flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', height: 38, paddingHorizontal: 12,
    overflow: 'hidden', borderRadius: 10,
  },
  guestBtnQuiet: { backgroundColor: t.neutral[100] },
  guestBtnText: { fontSize: 14.5, lineHeight: 18, color: t.neutral[900], ...font(700) },
  guestBtnPrimaryText: { color: t.neutral[0] },

  confirm: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.warning[50] },
  confirmText: { flex: 1, minWidth: 0 },
  confirmTitle: { fontSize: 13, lineHeight: 17.55, color: t.neutral[900], ...font(500) },
  confirmBody: { fontSize: 13, lineHeight: 17.55, color: t.neutral[700], ...font(400) },
  confirmBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.warning[600] },
  confirmBtnText: { fontSize: 13, lineHeight: 17, color: t.onBrand, ...font(500) },

  // The Switch to My Shop pill: #111827 and white on the website, so the
  // ink's own pair here (light on dark, dark on light in dark mode).
  switchWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 118 },
  switchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 16, paddingRight: 20,
    borderRadius: 999, backgroundColor: t.neutral[900],
    boxShadow: [
      { offsetX: 0, offsetY: 10, blurRadius: 24, color: 'rgba(15, 23, 42, 0.28)' },
      { offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(15, 23, 42, 0.18)' },
    ],
  },
  switchPressed: { transform: [{ scale: 0.96 }] },
  // 600 on the website, which its phones draw at 500.
  switchText: { fontSize: 14.5, lineHeight: 20, color: t.neutral[0], ...font(500) },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(500) },
  purchase: { flexDirection: 'row', marginTop: 12 },
  purchaseItem: { flex: 1, alignItems: 'center', gap: 7 },
  purchaseIcon: { height: 36, alignItems: 'center', justifyContent: 'center' },
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
