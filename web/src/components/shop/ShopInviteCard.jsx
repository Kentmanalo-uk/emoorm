import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Gift, ShareNetwork } from '../../lib/icons';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import useAppSettings from '../../hooks/useAppSettings';
import { useShare } from '../ShareSheet';
import { rewardText, saveInvite } from '../../lib/invite';
import '../../pages/ProfileInvite.css';

/**
 * A shop's invite rewards on its page: "Invite friends: they get ₱20 off,
 * you get ₱25 off after their first order", with a Share button for the
 * person's own invite link through this shop. Shown to signed-in people who
 * don't own the shop, while invites and the shop's rewards are on.
 *
 * Also keeps a `?ref=CODE` the page was opened with, for a guest's sign-up.
 */
export default function ShopInviteCard({ store }) {
  const { isAuthenticated, user } = useAuthStore();
  const { settings } = useAppSettings();
  const [params] = useSearchParams();
  const ref = params.get('ref');
  const invitesOn = settings.referralSettings?.enabled === true && settings.referralSettings?.shopInvites !== false;
  const [rewards, setRewards] = useState(null);
  const [busy, setBusy] = useState(false);
  const { share, shareSheet } = useShare();

  useEffect(() => {
    if (ref && !isAuthenticated && store?.slug) saveInvite({ code: ref, shop: store.slug });
  }, [ref, isAuthenticated, store?.slug]);

  const owner = user?.id && store?.ownerId === user.id;
  useEffect(() => {
    if (!invitesOn || !isAuthenticated || owner || !store?.id) return undefined;
    let cancelled = false;
    axios.get(`/referrals/shop/${store.id}`)
      .then((res) => { if (!cancelled) setRewards(res.data || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [invitesOn, isAuthenticated, owner, store?.id]);

  if (!rewards) return null;

  const friendGets = rewardText(rewards.welcomeType, rewards.welcomeValue, rewards.maxDiscount);
  const youGet = rewardText(rewards.rewardType, rewards.rewardValue, rewards.maxDiscount);

  const onShare = async () => {
    setBusy(true);
    try {
      const res = await axios.get('/referrals/me');
      const shop = res.data?.shops?.find((s) => s.id === store.id);
      const url = shop?.link || `${window.location.origin}/invite/${res.data.code}?shop=${encodeURIComponent(store.slug)}`;
      await share({ title: `${store.name} on Emoorm`, text: `Get ${friendGets} your first order at ${store.name} on Emoorm.`, url });
    } catch (err) {
      toast.error(err?.message || 'Could not get your invite link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="store-invite-card">
      <Gift size={22} weight="fill" />
      <span>
        <b>Invite friends to {store.name}.</b> They get {friendGets}, you get {youGet} after their first order.
      </span>
      <button type="button" className="inv-btn inv-btn-small" onClick={onShare} disabled={busy}>
        <ShareNetwork size={15} weight="bold" /> Share
      </button>
      {shareSheet}
    </div>
  );
}
