import { forwardRef, useMemo, useRef } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthHeader from '../AuthHeader';
import { liquidGlass } from '../Glass';
import { AuthBand } from './AuthChoose';
import { font, t, themed } from '../../theme';

const CLOSE_MS = 260;
// Let go past a quarter of the screen, or with a flick (px per ms, down),
// and the sheet slides away (web lib/native/useSheetDrag).
const DISMISS_SHARE = 0.25;
const FLICK = 0.55;
const BACK_MS = 320;
const native = Platform.OS !== 'web';

/**
 * The phone sign-in sheet (web pages/AuthSheet.css): a full-screen white
 * sheet with the bar (handle, ×, the other form) on top and the form below,
 * 20px from the sides. Dragging the sheet down (by the bar, or anywhere while
 * the form is scrolled to its top) past a quarter of the screen or with a
 * flick, or tapping ×, slides it away from where it was let go and goes back
 * to the page it was opened over (Home if none); the dimmed page behind
 * brightens with the drag (web components/AuthSheetBar.jsx).
 *
 * switchTo / switchLabel: the bar's link; it replaces this sheet as the
 * website's does. `bar={false}` leaves the bar out (the email confirmation).
 * band: Log in / Sign up's first step (auth/AuthChoose): the pink-to-mint
 * band behind everything, the bar clear over it, and the phone's status bar
 * in the band's top colour with dark content (the website's StatusBarTint).
 */
const AuthSheet = forwardRef(function AuthSheet({
  children, switchTo, switchLabel, switchBold, bar = true, band = false, contentStyle, onClose,
}, ref) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const drag = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);
  // How far the form is scrolled: the whole sheet drags only at its top.
  const scrollY = useRef(0);
  const heightRef = useRef(screenH);
  heightRef.current = screenH;

  const leave = () => {
    if (onClose) { onClose(); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Slides the sheet down from wherever it is, then leaves. On iOS 26 the
  // sheet is a native page sheet (presentation: 'modal') with a white card
  // of its own: sliding this form away first left that card behind, which
  // then slid down after it (a second sheet). There the native dismissal
  // is the only one.
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    if (liquidGlass) { leave(); return; }
    Animated.timing(drag, {
      toValue: screenH, duration: CLOSE_MS, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native,
    }).start(() => leave());
  };

  const springBack = () => Animated.timing(drag, {
    toValue: 0, duration: BACK_MS, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native,
  }).start();
  const downward = (g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx);
  const gesture = {
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > heightRef.current * DISMISS_SHARE || (g.dy > 0 && g.vy > FLICK)) { close(); return; }
      springBack();
    },
    onPanResponderTerminate: springBack,
  };
  // The bar: always. The rest of the sheet: while the form is at its top
  // (taken before the buttons and the scroll box, which keep taps and
  // scrolling up).
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => downward(g),
    ...gesture,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const sheetPan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => scrollY.current <= 0 && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
    ...gesture,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const backdrop = drag.interpolate({ inputRange: [0, screenH], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]} />
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: drag }] }]}
        // iOS 26: the native sheet's own swipe-down closes it.
        {...(liquidGlass ? null : sheetPan.panHandlers)}
      >
        {/* iOS 26: the page sheet sits below the status bar, which is not ours to tint. */}
        {band ? <AuthBand top={liquidGlass ? 0 : insets.top} /> : null}
        {band && !liquidGlass ? <StatusBar style="dark" /> : null}
        {bar ? (
          <AuthHeader
            onBand={band}
            onClose={close}
            switchLabel={switchLabel}
            switchBold={switchBold}
            onSwitch={() => switchTo && router.replace(switchTo)}
            // iOS 26: the native sheet's own swipe-down closes it.
            panHandlers={liquidGlass ? undefined : pan.panHandlers}
          />
        ) : null}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
            ref={ref}
            onScroll={(e) => { scrollY.current = e.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            overScrollMode="never"
            contentContainerStyle={[
              styles.content,
              // The band's white body clears the home bar itself.
              { paddingBottom: band ? 0 : 24 + insets.bottom },
              // (iOS 26: the page sheet already sits below the status bar.)
              !bar && !liquidGlass && { paddingTop: insets.top },
              contentStyle,
            ]}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </View>
  );
});

export default AuthSheet;

/** "Need Help?" under the Log in / Sign up form (.login-help-link in the sheet). */
export function HelpLink({ style }) {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push('/help-center')} style={[styles.help, style]}>
      <Text style={styles.helpText}>Need Help?</Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.42)' },
  sheet: { flex: 1, backgroundColor: t.neutral[0] },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  help: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 32 },
  helpText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(500) },
}));
