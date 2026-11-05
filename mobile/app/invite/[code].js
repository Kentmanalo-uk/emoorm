import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import useAuthStore from '../../src/store/authStore';
import ScreenHeader from '../../src/components/ScreenHeader';
import EmptyState, { EmptyActions, emptyStyles } from '../../src/components/EmptyState';
import UserAvatar from '../../src/components/UserAvatar';
import { PageLoader } from '../../src/components/BrandLoader';
import { cleanCode, invitePeso, offText, savePendingInvite } from '../../src/lib/invite';
import { font, t, themed } from '../../src/theme';

/** "Get ₱20 off your first order of ₱200 or more there." */
const welcomeLine = (welcome) => {
  const min = Number(welcome.minOrderAmount) > 0 ? ` of ${invitePeso(welcome.minOrderAmount)} or more` : '';
  return `Get ${offText(welcome.type, welcome.value, welcome.maxDiscount)} your first order${min} there.`;
};

/**
 * /invite/<CODE>(?shop=<slug>|?as=seller): where an invite link opens
 * (https://emoorm.shop/invite/… opens the app). Names who invited you and,
 * for a shop's invite, the welcome voucher waiting there; the invite is
 * kept on the phone so Sign up fills in the code (lib/invite).
 */
export default function InviteLanding() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const code = cleanCode(params.code);
  const shopParam = typeof params.shop === 'string' ? params.shop : '';
  const asSeller = params.as === 'seller';
  const [invite, setInvite] = useState(null);

  useEffect(() => {
    let live = true;
    if (!code) {
      setInvite({ enabled: false });
      return undefined;
    }
    apiClient.get(ENDPOINTS.REFERRALS.INVITE(code), { params: shopParam ? { shop: shopParam } : {} })
      .then((res) => {
        if (!live) return;
        const data = res?.data || { enabled: false };
        setInvite(data);
        if (data.enabled && data.valid) {
          savePendingInvite({ code: data.code || code, shop: data.shop?.slug || shopParam || null, as: asSeller ? 'seller' : null });
        }
      })
      .catch(() => { if (live) setInvite({ enabled: false }); });
    return () => { live = false; };
  }, [code, shopParam, asSeller]);

  const goHome = () => router.replace('/');

  if (!invite) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Invite" />
        <PageLoader label="Loading invite" />
      </View>
    );
  }

  if (!invite.enabled || !invite.valid) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Invite" />
        <EmptyState
          page
          art="invites"
          title="This invite link isn't active"
          text="It may have been typed wrong, or invites are paused for now. You can still look around."
          actions={[{ label: 'Home', onPress: goHome }]}
        />
      </View>
    );
  }

  const inviter = invite.inviter || {};
  const name = inviter.firstName || 'A friend';
  const shop = invite.shop || null;
  const welcome = shop?.welcome || null;
  const sellerInvite = asSeller && invite.sellerInvites;
  const visitShop = shop?.slug ? { label: 'Visit shop', onPress: () => router.push(`/store/${shop.slug}`) } : null;

  let title;
  let body;
  let actions;
  if (isAuthenticated) {
    title = shop ? `${name} invited you to ${shop.name}` : `${name} invited you to E-MOORM`;
    body = shop
      ? 'Invites are for new accounts, and you already have one. You can still visit the shop.'
      : 'Invites are for new accounts, and you already have one.';
    actions = visitShop ? [visitShop] : [{ label: 'Home', onPress: goHome }];
  } else {
    title = shop ? `${name} invited you to ${shop.name}` : `${name} invited you to E-MOORM`;
    if (sellerInvite) {
      body = 'Open your own shop on E-MOORM and sell to buyers near you. Create an account first, then apply to sell.';
    } else if (welcome) {
      body = welcomeLine(welcome);
    } else if (shop) {
      body = `Create an account to shop at ${shop.name}.`;
    } else {
      body = 'Create an account to buy from local sellers near you.';
    }
    const register = sellerInvite
      ? { pathname: '/register', params: { redirect: '/seller-apply' } }
      : '/register';
    actions = [
      { label: 'Create account', onPress: () => router.push(register) },
      ...(visitShop ? [{ ...visitShop, variant: 'outline' }] : []),
    ];
  }
  const days = Number(welcome?.voucherDays) || 0;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Invite" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[emptyStyles.wrap, emptyStyles.page]}>
          <UserAvatar user={{ avatarKey: inviter.avatarKey }} src={inviter.photo || null} size={84} style={styles.avatar} />
          <Text style={emptyStyles.title} accessibilityRole="header">{title}</Text>
          <Text style={emptyStyles.body}>{body}</Text>
          {!isAuthenticated && welcome && !sellerInvite && days > 0 ? (
            <Text style={styles.small}>Your voucher is ready when you join and lasts {days} {days === 1 ? 'day' : 'days'}.</Text>
          ) : null}
          {!isAuthenticated ? <Text style={styles.code}>Invite code {invite.code || code}</Text> : null}
          <EmptyActions actions={actions} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  content: { flexGrow: 1 },
  avatar: { marginBottom: 18 },
  small: { maxWidth: 290, marginTop: 8, fontSize: 12.5, lineHeight: 19, color: t.neutral[500], textAlign: 'center', ...font(400) },
  code: {
    marginTop: 14, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden',
    backgroundColor: t.primary[50], color: t.primary[700], fontSize: 13, lineHeight: 19, letterSpacing: 0.4, ...font(500),
  },
}));
