import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Image, View, StyleSheet, Text, TextInput } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import useAuthStore from '../src/store/authStore';
import { colors, fontFamily } from '../src/theme';
import { toastConfig } from '../src/lib/toast';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PROTECTED_PATHS = [
  '/conversation',
  '/orders',
  '/checkout',
  '/wishlist',
  '/addresses',
  '/reviews',
  '/followed-stores',
  '/settings',
  '/seller-apply',
  '/seller',
  '/design-system',
];

// Apply Inter as the app-wide default so screens/components that don't set
// an explicit typography style (e.g. auth forms) still render in Inter.
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
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
  const requiresLogin = !isAuthenticated && PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (isHydrated && fontsLoaded && requiresLogin) {
      router.replace({ pathname: '/login', params: { redirect: pathname } });
    }
  }, [fontsLoaded, isHydrated, pathname, requiresLogin, router]);

  useEffect(() => {
    if (isHydrated && fontsLoaded && !requiresLogin) SplashScreen.hideAsync().catch(() => {});
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
          <Stack.Screen name="search-by-image" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="wishlist" />
          <Stack.Screen name="addresses" />
          <Stack.Screen name="reviews" />
          <Stack.Screen name="followed-stores" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="seller-apply" />
          <Stack.Screen name="seller" />
          <Stack.Screen name="design-system" options={{ headerShown: true, title: 'Design System' }} />
          <Stack.Protected guard={!isAuthenticated}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      )}
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
