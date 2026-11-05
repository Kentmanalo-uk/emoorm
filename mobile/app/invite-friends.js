import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { CopyIcon, ShareNetworkIcon, TicketIcon } from '../src/lib/icons';
import apiClient from '../src/api/client';
import { ENDPOINTS } from '../src/api/endpoints';
import ScreenHeader from '../src/components/ScreenHeader';
import EmptyState from '../src/components/EmptyState';
import UserAvatar from '../src/components/UserAvatar';
import { PfSection, PfTitle, ProfileEmpty, PsButton } from '../src/components/profile/ProfileUI';
import { errorText } from '../src/components/profile/profileLib';
import { openShare } from '../src/components/ShareSheet';
import { PageLoader } from '../src/components/BrandLoader';
import { PullScrollView } from '../src/components/PullList';
import { ShopLogoArt } from '../src/components/shop/ShopArt';
import { resolveImg } from '../src/lib/media';
import { toast } from '../src/lib/toast';
import { inviteDate, invitePeso, offText, programLine } from '../src/lib/invite';
import { font, t, themed } from '../src/theme';

/** What became of one person invited. */
const statusLabel = (inv) => {
  if (inv.status === 'HELD') return 'Being checked';
  if (inv.status === 'REJECTED') return "Didn't count";
  if (inv.kind === 'SELLER') {
    if (inv.status === 'REWARDED') return 'Both shops shown higher';
    if (inv.status === 'PENDING') return inv.progress || 'Waiting for their first buyers';
    return 'Counted';
  }
  if (inv.status === 'REWARDED') return 'You earned a voucher';
  if (inv.status === 'PENDING') {
    return inv.shop?.name ? `Waiting for their first order at ${inv.shop.name}` : 'Waiting for their first order';
  }
  // COUNTED: the friend's order came in, with no voucher for the inviter.
  switch (inv.reason) {
    case 'NO_PROGRAM': return 'Joined';
    case 'OWN_SHOP': return 'Your own shop: no voucher';
    case 'INVITER_CAP': return 'Counted: monthly limit reached';
    case 'SHOP_CAP': return "Counted: shop's monthly limit reached";
    default: return 'Counted';
  }
};

const statusTone = (inv) => {
  if (inv.status === 'REWARDED') return 'good';
  if (inv.status === 'HELD') return 'warn';
  if (inv.status === 'REJECTED') return 'bad';
  return 'plain';
};

const share = (url, title, text) => {
  if (url) openShare({ title, text, url });
};

/**
 * Invite friends (Profile → Invite friends): the person's invite code and
 * link, shops whose invite rewards they can pass on, the invite vouchers
 * they hold, a seller's invite for other sellers, and who they invited.
 * Rewards are the shops' own vouchers; nobody is paid in cash.
 */
