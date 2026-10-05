import { forwardRef, useMemo, useRef } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AuthHeader from '../AuthHeader';
import { font, t } from '../../theme';

const CLOSE_MS = 260;
const DISMISS_PX = 110;
const native = Platform.OS !== 'web';

/**
 * The phone sign-in sheet (web pages/AuthSheet.css): a full-screen white
 * sheet with the bar (handle, ×, the other form) on top and the form below,
 * 20px from the sides. Dragging the bar down past 110px, or tapping ×, slides
 * it away and goes back to the page it was opened over (Home if none).
 *
 * switchTo / switchLabel: the bar's link; it replaces this sheet as the
 * website's does. `bar={false}` leaves the bar out (the email confirmation).
 */
const AuthSheet = forwardRef(function AuthSheet({
  children, switchTo, switchLabel, switchBold, bar = true, contentStyle, onClose,
}, ref) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const drag = useRef(new Animated.Value(0)).current;
  const leaving = useRef(false);

  const leave = () => {
    if (onClose) { onClose(); return; }
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  // Slides the sheet down from wherever it is, then leaves.
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    Animated.timing(drag, {
      toValue: screenH, duration: CLOSE_MS, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native,
    }).start(() => leave());
  };

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > DISMISS_PX) { close(); return; }
      Animated.timing(drag, { toValue: 0, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: native }).start();
    },
    onPanResponderTerminate: () => {
      Animated.timing(drag, { toValue: 0, duration: 200, useNativeDriver: native }).start();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const backdrop = drag.interpolate({ inputRange: [0, screenH], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]} />
      <Animated.View style={[styles.sheet, { transform: [{ translateY: drag }] }]}>
        {bar ? (
          <AuthHeader
            onClose={close}
            switchLabel={switchLabel}
            switchBold={switchBold}
            onSwitch={() => switchTo && router.replace(switchTo)}
            panHandlers={pan.panHandlers}
          />
        ) : null}
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView
            ref={ref}
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            overScrollMode="never"
            contentContainerStyle={[
              styles.content,
              { paddingBottom: 24 + insets.bottom },
              !bar && { paddingTop: insets.top },
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.42)' },
  sheet: { flex: 1, backgroundColor: t.neutral[0] },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20 },
  help: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 32 },
  helpText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(500) },
});
