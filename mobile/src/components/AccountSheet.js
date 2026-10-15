import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { create } from 'zustand';
import {
  ArrowsLeftRightIcon, CaretRightIcon, GearIcon, SignOutIcon, UsersThreeIcon,
} from 'phosphor-react-native';
import useAuthStore from '../store/authStore';
import { resolveImg } from '../lib/media';
import { font, t } from '../theme';
import Sheet, { SheetButton } from './Sheet';
import { startAccountSwitch } from './RoleSwitchOverlay';
import { openSwitchAccount } from './SwitchAccountSheet';

/*
 * The account sheet, one for the whole app: hold the Profile tab (or the
 * Seller Center's Me tab) for it, or tap Log out anywhere.
 *   step "menu":    who is signed in, switch between the buyer and seller
 *                   accounts, settings, Log out
 *   step "confirm": "Log out?" with Cancel / Log out
 * It is a bottom sheet on every phone: the system's own Liquid Glass sheet on
 * iOS 26, the website's sheet elsewhere (Sheet chooses).
 *
 * openAccountSheet('menu' | 'confirm'); mount <AccountSheetHost /> once.
 */
const useAccountSheet = create((set) => ({
  open: false,
  step: 'menu',
  show: (step = 'menu') => set({ open: true, step }),
  setStep: (step) => set({ step }),
  hide: () => set({ open: false }),
}));

export const openAccountSheet = (step = 'menu') => {
  if (!useAuthStore.getState().isAuthenticated) return;
  useAccountSheet.getState().show(step);
};

export function AccountSheetHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { open, step, setStep, hide } = useAccountSheet();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  if (!user) return null;

  const inSeller = pathname === '/seller' || pathname.startsWith('/seller/');
  const isSeller = user.role === 'SELLER';
  const photo = resolveImg(user.profilePhoto);
  const initial = (user.fullName || user.email || '?').trim().charAt(0).toUpperCase();

  // Close first, then act, so the next screen never opens under the sheet.
  const after = (fn) => { hide(); setTimeout(fn, 320); };
  const signOut = () => after(async () => {
    await logout();
    router.replace(inSeller ? '/' : '/profile');
  });

  if (step === 'confirm') {
    return (
      <Sheet
        open={open}
        onClose={hide}
        variant="seller"
        title="Log out?"
        footer={(
          <>
            <SheetButton variant="seller" label="Cancel" onPress={hide} />
            <SheetButton variant="seller" primary label="Log out" onPress={signOut} style={styles.danger} />
          </>
        )}
      >
        <Text style={styles.message}>
          {inSeller
            ? 'You will need to log in again to manage your shop.'
            : 'You will need to log in again to place orders and see your account.'}
        </Text>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={hide} variant="seller" title="Account">
      <View style={styles.who}>
        <View style={styles.avatar}>
          {photo ? <Image source={{ uri: photo }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{initial}</Text>}
        </View>
        <View style={styles.whoText}>
          <Text style={styles.name} numberOfLines={1}>{user.fullName || 'Your account'}</Text>
          {user.email ? <Text style={styles.email} numberOfLines={1}>{user.email}</Text> : null}
        </View>
      </View>

      {isSeller ? (
        <Row
          Icon={ArrowsLeftRightIcon}
          label={inSeller ? 'Switch to my buyer account' : 'Switch to my seller account'}
          onPress={() => after(() => (inSeller
            ? startAccountSwitch('personal', '/profile')
            : startAccountSwitch('seller', '/seller')))}
        />
      ) : null}
      <Row Icon={UsersThreeIcon} label="Switch account" onPress={() => after(openSwitchAccount)} />
      <Row
        Icon={GearIcon}
        label="Settings"
        onPress={() => after(() => router.push(inSeller ? '/seller/settings' : '/settings'))}
      />
      <Row Icon={SignOutIcon} label="Log out" danger onPress={() => setStep('confirm')} />
    </Sheet>
  );
}

function Row({ Icon, label, onPress, danger = false }) {
  const color = danger ? t.danger[600] : t.neutral[900];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <Icon size={20} weight="fill" color={color} />
      <Text style={[styles.rowText, { color }]}>{label}</Text>
      {danger ? null : <CaretRightIcon size={16} color={t.neutral[400]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.primary[100],
  },
  avatarImg: { width: 44, height: 44 },
  avatarText: { fontSize: 18, color: t.primary[700], ...font(600) },
  whoText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, lineHeight: 22, color: t.neutral[900], ...font(600) },
  email: { fontSize: 13, lineHeight: 18, color: t.neutral[500], ...font(400) },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52,
    borderTopWidth: 1, borderTopColor: t.neutral[100],
  },
  rowPressed: { opacity: 0.6 },
  rowText: { flex: 1, fontSize: 15, lineHeight: 22, ...font(500) },
  message: { fontSize: 15, lineHeight: 22, color: t.neutral[600], ...font(400), paddingBottom: 4 },
  danger: { backgroundColor: t.danger[600], borderColor: t.danger[600] },
});
