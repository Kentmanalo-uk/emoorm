import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { loadFontsByFetch } from '../src/lib/devFonts';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Fragment, useEffect, useState } from 'react';
import { View, StyleSheet, Text, TextInput } from 'react-native';
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
import { activeScheme, colors, fontFamily, themed } from '../src/theme';
import ThemeGate from '../src/theme/ThemeGate';
import { useResolvedScheme } from '../src/store/themeStore';
import { toastConfig } from '../src/lib/toast';
import { AccountSwitchHost } from '../src/components/RoleSwitchOverlay';
import { liquidGlass } from '../src/components/Glass';
import { AccountSheetHost } from '../src/components/AccountSheet';
import { HeroFlightHost } from '../src/components/HeroFlight';
import BrandSplash from '../src/components/BrandSplash';
import { LoaderOverlayHost } from '../src/components/BrandLoader';
import { CommerceHudHost } from '../src/components/CommerceHud';
import { PeekHost } from '../src/components/Peek';
import { SwitchAccountHost } from '../src/components/SwitchAccountSheet';

// Log in, Sign up and the password screens open as a sheet over the page the
// shopper was on (web pages/AuthSheet.css). iOS 26: the system's own sheet
// (swipe down to close). Elsewhere: it slides up from the bottom over the
// page, which stays behind it as on the website.
const AUTH_SHEET = liquidGlass
  ? { presentation: 'modal', gestureEnabled: true }
  : {
    presentation: 'transparentModal',
    animation: 'slide_from_bottom',
    animationDuration: 380,
    // The page stays visible behind the sheet: no screen colour of its own.
    contentStyle: { backgroundColor: 'transparent' },
  };

/*
 * Light or dark: each page is built again when the palette changes.
 *
 * A stylesheet is frozen the first time its page paints, so a page already
 * open would otherwise keep the colours it opened with, and the pages
 * stacked behind it would too. Rebuilding is the only way to turn them all
 * at once; it costs the open page's scroll position.
 *
 * This sits on the navigator rather than around the whole app on purpose:
 * the navigator's own state — which pages are open, and which one you are
 * looking at — lives above it, so changing the setting leaves you exactly
 * where you were instead of dropping you back on the home page.
 */
const repaintOnTheme = ({ children }) => <Fragment key={activeScheme()}>{children}</Fragment>;

SplashScreen.preventAutoHideAsync().catch(() => { });

// How long the opening waits for the fonts before it shows the app anyway.
const FONT_WAIT_MS = 8000;
const FONTS = {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
};



const PROTECTED_PATHS = [
  '/conversation',
  '/orders',
  '/offers',
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
  // ThemeGate sets the palette and remounts the app when it changes, so
  // every page is painted by the same one.
  return (
    <ThemeGate>
      <AppRoot />
    </ThemeGate>
  );
}

function AppRoot() {
  const scheme = useResolvedScheme();
  const pathname = usePathname();
  const router = useRouter();
  const hydrate = useAuthStore((s) => s.hydrate);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [fontsReady, fontError] = useFonts(FONTS);
  // The app opens with DM Sans, or with the phone's own font when DM Sans
  // fails or takes too long (useFonts never turns true after an error).
  const [fontWait, setFontWait] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setFontWait(false), FONT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);
  // DM Sans that fails to load (Expo Go on some iPhones can't download
  // assets at all) is fetched another way (lib/devFonts) or asked for once
  // more, before the app opens, so the first screens already use it.
  const [fontRetried, setFontRetried] = useState(false);
  useEffect(() => {
    if (!fontError) return undefined;
    let live = true;
    (__DEV__ ? loadFontsByFetch(FONTS) : Font.loadAsync(FONTS))
      .catch((e) => console.warn('Fonts did not load:', e?.message || e))
      .finally(() => { if (live) setFontRetried(true); });
    return () => { live = false; };
  }, [fontError]);
  const fontsLoaded = fontsReady || fontRetried || !fontWait;
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

  return (
    <SafeAreaProvider>
      {/* Dark pages need light clock and battery icons, and the other way round. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {!isHydrated || !fontsLoaded || requiresLogin ? (
        // Under the opening splash (BrandSplash) until the first page can show.
        <View style={styles.splash} />
      ) : (
        <Stack screenOptions={{ headerShown: false }} screenLayout={repaintOnTheme}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="product/[slug]"
            // Opened from a product card: the page fades in while the card's
            // photo flies to its gallery (components/HeroFlight).
            options={({ route }) => (route.params?.via === 'card' ? { animation: 'fade', animationDuration: 260 } : {})}
          />
          <Stack.Screen name="store/[slug]" />
          {/* Search swaps in at once (no slide), and so do its results: a
              search word (q), or a category picked on the search page. */}
          <Stack.Screen name="search" options={{ animation: 'none' }} />
          <Stack.Screen
            name="products"
            options={({ route }) => (route.params?.q || route.params?.via === 'search' ? { animation: 'none' } : {})}
          />
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
            <Stack.Screen name="(auth)" options={AUTH_SHEET} />
          </Stack.Protected>
        </Stack>
      )}
      {/* The account switch's fade-out runs over whichever page it lands on. */}
      <AccountSwitchHost />
      <AccountSheetHost />
      {/* Settings → Switch account: the accounts saved on this phone. */}
      <SwitchAccountHost />
      {/* The loader in the middle of the screen while a page loads (PageLoader). */}
      <LoaderOverlayHost />
      <HeroFlightHost />
      {/* Long-press previews of products, shops, chats… (components/Peek). */}
      <PeekHost />
      {/* The opening: the logo builds itself, then fades over the first page. */}
      <BrandSplash ready={isHydrated && fontsLoaded && !requiresLogin} />
      <Toast config={toastConfig} topOffset={52} />
      {/* "Added to cart" / wishlist: fades in and out in the middle. */}
      <CommerceHudHost />
    </SafeAreaProvider>
  );
}

const styles = themed(() => StyleSheet.create({
  splash: { flex: 1, backgroundColor: colors.bgPrimary },
}));
