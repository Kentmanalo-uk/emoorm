import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Image, View, StyleSheet, Text, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
} from '@expo-google-fonts/dm-sans';
import useAuthStore from '../src/store/authStore';
import { colors, fontFamily } from '../src/theme';
import { toastConfig } from '../src/lib/toast';
import { AccountSwitchHost } from '../src/components/RoleSwitchOverlay';

SplashScreen.preventAutoHideAsync().catch(() => { });

const PROTECTED_PATHS = [
  '/conversation',
  '/orders',
  '/checkout',
  '/wishlist',
  '/addresses',
  '/reviews',
  '/followed-stores',
  '/settings',
  '/edit-profile',
  '/seller-apply',
  '/seller',
  '/design-system',
  '/qr-scan',
  '/qr-approve',
  '/returns',
  '/receipt',
  '/verification',
  '/support',
  '/reports',
  '/notification',
];

// DM Sans (the website's font) as the app-wide default, so screens and
// components without their own typography style still render in it.
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.style = [{ fontFamily: fontFamily.regular }, Text.defaultProps.style];
TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.style = [{ fontFamily: fontFamily.regular }, TextInput.defaultProps.style];

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMSans_800ExtraBold,
  });
  const requiresLogin = !isAuthenticated && PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated && fontsLoaded && requiresLogin) {
      // The Seller Center and the seller application sign in on the seller
      // login, as the website's /seller/login.
      const seller = pathname === '/seller' || pathname.startsWith('/seller/') || pathname.startsWith('/seller-');
      router.replace({ pathname: seller ? '/seller-login' : '/login', params: { redirect: pathname } });
    }
  }, [fontsLoaded, isHydrated, pathname, requiresLogin, router]);

  useEffect(() => {
    if (isHydrated && fontsLoaded && !requiresLogin) SplashScreen.hideAsync().catch(() => { });
  }, [fontsLoaded, isHydrated, requiresLogin]);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {!isHydrated || !fontsLoaded || requiresLogin ? (
        <View style={styles.splash}>
          <Image source={require('../assets/brand-icon.png')} style={styles.splashImage} resizeMode="contain" />
        </View>
      ) : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="product/[slug]" />
          <Stack.Screen name="store/[slug]" />
          <Stack.Screen name="stores" />
          <Stack.Screen name="help-center" />
          <Stack.Screen name="conversation/[id]" />
          <Stack.Screen name="conversation/select-product" />
          <Stack.Screen name="search-by-image" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="wishlist" />
          <Stack.Screen name="addresses" />
          <Stack.Screen name="reviews" />
          <Stack.Screen name="followed-stores" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="seller-apply" />
          <Stack.Screen name="seller" />
          <Stack.Screen name="qr-scan" />
          <Stack.Screen name="qr-approve" />
          <Stack.Screen name="design-system" options={{ headerShown: true, title: 'Design System' }} />
          <Stack.Protected guard={!isAuthenticated}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      )}
      {/* The account switch's fade-out runs over whichever page it lands on. */}
      <AccountSwitchHost />
      <Toast config={toastConfig} topOffset={52} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgPrimary,
  },
  splashImage: { width: 180, height: 180 },
});
