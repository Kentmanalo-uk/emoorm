import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCartSettings } from '../components/cart/cartSettings';

/*
 * Invites (backend services/referral): someone opened an invite link
 * (https://emoorm.shop/invite/<CODE>?shop=<slug> or ?as=seller, or a shop
 * link with ?ref=<CODE>) and may sign up later. The invite is kept on the
 * phone for 30 days so the sign-up form can fill in the code, and is
 * forgotten once an account is made with it.
 *
 * The whole feature is off until a super admin turns it on: the app
 * settings' `referralSettings.enabled`.
 */

const KEY = 'emoorm-invite';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/** A code as the server reads it: capitals and digits, at most 16. */
export const cleanCode = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

/** The invite settings from the app settings; missing means off. */
export const referralSettingsOf = (settings) => {
  const r = settings?.referralSettings;
  return r && typeof r === 'object' ? { ...r, enabled: Boolean(r.enabled) } : { enabled: false };
};

/** Whether invites are on (and how), from the app settings. */
export function useReferralSettings() {
  return referralSettingsOf(useCartSettings());
}

/** Remember an invite link that was opened: { code, shop, as }. */
export async function savePendingInvite({ code, shop, as } = {}) {
  const clean = cleanCode(code);
  if (!clean) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({
      code: clean,
      shop: shop ? String(shop) : null,
      as: as === 'seller' ? 'seller' : null,
      at: Date.now(),
    }));
  } catch {
    // Full storage: the code can still be typed in by hand.
  }
}

/** The invite opened in the last 30 days, or null. */
export async function readPendingInvite() {
  try {
    const saved = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    if (!saved || !saved.code) return null;
    if (!saved.at || Date.now() - saved.at > KEEP_MS) {
      await AsyncStorage.removeItem(KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

export async function clearPendingInvite() {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to do: it expires on its own.
  }
}

/** "₱20" / "₱1,234.5". */
export const invitePeso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

/** "₱20 off" / "10% off" / "10% off, up to ₱50". */
export const offText = (type, value, maxDiscount) => {
  if (String(type).toUpperCase() === 'PERCENT') {
    return `${Number(value || 0)}% off${Number(maxDiscount) > 0 ? `, up to ${invitePeso(maxDiscount)}` : ''}`;
  }
  return `${invitePeso(value)} off`;
};

/** "Friend gets ₱20 off · You get ₱25 off · orders from ₱200" for a shop's program. */
export const programLine = (program) => {
  if (!program) return '';
  const cap = program.maxDiscount;
  const parts = [
    `Friend gets ${offText(program.welcomeType, program.welcomeValue, cap)}`,
    `You get ${offText(program.rewardType, program.rewardValue, cap)}`,
  ];
  if (Number(program.minOrderAmount) > 0) parts.push(`orders from ${invitePeso(program.minOrderAmount)}`);
  return parts.join(' · ');
};

/** "Nov 2, 2026". */
export const inviteDate = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * The invite code on a sign-up form: filled in from the invite link opened
 * on this phone, and the fields to send with the account.
 *
 *   const invite = useSignupInvite();
 *   {invite.on ? <InviteCodeField invite={invite} /> : null}
 *   apiClient.post('/auth/register', { ...form, ...invite.fields() });
 *   invite.done();   // after the account is made
 */
export function useSignupInvite() {
  const settings = useReferralSettings();
  const [pending, setPending] = useState(null);
  const [code, setCodeState] = useState('');

  useEffect(() => {
    let live = true;
    readPendingInvite().then((saved) => {
      if (!live || !saved) return;
      setPending(saved);
      setCodeState((typed) => typed || saved.code);
    });
    return () => { live = false; };
  }, []);

  const clean = cleanCode(code);
  return {
    on: Boolean(settings.enabled),
    code,
    setCode: (value) => setCodeState(cleanCode(value)),
    // Filled in from the link (and not changed since).
    fromLink: Boolean(pending?.code && clean === pending.code),
    fields: () => {
      if (!settings.enabled || !clean) return {};
      return {
        referralCode: clean,
        ...(pending?.code === clean && pending.shop ? { referralShop: pending.shop } : {}),
      };
    },
    done: clearPendingInvite,
  };
}