export default function InviteFriends() {
  const router = useRouter();
  const [me, setMe] = useState(null);

  const load = useCallback(() => apiClient.get(ENDPOINTS.REFERRALS.MINE)
    .then((res) => setMe(res?.data || { enabled: false }))
    .catch((err) => {
      toast.error(errorText(err, 'Could not load your invites'));
      setMe((prev) => prev || { enabled: false, failed: true });
    }), []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const copy = async (value, what = 'Code') => {
    try {
      await Clipboard.setStringAsync(value);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Could not copy');
    }
  };

  if (!me) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Invite friends" backTo="/profile" />
        <PageLoader label="Loading invites" />
      </View>
    );
  }

  if (!me.enabled) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Invite friends" backTo="/profile" />
        <PullScrollView onPull={load} showsVerticalScrollIndicator={false} contentContainerStyle={styles.fill}>
          <EmptyState
            page
            art="invites"
            title={me.failed ? 'Could not load your invites' : 'Invites are off right now'}
            text={me.failed ? 'Pull down to try again.' : 'Check back later.'}
            actions={[{ label: 'Home', onPress: () => router.replace('/') }]}
          />
        </PullScrollView>
      </View>
    );
  }

  const limits = me.limits || {};
  const totals = me.totals || {};
  const shops = me.shopInvites && Array.isArray(me.shops) ? me.shops : [];
  const vouchers = Array.isArray(me.vouchers) ? me.vouchers : [];
  const invites = Array.isArray(me.invites) ? me.invites : [];
  const cap = Number(limits.inviterMonthlyCap) || 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Invite friends" backTo="/profile" />
      <PullScrollView onPull={load} showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={styles.content}>
        {/* The code and link */}
        <PfSection>
          <Text style={styles.codeLabel}>Your invite code</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${me.code}`} onPress={() => copy(me.code)}>
            <Text style={styles.code} selectable>{me.code}</Text>
          </Pressable>
          <View style={styles.buttons}>
            <PsButton label="Copy" Icon={CopyIcon} onPress={() => copy(me.code)} style={styles.button} />
            <PsButton
              label="Share"
              Icon={ShareNetworkIcon}
              variant="primary"
              onPress={() => share(me.link, 'Join me on E-MOORM', 'Join me on E-MOORM and shop from local sellers.')}
              style={styles.button}
            />
          </View>
          <Text style={styles.note}>
            Rewards come from the shops themselves. Share a shop&apos;s invite below and your friend gets its welcome voucher.
          </Text>
          {me.invitedBy ? <Text style={styles.invitedBy}>Invited by {me.invitedBy}</Text> : null}
        </PfSection>

        {/* Shops whose invite rewards can be passed on */}
        {shops.length > 0 ? (
          <PfSection list>
            <PfTitle list>Shops with invite rewards</PfTitle>
            {shops.map((shop, i) => (
              <View key={shop.id} style={[styles.row, i > 0 && styles.rowLine]}>
                <Pressable accessibilityRole="link" onPress={() => router.push(`/store/${shop.slug}`)} style={styles.logo}>
                  {shop.logo
                    ? <Image source={{ uri: resolveImg(shop.logo) }} style={styles.logoImg} accessibilityLabel={shop.name} />
                    : <ShopLogoArt name={shop.name} />}
                </Pressable>
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>{shop.name}</Text>
                  <Text style={styles.rowSmall}>{programLine(shop.program)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Share ${shop.name}'s invite`}
                  onPress={() => share(shop.link, shop.name, `Join me on E-MOORM and get a welcome voucher at ${shop.name}.`)}
                  style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                >
                  <ShareNetworkIcon size={14} color={t.primary[700]} />
                  <Text style={styles.pillText}>Share</Text>
                </Pressable>
              </View>
            ))}
          </PfSection>
        ) : null}

        {/* Vouchers from invites */}
        {vouchers.length > 0 ? (
          <PfSection list>
            <PfTitle list>Your invite vouchers</PfTitle>
            {vouchers.map((v, i) => (
              <View key={v.id} style={[styles.row, styles.rowTop, i > 0 && styles.rowLine]}>
                <TicketIcon size={22} weight="fill" color={t.danger[600]} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>
                    {offText(v.discountType, v.discountValue, v.maxDiscount)}{v.store?.name ? ` at ${v.store.name}` : ''}
                  </Text>
                  <Text style={styles.rowSmall}>
                    {[
                      v.kind === 'thanks' ? 'Thank-you voucher' : 'Welcome voucher',
                      Number(v.minOrderAmount) > 0 ? `orders from ${invitePeso(v.minOrderAmount)}` : null,
                      v.expiresAt ? `until ${inviteDate(v.expiresAt)}` : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.voucherFoot}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Copy ${v.code}`} onPress={() => copy(v.code)} style={styles.voucherCode}>
                      <Text style={styles.voucherCodeText}>{v.code}</Text>
                      <CopyIcon size={13} color={t.danger[700]} />
                    </Pressable>
                    {v.store?.slug ? (
                      <Pressable
                        accessibilityRole="link"
                        onPress={() => router.push(`/store/${v.store.slug}`)}
                        style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                      >
                        <Text style={styles.pillText}>Shop now</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </PfSection>
        ) : null}

        {/* A seller brings in another seller */}
        {me.canInviteSellers && me.sellerLink ? (
          <PfSection>
            <PfTitle style={styles.title}>Invite sellers</PfTitle>
            <Text style={styles.body}>
              Bring a seller to E-MOORM. When their shop has served {limits.sellerOrdersToQualify || 0} different
              {' '}{Number(limits.sellerOrdersToQualify) === 1 ? 'buyer' : 'buyers'}, both shops are shown higher in For You
              for {limits.boostDays || 0} {Number(limits.boostDays) === 1 ? 'day' : 'days'}.
            </Text>
            <PsButton
              label="Share seller invite"
              Icon={ShareNetworkIcon}
              onPress={() => share(me.sellerLink, 'Sell on E-MOORM', 'Open your shop on E-MOORM with my invite.')}
              style={styles.wide}
            />
          </PfSection>
        ) : null}

        {/* Who was invited */}
        <PfSection list last>
          <PfTitle list>People you invited</PfTitle>
          <Text style={styles.totals}>
            {[
              `${totals.joined || 0} joined`,
              `${totals.rewarded || 0} rewarded`,
              totals.sellers ? `${totals.sellers} ${totals.sellers === 1 ? 'seller' : 'sellers'}` : null,
            ].filter(Boolean).join(' · ')}
            {cap > 0 ? `\n${limits.rewardedThisMonth || 0} of ${cap} rewards this month` : ''}
          </Text>
          {invites.length === 0 ? (
            <ProfileEmpty compact art="followers" hint="Nobody yet. Share your code to get started." />
          ) : invites.map((inv, i) => {
            const tone = statusTone(inv);
            return (
              <View key={inv.id} style={[styles.row, i > 0 && styles.rowLine]}>
                <UserAvatar user={{ id: inv.id, avatarKey: inv.avatarKey }} src={inv.photo || null} size={40} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {inv.name || 'Someone'}
                    {inv.kind === 'SELLER' ? <Text style={styles.kind}>  Seller</Text> : null}
                  </Text>
                  {inv.shop?.name && !(inv.kind === 'BUYER' && inv.status === 'PENDING')
                    ? <Text style={styles.rowSmall} numberOfLines={1}>{inv.shop.name}</Text>
                    : null}
                  <Text
                    style={[
                      styles.status,
                      tone === 'good' && styles.statusGood,
                      tone === 'warn' && styles.statusWarn,
                      tone === 'bad' && styles.statusBad,
                    ]}
                  >
                    {statusLabel(inv)}
                  </Text>
                </View>
                <Text style={styles.date}>{inviteDate(inv.createdAt)}</Text>
              </View>
            );
          })}
        </PfSection>
      </PullScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  scroll: { flex: 1 },
  fill: { flexGrow: 1 },
  content: { flexGrow: 1, paddingBottom: 24 },

  codeLabel: { fontSize: 13, lineHeight: 20, color: t.neutral[500], textAlign: 'center', ...font(400) },
  code: {
    marginTop: 4, fontSize: 30, lineHeight: 38, letterSpacing: 2.4, color: t.neutral[900], textAlign: 'center', ...font(600),
  },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: { flex: 1 },
  note: { marginTop: 12, fontSize: 13, lineHeight: 19.5, color: t.neutral[500], textAlign: 'center', ...font(400) },
  invitedBy: { marginTop: 8, fontSize: 13, lineHeight: 19.5, color: t.primary[700], textAlign: 'center', ...font(500) },

  title: { marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, color: t.neutral[700], ...font(400) },
  wide: { marginTop: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  rowTop: { alignItems: 'flex-start' },
  rowLine: { borderTopWidth: 1, borderTopColor: t.neutral[100] },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowName: { fontSize: 15, lineHeight: 21, color: t.neutral[900], ...font(500) },
  rowSmall: { fontSize: 12.5, lineHeight: 18.5, color: t.neutral[500], ...font(400) },
  kind: { fontSize: 12, color: t.accent[700], ...font(500) },

  logo: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[600],
  },
  logoImg: { width: '100%', height: '100%' },

  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  pillPressed: { backgroundColor: t.neutral[50] },
  pillText: { fontSize: 13, lineHeight: 18, color: t.primary[700], ...font(600) },

  voucherFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  voucherCode: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1, borderStyle: 'dashed', borderColor: t.danger[300], borderRadius: 8, backgroundColor: t.danger[50],
  },
  voucherCodeText: { fontSize: 13, lineHeight: 18, letterSpacing: 0.5, color: t.danger[700], ...font(700) },

  totals: { paddingHorizontal: 16, paddingBottom: 6, fontSize: 13, lineHeight: 20, color: t.neutral[500], ...font(400) },
  status: { fontSize: 12.5, lineHeight: 18.5, color: t.neutral[600], ...font(500) },
  statusGood: { color: t.primary[700] },
  statusWarn: { color: t.warning[700] },
  statusBad: { color: t.danger[600] },
  date: { alignSelf: 'flex-start', marginTop: 2, fontSize: 12, lineHeight: 18, color: t.neutral[400], ...font(400) },
}));
