import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ArrowsLeftRightIcon, BellIcon, CaretRightIcon, ChatTextIcon, GearIcon, HandshakeIcon, HeadsetIcon, HeartbeatIcon,
  IdentificationCardIcon, LifebuoyIcon, MapPinIcon, PaintBrushIcon, QrCodeIcon, QuestionIcon, SignOutIcon,
  StorefrontIcon, TruckIcon, UserIcon, WalletIcon,
} from '../../../src/lib/icons';
import apiClient from '../../../src/api/client';
import useAuthStore from '../../../src/store/authStore';
import { BACKEND_URL, resolveImg } from '../../../src/lib/media';
import { getCacheEntry, setCachedData } from '../../../src/lib/dataCache';
import SellerPage from '../../../src/components/seller/SellerPage';
import { SellerMeHeader } from '../../../src/components/seller/SellerTopBars';
import { useSellerShell } from '../../../src/components/seller/SellerShell';
import { MeCard, MeList, MeRow, meStyles } from '../../../src/components/seller/me/MeParts';
import ShopQrPop from '../../../src/components/seller/me/ShopQrPop';
import { qrMethod } from '../../../src/components/seller/me/qrPayment';
import { font, t, themed } from '../../../src/theme';

/*
 * /seller/menu, "Me" (web/src/pages/SellerMenu.jsx + SellerApp.css .sme-*),
 * drawn like the buyer's Profile: the shop card with its numbers, how the
 * shop is doing, View shop / Decorate, Shop QR (the printable poster, once
 * the shop is approved), then Finance, Delivery & payment
 * (each part straight to its page), Contact & help and Settings as plain
 * lists, and Log out. Setup steps live on Home ("Complete your shop").
 *
 * Differences from the website:
 * - Offers (/seller/offers) is listed under Contact & help, right after
 *   Buyer questions, as the website's computer sidebar does; its phone Me
 *   page does not list it yet.
 * - No Language row: the website's comes from Google Translate, which the
 *   app does not have.
 * - Send feedback opens the app's Feedback page (the website opens a dialog).
 */

const MODE_HINTS = { DELIVERY: 'Delivery', PICKUP: 'Pickup', BOTH: 'Both' };

const HEALTH = {
  EXCELLENT: { label: 'Excellent', tone: 'good' },
  GOOD: { label: 'Good', tone: 'ok' },
  NEEDS_ATTENTION: { label: 'Needs attention', tone: 'bad' },
};

// The health row's icon tile and level colour, per tone (.sh-notice is-*, .sme-health is-*).
const TONES = themed(() => ({
  good: { bg: t.primary[50], icon: t.primary[600], level: t.primary[700] },
  ok: { bg: t.warning[50], icon: t.warning[600], level: t.warning[700] },
  bad: { bg: t.danger[50], icon: t.danger[600], level: t.danger[700] },
  none: { bg: t.neutral[100], icon: t.neutral[500], level: t.neutral[900] },
}));

const HEALTH_KEY = 'seller:health';

