import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GiftIcon, ShareNetworkIcon } from '../../lib/icons';
import apiClient from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { openShare } from '../ShareSheet';
import { toast } from '../../lib/toast';
import { offText, useReferralSettings } from '../../lib/invite';
import { font, t, themed } from '../../theme';

/**
 * On a shop's page, for a signed-in buyer (not its owner) while the shop
 * has invite rewards on: "Invite friends to <Shop>: they get ₱20 off, you
 * get ₱25 off after their first order." Share sends the person's own invite
 * link for this shop; their code is asked for only when Share is tapped.
 */
export default function ShopInviteCard({ store, signedIn, isOwner }) {
  const settings = useReferralSettings();
  const show = Boolean(settings.enabled && settings.shopInvites !== false && signedIn && !isOwner && store?.id);
  const storeId = store?.id;
  const [program, setProgram] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return undefined;
    let live = true;
    apiClient.get(ENDPOINTS.REFERRALS.SHOP(storeId))
      .then((res) => { if (live) setProgram(res?.data || null); })
      .catch(() => { if (live) setProgram(null); });
    return () => { live = false; };
  }, [show, storeId]);

  if (!show || !program || program.isActive === false) return null;

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiClient.get(ENDPOINTS.REFERRALS.MINE);
      const me = res?.data;
      if (!me?.enabled || !me.link) {
        toast.info('Invites are off right now.');
        return;
      }
      openShare({
        title: store.name,
        text: `Join me on E-MOORM and get a welcome voucher at ${store.name}.`,
        url: `${me.link}?shop=${encodeURIComponent(store.slug)}`,
      });
    } catch (err) {
      toast.error(err?.message || 'Could not get your invite link');
    } finally {
      setBusy(false);
    }
  };

  const welcome = offText(program.welcomeType, program.welcomeValue, program.maxDiscount);
  const reward = offText(program.rewardType, program.rewardValue, program.maxDiscount);

  return (
    <View style={styles.card}>
      <GiftIcon size={22} weight="fill" color={t.primary[600]} />
      <Text style={styles.text}>
        <Text style={styles.strong}>Invite friends to {store.name}:</Text> they get {welcome}, you get {reward} after their first order.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Share an invite to ${store.name}`}
        onPress={share}
        disabled={busy}
        style={({ pressed }) => [styles.btn, pressed && styles.btnPressed, busy && styles.btnBusy]}
      >
        <ShareNetworkIcon size={14} color={t.onBrand} />
        <Text style={styles.btnText}>Share</Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginHorizontal: 16,
    paddingVertical: 10, paddingLeft: 12, paddingRight: 10, borderRadius: 12, backgroundColor: t.primary[50],
  },
  text: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, color: t.neutral[800], ...font(400) },
  strong: { color: t.neutral[900], ...font(500) },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 12, borderRadius: 999,
    backgroundColor: t.primary[600],
  },
  btnPressed: { backgroundColor: t.primary[700] },
  btnBusy: { opacity: 0.6 },
  btnText: { fontSize: 13, lineHeight: 15.6, color: t.onBrand, ...font(500) },
}));
