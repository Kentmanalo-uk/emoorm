/**
 * An invite link someone opened (/invite/:code, or a shop link with ?ref=),
 * kept until they sign up so the code goes with the new account. Kept for 30
 * days in this browser only; storage that throws (private windows) just
 * means no invite is remembered.
 */
const KEY = 'emoorm.invite';
const MAX_AGE_MS = 30 * 86400e3;

export const normalizeInviteCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);

/** @param {{ code: string, shop?: string|null, as?: string|null }} invite */
export function saveInvite({ code, shop = null, as = null }) {
  const clean = normalizeInviteCode(code);
  if (!clean) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: clean, shop: shop || null, as: as || null, at: Date.now() }));
  } catch { /* storage unavailable */ }
}

/** The invite waiting for a sign-up, or null. */
export function readInvite() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved?.code || Date.now() - Number(saved.at || 0) > MAX_AGE_MS) return null;
    return saved;
  } catch {
    return null;
  }
}

export function clearInvite() {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

/**
 * What a sign-up sends: the code typed (or the saved one), and the shop the
 * saved invite came through when it is that same code.
 */
export function inviteFields(typed) {
  const saved = readInvite();
  const code = normalizeInviteCode(typed) || saved?.code || '';
  if (!code) return {};
  return { referralCode: code, referralShop: saved?.code === code ? saved.shop || undefined : undefined };
}

/** "₱20 off" / "10% off, up to ₱50". */
export function rewardText(type, value, maxDiscount) {
  if (type === 'PERCENT') return `${Number(value)}% off${maxDiscount ? `, up to ₱${Number(maxDiscount).toLocaleString('en-PH')}` : ''}`;
  return `₱${Number(value).toLocaleString('en-PH')} off`;
}

export const pesos = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;

// Why an invite counted without a reward (referral.service reasons).
const COUNTED = {
  NO_PROGRAM: 'Joined',
  OWN_SHOP: 'Your own shop: no voucher',
  INVITER_CAP: 'Counted: monthly limit reached',
  SHOP_CAP: "Counted: shop's monthly limit reached",
};

/**
 * How far one invite got, as Invite friends shows it (the app's labels).
 * @returns {{ label: string, tone: 'wait'|'good'|'muted'|'bad' }}
 */
export function inviteStatus(invite) {
  // The shop is already on the row, under the name.
  const { kind, status, reason, progress } = invite;
  if (kind === 'SELLER') {
    if (status === 'PENDING') return { label: progress || 'Opening their shop', tone: 'wait' };
    if (status === 'REWARDED') return { label: 'Both shops shown higher', tone: 'good' };
  }
  switch (status) {
    case 'PENDING': return { label: 'Waiting for their first order', tone: 'wait' };
    case 'REWARDED': return { label: 'You earned a voucher', tone: 'good' };
    case 'HELD': return { label: 'Being checked', tone: 'wait' };
    case 'REJECTED': return { label: "Didn't count", tone: 'bad' };
    default: return { label: COUNTED[reason] || 'Counted', tone: 'muted' };
  }
}
