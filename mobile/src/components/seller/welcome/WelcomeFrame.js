import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeftIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import Glass from '../../Glass';
import { ScrollRevealContext, useScrollReveal } from '../../ScrollReveal';

/*
 * The guided setup's frame on phones (web SellerWelcome.jsx `frame()` +
 * SellerWelcome.css, max-width 768px): the whole screen, white, outside the
 * Seller Center's bars. On top (.sw-top) the logo or a back arrow, the three
 * parts' progress bars and "Skip setup"; the screen's words scroll in the
 * middle (.sw-body, sliding in when the screen changes); the buttons
 * (.sw-foot) float over the bottom in Glass: iOS 26 Liquid Glass, elsewhere
 * the website's white bar with a hairline above.
 *
 * <WelcomeFrame screenKey top={{ onBack, progress: [0..1, 0..1, 0..1], progressLabel, onSkip }} footer={…} still>
 */

/* A function, not a table: this is handed to a component whole, and
   React Native freezes the style it is given. A fresh object each time
   keeps the colours of the palette in use. */
const footFallback = () => ({
  backgroundColor: t.neutral[0],
  borderTopWidth: 1,
  borderTopColor: t.neutral[100],
});

/** One part's bar (.sw-bar): grey, filled in green from the left. */
function ProgressBar({ fill, still }) {
  const width = useRef(new Animated.Value(fill)).current;
  useEffect(() => {
    if (still) { width.setValue(fill); return; }
    Animated.timing(width, { toValue: fill, duration: 350, easing: Easing.ease, useNativeDriver: false }).start();
  }, [fill, still, width]);
  const pct = width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.bar}>
      <Animated.View style={[styles.barFill, { width: pct }]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="swBar" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={t.primary[500]} />
              <Stop offset="1" stopColor={t.primary[600]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#swBar)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** .sw-body: each new screen rises 10 px and fades in (0.32 s, ease-out). */
function SlideIn({ still, children }) {
  const v = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) return;
    Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
  }, [still, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });
  return <Animated.View style={[styles.slide, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

export default function WelcomeFrame({ screenKey, top, footer, still = false, children }) {
  const insets = useSafeAreaInsets();
  const [footHeight, setFootHeight] = useState(0);
  const scrollRef = useRef(null);
  // Inline panels in a screen (the delivery step's Add a place) scroll themselves into sight.
  const { reveal, contentProps } = useScrollReveal(scrollRef);

  // A new screen starts at its top.
  useEffect(() => { scrollRef.current?.scrollTo?.({ y: 0, animated: false }); }, [screenKey]);

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {top ? (
        <View style={[styles.top, { paddingTop: 10 + insets.top }]}>
          {top.onBack ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={top.onBack} style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}>
              <ArrowLeftIcon size={20} color={t.neutral[800]} />
            </Pressable>
          ) : (
            <Image source={require('../../../../assets/brand-icon.png')} style={styles.logo} accessibilityLabel="Emoorm" />
          )}
          {top.progress ? (
            <View style={styles.progress} accessibilityLabel={top.progressLabel}>
              {top.progress.map((fill, i) => <ProgressBar key={i} fill={fill} still={still} />)}
            </View>
          ) : null}
          {top.onSkip ? (
            <Pressable accessibilityRole="button" onPress={top.onSkip} style={styles.skipAll}>
              {({ pressed }) => <Text style={[styles.skipAllText, pressed && styles.skipAllTextPressed]}>Skip setup</Text>}
            </Pressable>
          ) : null}
        </View>
      ) : <View style={{ height: insets.top }} />}

      <ScrollView showsHorizontalScrollIndicator={false}
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingBottom: 16 + (footer ? footHeight : insets.bottom) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View {...contentProps} style={styles.slide}>
          <ScrollRevealContext.Provider value={reveal}>
            <SlideIn key={screenKey} still={still}>{children}</SlideIn>
          </ScrollRevealContext.Provider>
        </View>
      </ScrollView>

      {footer ? (
        <Glass
          fallbackStyle={footFallback()}
          style={[styles.foot, { paddingBottom: 14 + insets.bottom }]}
          onLayout={(e) => setFootHeight(e.nativeEvent.layout.height)}
        >
          {footer}
        </Glass>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[0] },
  flex: { flex: 1 },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 60,
    paddingRight: 14,
    paddingBottom: 10,
    paddingLeft: 10,
    backgroundColor: t.neutral[0],
    zIndex: 2,
  },
  logo: { width: 32, height: 32, marginLeft: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtnPressed: { backgroundColor: t.neutral[100] },
  progress: { flex: 1, flexDirection: 'row', gap: 6, minWidth: 0 },
  bar: { flex: 1, height: 5, overflow: 'hidden', borderRadius: 999, backgroundColor: t.neutral[150] },
  barFill: { height: '100%', overflow: 'hidden', borderRadius: 999 },
  skipAll: { marginLeft: 'auto', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  skipAllText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[500], ...font(400) },
  skipAllTextPressed: { color: t.neutral[800] },

  body: { flexGrow: 1, paddingHorizontal: 20 },
  slide: { flexGrow: 1 },

  foot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: 6,
    paddingTop: 12,
    paddingHorizontal: 20,
  },
}));
