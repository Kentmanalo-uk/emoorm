import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { create } from 'zustand';
import { InfoIcon, PlusIcon, XIcon } from 'phosphor-react-native';
import useAuthStore from '../store/authStore';
import { syncWishlist } from './profile/wishlistSync';
import {
  forgetAccount, loadSavedAccounts, setCurrentAside, switchToAccount, useSavedAccounts,
} from '../store/savedAccounts';
import { resolveImg } from '../lib/media';
import { toast } from '../lib/toast';
import { font, t } from '../theme';
import Sheet from './Sheet';
import CartConfirmDialog from './cart/CartConfirmDialog';

/*
 * Settings → Switch account (shopping apps' account switcher): the accounts
 * saved on this phone, the signed-in one ticked. Tap another to switch to it
 * (no password while its session lasts); ✕ takes one off the phone (and signs
 * it out here); Add account keeps the current one and opens the login.
 * Accounts whose session ended open the login with their email.
 * Works signed out too (the Profile page's "Saved accounts").
 *
 * openSwitchAccount(); mount <SwitchAccountHost /> once (app/_layout.js).
 */

const useSwitchSheet = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export const openSwitchAccount = () => {
  loadSavedAccounts();
  useSwitchSheet.getState().show();
};

const ROLE_LABEL = { SELLER: 'Seller', BUYER: 'Buyer' };
const maskEmail = (email) => {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return email || '';
  return `${name.slice(0, 3)}${name.length > 3 ? '***' : ''}@${domain}`;
};

export function SwitchAccountHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { open, hide } = useSwitchSheet();
  const user = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const { accounts, ready } = useSavedAccounts();
  const [busy, setBusy] = useState(null);
  const [removing, setRemoving] = useState(null);

  useEffect(() => { if (open) loadSavedAccounts(); }, [open]);

  // The signed-in account first, then the others as saved.
  const list = user?.id && !accounts.some((a) => a.id === user.id)
    ? [{ id: user.id, fullName: user.fullName, email: user.email, profilePhoto: user.profilePhoto, role: user.role }, ...accounts]
    : [...accounts].sort((a, b) => (a.id === user?.id ? -1 : b.id === user?.id ? 1 : 0));

  // Close first, then act, so the next screen never opens under the sheet.
  const after = (fn) => { hide(); setTimeout(fn, 320); };
  // Set the signed-in account aside and open the login (for another account,
  // or one whose session ended). Off a page that needs a login first (Settings,
  // the Seller Center): signing out there makes the app open its own login
  // too, and the two sheets stack.
  const loginAs = async (email) => {
    if (user) {
      router.replace('/profile');
      await new Promise((r) => { setTimeout(r, 80); });
      await setCurrentAside(() => logout({ forget: false }));
    }
    router.push({ pathname: '/login', params: { ...(email ? { email } : {}), redirect: '/profile' } });
  };

  const pick = async (account) => {
    if (busy || account.id === user?.id) return;
    setBusy(account.id);
    const res = await switchToAccount(account.id, { signIn });
    setBusy(null);
    if (!res.ok) {
      toast.info(`Log in to ${account.fullName || account.email} again`, 'Its session on this phone has ended.');
      after(() => loginAs(res.email));
      return;
    }
    syncWishlist();
    toast.success(`Switched to ${res.user.fullName || res.user.email}`);
    // From the Seller Center to the other account's (a seller's), else its Profile.
    const inSeller = pathname === '/seller' || pathname.startsWith('/seller/');
    after(() => router.replace(inSeller && res.user.role === 'SELLER' ? '/seller' : '/profile'));
  };

  const addAccount = () => after(() => loginAs(''));

  const remove = async () => {
    const account = removing;
    setRemoving(null);
    if (!account) return;
    await forgetAccount(account.id);
    toast.info(`${account.fullName || account.email} was removed from this phone`);
  };

  return (
    <>
      <Sheet open={open} onClose={hide} variant="seller" title="Switch account">
        <View style={styles.note}>
          <InfoIcon size={18} weight="fill" color={t.info[600]} />
          <Text style={styles.noteText}>
            Accounts saved on this phone stay signed in, so you can switch between them without a password.
          </Text>
        </View>

        {list.map((a) => {
          const current = a.id === user?.id;
          const needsLogin = !current && !ready.has(a.id);
          const photo = resolveImg(a.profilePhoto);
          const initial = (a.fullName || a.email || '?').trim().charAt(0).toUpperCase();
          return (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: current, busy: busy === a.id }}
              accessibilityLabel={`${a.fullName || a.email}${current ? ', signed in' : ''}`}
              onPress={() => pick(a)}
              style={({ pressed }) => [styles.account, current && styles.accountOn, pressed && !current && styles.accountPressed]}
            >
              {!current ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${a.fullName || a.email} from this phone`}
                  onPress={() => setRemoving(a)}
                  hitSlop={8}
                  style={styles.remove}
                >
                  <XIcon size={12} weight="bold" color="#fff" />
                </Pressable>
              ) : null}
              <View style={styles.avatar}>
                {photo ? <Image source={{ uri: photo }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initial}</Text>}
              </View>
              <View style={styles.accountText}>
                <Text style={styles.accountName} numberOfLines={1}>{a.fullName || a.email}</Text>
                <Text style={styles.accountMeta} numberOfLines={1}>
                  {[ROLE_LABEL[a.role] || 'Buyer', maskEmail(a.email)].filter(Boolean).join(' · ')}
                  {needsLogin ? ' · Log in again' : ''}
                </Text>
              </View>
              {busy === a.id
                ? <ActivityIndicator color={t.primary[600]} />
                : <View style={[styles.radio, current && styles.radioOn]}>{current ? <View style={styles.radioDot} /> : null}</View>}
            </Pressable>
          );
        })}

        <Pressable accessibilityRole="button" onPress={addAccount} style={({ pressed }) => [styles.add, pressed && styles.accountPressed]}>
          <View style={styles.addIcon}><PlusIcon size={20} color={t.neutral[600]} /></View>
          <Text style={styles.addText}>Add account</Text>
        </Pressable>
      </Sheet>

      <CartConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.fullName || removing?.email || 'this account'} from this phone?`}
        message="It will be signed out here. You can add it again by logging in."
        confirmLabel="Remove"
        danger
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14, padding: 14, borderRadius: 12,
    backgroundColor: t.info[50],
  },
  noteText: { flex: 1, fontSize: 14, lineHeight: 20, color: t.neutral[800], ...font(400) },

  account: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  accountOn: { borderColor: t.primary[600], backgroundColor: t.primary[50] },
  accountPressed: { backgroundColor: t.neutral[50] },
  remove: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[500],
  },
  avatar: {
    width: 46, height: 46, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.primary[100],
  },
  avatarImg: { width: 46, height: 46 },
  avatarText: { fontSize: 18, color: t.primary[700], ...font(600) },
  accountText: { flex: 1, minWidth: 0, gap: 2 },
  accountName: { fontSize: 16, lineHeight: 21, color: t.neutral[900], ...font(600) },
  accountMeta: { fontSize: 13, lineHeight: 18, color: t.neutral[500], ...font(400) },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.neutral[300], alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },

  add: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 14, borderWidth: 1, borderColor: t.neutral[200],
  },
  addIcon: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[300],
  },
  addText: { flex: 1, fontSize: 16, lineHeight: 21, color: t.neutral[900], ...font(600) },
});
