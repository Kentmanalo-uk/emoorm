import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import useAuthStore from '../../src/store/authStore';
import { AccountSwitchHost } from '../../src/components/RoleSwitchOverlay';
import { SellerShellProvider } from '../../src/components/seller/SellerShell';
import SellerPhoneGuide from '../../src/components/seller/SellerPhoneGuide';
import SetupReturnPill from '../../src/components/seller/SetupReturnPill';
import { t } from '../../src/theme';

/**
 * The Seller Center shell (web/src/components/layout/SellerLayout.jsx, phones):
 * signed-in sellers only (a signed-out visitor is sent to sign in by
 * app/_layout.js; anyone else to the seller application, as the website sends
 * them to /sell). The five tab pages live in (tabs) with the seller tab bar;
 * every other page is a stack screen with its own back bar. Around them: the
 * shared shop data (useSellerShell), the first-visit guide sheets, the Back to
 * setup pill and the account switch.
 */
export default function SellerLayout() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const role = useAuthStore((s) => s.user?.role);
  const allowed = isAuthenticated && (role === 'SELLER' || role === 'SUPER_ADMIN');

  useEffect(() => {
    if (isAuthenticated && !allowed) router.replace('/seller-apply');
  }, [isAuthenticated, allowed, router]);

  if (!allowed) return <View style={styles.screen} />;

  return (
    <SellerShellProvider>
      <View style={styles.screen}>
        <Stack screenOptions={{ headerShown: false, contentStyle: styles.screen }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        <SellerPhoneGuide />
        <SetupReturnPill />
        <AccountSwitchHost />
      </View>
    </SellerShellProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
});