// A number as toLocaleString('en-PH') prints it: 1,234.5 (up to 3 decimals).
const plainNumber = (n) => {
  const [whole, part] = String(Math.round(Number(n) * 1000) / 1000).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${part ? `.${part}` : ''}`;
};

export default function SellerMeScreen() {
  const router = useRouter();
  const {
    store, setup, unreadCount = 0, waiting = {}, refreshCounts, switchToPersonal, requestLogout,
  } = useSellerShell();
  const user = useAuthStore((s) => s.user);
  // Shop health as it was last time, while it is asked for again.
  const [health, setHealth] = useState(() => getCacheEntry(HEALTH_KEY)?.data ?? null);
  const [refreshing, setRefreshing] = useState(false);
  // The shop's logo on the card: the QR card grows out of it, and stands in for it while out.
  const logoRef = useRef(null);
  const [qrOut, setQrOut] = useState(false);

  const loadHealth = useCallback(() => apiClient.get('/stores/my/health')
    .then((res) => {
      setHealth(res.data);
      setCachedData(HEALTH_KEY, res.data);
    })
    .catch(() => setHealth(false)), []);

  // The website asks each time the page opens; a tab stays open, so ask each time it is shown.
  useFocusEffect(useCallback(() => { loadHealth(); }, [loadHealth]));

  const refresh = async () => {
    setRefreshing(true);
    refreshCounts?.();
    await loadHealth();
    setRefreshing(false);
  };

  const name = store?.name || 'My shop';
  const identity = setup?.steps?.find((step) => step.key === 'identity');
  const identityHint = identity?.done ? 'Verified' : identity?.status === 'FAILED' ? 'Try again' : 'Not yet';
  const healthMeta = health ? HEALTH[health.level] : null;
  const tone = TONES[healthMeta?.tone || 'none'];
  const count = (path) => waiting?.[path]?.count || 0;
  const canShare = Boolean(store?.slug && store?.isApproved !== false);
  const shareShop = () => {
    if (!canShare) return;
    const url = `${BACKEND_URL}/store/${store.slug}`;
    Share.share({ title: name, message: `Shop at ${name} on Emoorm\n${url}`, url }).catch(() => {});
  };
  const stat = (value) => (health ? value : '–');

  // Delivery & payment: what is set now, and the parts still missing
  // (the checklist says whether the delivery areas and fees are done).
  const mode = store?.fulfillmentMode || 'DELIVERY';
  const delivers = mode !== 'PICKUP';
  const picksUp = mode !== 'DELIVERY';
  const pickupSet = Boolean(String(store?.pickupAddress || '').trim());
  const stepDone = (key) => setup?.steps?.find((step) => step.key === key)?.done;
  const deliverySet = !setup || (stepDone('delivery-areas') !== false && stepDone('delivery-fee') !== false);
  const fee = store?.deliveryFee == null ? null : Number(store.deliveryFee);
  // How the shop charges for its own delivery (deliveryQuote.service).
  const feeHint = {
    FREE: 'Free',
    FLAT: fee === null ? 'Same fee' : fee === 0 ? 'Free' : `₱${plainNumber(fee)}`,
    PER_TOWN: 'Per town',
    PER_BARANGAY: 'Per barangay',
    PER_KM: 'By distance',
  }[store?.deliveryFeeMode] || (fee === null ? 'Per place' : fee === 0 ? 'Free' : `₱${plainNumber(fee)}`);
  const ways = [store?.acceptsCod !== false && 'Cash', store?.paymentQrImage && qrMethod(store.paymentQrType).label].filter(Boolean);

  const go = (to) => () => router.push(to);
  const logo = store?.logo ? resolveImg(store.logo) : null;

  return (
    <SellerPage header={<SellerMeHeader onShare={canShare ? shareShop : undefined} />} refreshing={refreshing} onRefresh={refresh} contentStyle={styles.content}>
      <View style={styles.body}>
        {/* The shop: tap to edit its profile; the QR icon by the name shows the shop's code to scan.
            The row's link lies under it, so the icon is a button of its own. */}
        <MeCard style={styles.shopCard}>
          <View style={styles.id}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Edit shop profile"
              onPress={go('/seller/store')}
              style={({ pressed }) => [StyleSheet.absoluteFill, pressed && meStyles.pressed]}
            />
            <View ref={logoRef} collapsable={false} style={[styles.avatar, styles.passThrough, qrOut && styles.away]}>
              {logo
                ? <Image source={{ uri: logo }} style={styles.avatarImg} />
                : <Text style={styles.avatarLetter}>{name.trim().charAt(0).toUpperCase()}</Text>}
            </View>
            <View style={[styles.idText, styles.boxNone]}>
              <View style={[styles.nameRow, styles.boxNone]}>
                <Text style={[styles.idName, styles.passThrough]} numberOfLines={1}>{name}</Text>
                {canShare ? <ShopQrPop store={store} originRef={logoRef} onActive={setQrOut} /> : null}
              </View>
              {user?.username ? <Text style={[styles.idUser, styles.passThrough]} numberOfLines={1}>@{user.username}</Text> : null}
              {store?.isApproved === false ? <Text style={[styles.private, styles.passThrough]}>Private until approved</Text> : null}
            </View>
            <View style={styles.passThrough}>
              <CaretRightIcon size={18} color={t.neutral[300]} />
            </View>
          </View>
          <View style={styles.stats}>
            {[
              { key: 'rating', value: stat(health?.rating != null ? Number(health.rating).toFixed(1) : '0.0'), label: 'Rating', to: '/seller/reviews' },
              { key: 'followers', value: stat(health?.followers ?? 0), label: 'Followers', to: '/seller/marketing' },
              { key: 'products', value: stat(health?.liveProducts ?? 0), label: 'Products', to: '/seller/products' },
            ].map((s, i) => (
              <Pressable
                key={s.key}
                accessibilityRole="link"
                accessibilityLabel={`${s.label}: ${s.value}`}
                onPress={go(s.to)}
                style={({ pressed }) => [styles.statCell, i > 0 && styles.statLine, pressed && meStyles.pressed]}
              >
                <Text style={styles.statValue}>{String(s.value)}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </MeCard>

        {/* How the shop is doing, in one row. */}
        {health !== false ? (
          <Pressable
            accessibilityRole="link"
            onPress={go(health?.readyToSell === false ? '/seller' : '/seller/analytics')}
            style={({ pressed }) => [meStyles.card, styles.health, pressed && meStyles.pressed]}
          >
            <View style={[styles.healthIcon, { backgroundColor: tone.bg }]}>
              <HeartbeatIcon size={22} weight="fill" color={tone.icon} />
            </View>
            <View style={styles.healthText}>
              <Text style={styles.healthTitle}>
                Shop health:{' '}
                <Text style={[styles.healthLevel, { color: tone.level }]}>{health === null ? '…' : healthMeta?.label || '—'}</Text>
              </Text>
              <Text style={styles.healthSub}>
                {health && health.issues?.length
                  ? health.issues.map((i) => i.label).join(' · ')
                  : health ? 'No problems found' : 'Checking your shop…'}
              </Text>
            </View>
            <CaretRightIcon size={16} color={t.neutral[300]} />
          </Pressable>
        ) : null}

        <MeCard style={styles.links}>
          {store?.slug ? (
            <Pressable accessibilityRole="link" onPress={go(`/store/${store.slug}`)} style={({ pressed }) => [styles.link, pressed && meStyles.pressed]}>
              <StorefrontIcon size={20} weight="fill" color={t.neutral[900]} />
              <Text style={styles.linkText}>View shop</Text>
            </Pressable>
          ) : <View style={styles.link} />}
          <Pressable accessibilityRole="link" onPress={go('/seller/decorate')} style={({ pressed }) => [styles.link, styles.linkLine, pressed && meStyles.pressed]}>
            <PaintBrushIcon size={20} weight="fill" color={t.neutral[900]} />
            <Text style={styles.linkText}>Decorate my shop</Text>
          </Pressable>
        </MeCard>

        {/* A QR poster to print for the stall: once buyers can open the shop. */}
        {canShare ? (
          <MeList title="Share your shop">
            <MeRow first icon={QrCodeIcon} label="Shop QR" hint="Print for your stall" onPress={go('/seller/shop-qr')} />
          </MeList>
        ) : null}

        <MeList title="Finance">
          <MeRow first icon={WalletIcon} label="My earnings" onPress={go('/seller/finance')} />
        </MeList>

        {/* How buyers get and pay for orders: each part opens its own page. */}
        <MeList title="Delivery & payment">
          <MeRow first icon={TruckIcon} label="Delivery & pickup" hint={MODE_HINTS[mode] || 'Delivery'} onPress={go('/seller/fulfillment/method')} />
          {picksUp ? (
            <MeRow
              icon={StorefrontIcon}
              label="Pickup spot"
              hint={pickupSet ? null : 'Not set'}
              warn={!pickupSet}
              onPress={go('/seller/fulfillment/pickup')}
            />
          ) : null}
          {delivers ? (
            <MeRow
              icon={MapPinIcon}
              label="Delivery: couriers, areas & fees"
              hint={deliverySet ? feeHint : 'Not set'}
              warn={!deliverySet}
              onPress={go('/seller/fulfillment/delivery')}
            />
          ) : null}
          <MeRow
            icon={QrCodeIcon}
            label="Payment options"
            hint={ways.length ? ways.join(' · ') : 'Not set'}
            warn={!ways.length}
            onPress={go('/seller/fulfillment/payment')}
          />
        </MeList>

        <MeList title="Contact & help">
          <MeRow first icon={QuestionIcon} label="Buyer questions" onPress={go('/seller/questions')} />
          <MeRow icon={HandshakeIcon} label="Offers" badge={count('/seller/offers')} onPress={go('/seller/offers')} />
          <MeRow icon={HeadsetIcon} label="Message the admin" badge={count('/seller/support')} onPress={go('/seller/support')} />
          <MeRow icon={LifebuoyIcon} label="Help center" onPress={go('/help-center')} />
          <MeRow icon={ChatTextIcon} label="Send feedback" onPress={go('/feedback')} />
        </MeList>

        <MeList title="Settings">
          <MeRow first icon={UserIcon} label="Shop profile" onPress={go('/seller/store')} />
          {identity ? <MeRow icon={IdentificationCardIcon} label="Verify identity" hint={identityHint} onPress={go('/seller/verification')} /> : null}
          <MeRow icon={BellIcon} label="Notifications" badge={unreadCount} onPress={go('/seller/notifications')} />
          <MeRow icon={GearIcon} label="Shop settings" onPress={go('/seller/settings')} />
          <MeRow icon={ArrowsLeftRightIcon} label="Switch to my buyer account" onPress={switchToPersonal} />
        </MeList>

        <Pressable
          accessibilityRole="button"
          onPress={requestLogout}
          style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]}
        >
          <SignOutIcon size={18} weight="bold" color={t.danger[600]} />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
    </SellerPage>
  );
}

const styles = themed(() => StyleSheet.create({
  // The bar above already stands in for the website's 4px top padding (.sme-head is inside it there).
  content: { paddingTop: 0 },
  // .sh-body: 12px between the sections; 8px more under the last (.sme > .sh-body).
  body: { gap: 12, paddingBottom: 8 },

  // .sme-card / .sme-id
  shopCard: { paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  id: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: {
    width: 64, height: 64, borderRadius: 32, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50],
  },
  avatarImg: { width: '100%', height: '100%' },
  away: { opacity: 0 },
  avatarLetter: { fontSize: 26, lineHeight: 34, ...font(500), color: t.primary[700] },
  idText: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  // Touches go through to the row's link under them (the QR icon keeps its own).
  passThrough: { pointerEvents: 'none' },
  boxNone: { pointerEvents: 'box-none' },
  idName: { flex: 1, minWidth: 0, fontSize: 18, lineHeight: 28.8, ...font(500), color: t.neutral[900] },
  idUser: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  private: {
    alignSelf: 'flex-start', marginTop: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.warning[50], color: t.warning[700], fontSize: 12.5, lineHeight: 20, ...font(500),
  },

  // .sme-stats
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.neutral[100] },
  statCell: { flex: 1, alignItems: 'center', gap: 1, paddingVertical: 12 },
  statLine: { borderLeftWidth: 1, borderLeftColor: t.neutral[100] },
  statValue: { fontSize: 18, lineHeight: 28.8, ...font(500), color: t.neutral[900] },
  statLabel: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },

  // .sh-notice.sme-health
  health: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  healthIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  healthText: { flex: 1, minWidth: 0, gap: 1 },
  healthTitle: { fontSize: 14.5, lineHeight: 23.2, ...font(400), color: t.neutral[900] },
  healthLevel: { ...font(500) },
  healthSub: { fontSize: 12.5, lineHeight: 17.5, ...font(400), color: t.neutral[500] },

  // .sme-links
  links: { flexDirection: 'row', paddingVertical: 0, paddingHorizontal: 0, overflow: 'hidden' },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52 },
  linkLine: { borderLeftWidth: 1, borderLeftColor: t.neutral[100] },
  linkText: { fontSize: 14.5, lineHeight: 23.2, ...font(400), color: t.neutral[800] },

  // .sme-logout on phones: a full-width white row, no border.
  logout: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 48, marginHorizontal: -12, backgroundColor: t.neutral[0],
  },
  logoutPressed: { backgroundColor: t.danger[50] },
  logoutText: { fontSize: 15, lineHeight: 24, ...font(500), color: t.danger[600] },
}));
