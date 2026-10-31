import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { activeScheme, ink, veil } from '../theme';

/**
 * iOS 26 Liquid Glass, and the same surface everywhere else.
 *
 * On an iPhone with iOS 26 the system draws real Liquid Glass (expo-glass-
 * effect): tab bars, floating header buttons, sheets' grab bars, the bars
 * that float over content. On Android and older iPhones the same component
 * renders a plain View with `fallbackStyle` (by default the website's white,
 * a hairline and a soft shadow), so layouts never change between platforms.
 *
 * Do not fade a Glass (or a parent) to opacity 0: the glass stops rendering
 * (Expo's caveat). Hide it with display or unmount it instead.
 */
export const liquidGlass = Platform.OS === 'ios' && (() => {
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
})();

/* Read when the surface is drawn, not when this module loads, so the panel
   is the dark card colour in dark mode instead of staying white. */
const FALLBACK = {
  get backgroundColor() { return veil(0.96); },
  borderWidth: 1,
  get borderColor() { return ink(0.06); },
  get boxShadow() { return [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: ink(0.08) }]; },
};

export default function Glass({
  children, style, fallbackStyle = FALLBACK, glassStyle = 'regular', tintColor, interactive = false, ...rest
}) {
  if (liquidGlass) {
    return (
      <GlassView
        glassEffectStyle={glassStyle}
        colorScheme={activeScheme()}
        tintColor={tintColor}
        isInteractive={interactive}
        style={style}
        {...rest}
      >
        {children}
      </GlassView>
    );
  }
  return <View style={[fallbackStyle, style]} {...rest}>{children}</View>;
}

/**
 * iOS 26: a Liquid Glass background for a floating panel (the ⋯ menus'
 * pop-overs): put it first inside the panel and give the panel a transparent
 * background on iOS 26. It takes no touches, so the rows above it work. Draw
 * nothing elsewhere: the panel keeps the website's white.
 *
 * The glass can't fade in from opacity 0 (Expo's caveat), so animate such a
 * panel's scale/position only while `liquidGlass`, never its opacity.
 */
export function GlassBackdrop({ radius = 14, white = 0 }) {
  if (!liquidGlass) return null;
  const fill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius };
  return (
    <>
      <GlassView pointerEvents="none" glassEffectStyle="regular" colorScheme={activeScheme()} style={fill} />
      {/* `white`: how far the glass is veiled in the page's own card colour
          (0–1), so what sits on it stays easy to read in either mode. */}
      {white > 0 ? <View pointerEvents="none" style={[fill, { backgroundColor: veil(white) }]} /> : null}
    </>
  );
}

/**
 * iOS 26: the buyer tab bar lies over the bottom of the tab pages, full width
 * (not a floating capsule), with a Liquid Glass background the page shows
 * through as it scrolls under it: the product page's bottom bar's look.
 * Elsewhere it sits under the page as on the website.
 *   floatingTabBar         does the bar lie over the page here?
 *   tabBarTop(insets)      its height from the screen's bottom edge
 *   useTabBarScroll(extra) props for a tab page's ScrollView/FlatList so its
 *                          last items scroll clear of the bar (and of a bar
 *                          of the page's own above it: extra px)
 */
export const floatingTabBar = liquidGlass;
// The website's bar: 7px + a 28px icon + 3px + the 12px label, above the
// home bar (at least 8px), and never under 74px.
// (The Seller Center's bar is at least 68px.)
export const tabBarTop = (insets, min = 74) => Math.max(min, 50 + Math.max(8, insets?.bottom || 0));

export function useTabBarScroll(extra = 0, min = 74) {
  const insets = useSafeAreaInsets();
  if (!floatingTabBar) return {};
  const bottom = tabBarTop(insets, min) + extra;
  return { contentInset: { bottom }, scrollIndicatorInsets: { bottom } };
}
