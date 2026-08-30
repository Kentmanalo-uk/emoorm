import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PencilSimpleIcon, MapPinIcon, BellIcon, TagIcon, ShoppingBagIcon,
  QuestionIcon, InfoIcon, CaretRightIcon, UserSwitchIcon,
} from 'phosphor-react-native';
import ScreenHeader from '../src/components/ScreenHeader';
import RoleSwitchOverlay from '../src/components/RoleSwitchOverlay';
import Toggle from '../src/components/Toggle';
import useAuthStore from '../src/store/authStore';
import { colors, fontFamily, radius, spacing, typography } from '../src/theme';

const PREFERENCE_KEYS = {
  push: 'settings:pushNotifications',
  orders: 'settings:orderUpdates',
  promotions: 'settings:promotions',
};

export default function Settings() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isSeller = user?.role === 'SELLER';
  const [preferences, setPreferences] = useState({ push: true, orders: true, promotions: false });
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(Object.values(PREFERENCE_KEYS)).then((pairs) => {
      const stored = Object.fromEntries(pairs);
      setPreferences({
        push: stored[PREFERENCE_KEYS.push] !== 'false',
        orders: stored[PREFERENCE_KEYS.orders] !== 'false',
        promotions: stored[PREFERENCE_KEYS.promotions] === 'true',
      });
    });
  }, []);

  const togglePreference = (key) => setPreferences((current) => {
    const next = { ...current, [key]: !current[key] };
    AsyncStorage.setItem(PREFERENCE_KEYS[key], String(next[key]));
    return next;
  });

  const switchAccount = () => {
    setSwitching(true);
    setTimeout(() => { router.replace(isSeller ? '/seller' : '/seller-apply'); setSwitching(false); }, 650);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.rowList}>
            <SettingRow Icon={PencilSimpleIcon} label="Edit Profile" detail="Name, contact number, and password" onPress={() => router.push('/edit-profile')} />
            <SettingRow Icon={MapPinIcon} label="Delivery Addresses" detail="Manage your saved addresses" onPress={() => router.push('/addresses')} last />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notification Preferences</Text>
          <View style={styles.rowList}>
            <ToggleRow Icon={BellIcon} label="Push Notifications" detail="Reminders and account alerts" value={preferences.push} onValueChange={() => togglePreference('push')} />
            <ToggleRow Icon={ShoppingBagIcon} label="Order Updates" detail="Confirmation, shipping, and delivery" value={preferences.orders} onValueChange={() => togglePreference('orders')} />
            <ToggleRow Icon={TagIcon} label="Promotions" detail="Deals from stores you follow" value={preferences.promotions} onValueChange={() => togglePreference('promotions')} last />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.rowList}>
            <SettingRow Icon={QuestionIcon} label="Help Center" detail="FAQs and contact support" onPress={() => router.push('/help-center')} last />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.aboutRow}>
            <InfoIcon size={19} color={colors.textMuted} />
            <Text style={styles.aboutText}>eMoorm v1.0.0</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.switchButton, pressed && styles.pressed]} onPress={switchAccount}>
            <Text style={styles.switchText}>Switch Account</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]} onPress={logout}>
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>
      </ScrollView>
      <RoleSwitchOverlay
        visible={switching}
        label="Switching account..."
        Icon={UserSwitchIcon}
      />
    </View>
  );
}

function SettingRow({ Icon, label, detail, onPress, last }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} style={[styles.row, !last && styles.rowDivider]} onPress={onPress}>
      <View style={styles.rowIcon}><Icon size={20} color={colors.secondary} /></View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowMeta}>{detail}</Text> : null}
      </View>
      <CaretRightIcon size={17} color={colors.gray300} />
    </Pressable>
  );
}

function ToggleRow({ Icon, label, detail, value, onValueChange, last }) {
  return (
    <View style={[styles.row, !last && styles.rowDivider]}>
      <View style={styles.rowIcon}><Icon size={20} color={colors.secondary} /></View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{label}</Text>
        {detail ? <Text style={styles.rowMeta}>{detail}</Text> : null}
      </View>
      <Toggle value={value} onValueChange={onValueChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  section: { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  rowList: { marginHorizontal: -spacing.lg },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLight },
  rowIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1 },
  rowTitle: { ...typography.body, color: colors.textPrimary },
  rowMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aboutText: { ...typography.body, color: colors.textMuted },
  actions: { gap: spacing.sm },
  switchButton: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.textPrimary,
    minHeight: 52, paddingVertical: spacing.md,
  },
  switchText: { ...typography.body, color: colors.textPrimary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  logoutButton: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.textPrimary,
    minHeight: 52, paddingVertical: spacing.md,
  },
  logoutText: { ...typography.body, color: colors.textPrimary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  pressed: { opacity: 0.58 },
});
