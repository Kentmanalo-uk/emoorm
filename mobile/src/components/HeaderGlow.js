import { Component, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { t, themed } from '../theme';
import useAppSettings from '../lib/appSettings';
import { GradientFill } from './inbox/InboxGradient';

/*
 * The light wash behind the page headers: soft pink on the left to light
 * green on the right (Moormy's colours, very softened), with a soft
 * bottom edge into the page's white. Put it first inside a header (it
 * fills it), or give `height` to cover a stack of views from the screen's
 * top (the status bar's gap and the bar under it).
 *
 *   <View style={styles.bar}><HeaderGlow />…</View>
 *   <HeaderGlow height={insets.top + 56} />
 *
 * A super admin chooses how the bars look on phones (App settings,
 * mobileHeaderStyle; web styles/phone-app.css "The header's colour"):
 *   GLOW   the wash (the default)
 *   WHITE  plain white (the page's own colour, so dark in dark mode)
 *   GREEN  the brand green, the status bar over it included, with light
 *          status-bar content and everything written on the bar in white
 *          (useHeaderInk gives a bar its colours)
 */

// How strong the wash is (lower is lighter): one number for every header.
export const HEADER_GLOW_STRENGTH = 0.5;

/* Read on each render rather than captured once, so the wash turns with the
   mode: the same stops are deep pink and deep green on a dark page. */
const glowColors = () => [t.accent[200], t.accent[100], t.primary[100]];

/** The header style the super admin chose: 'GLOW', 'WHITE' or 'GREEN'. */
export function useHeaderStyle() {
  const style = useAppSettings()?.mobileHeaderStyle;
  return style === 'WHITE' || style === 'GREEN' ? style : 'GLOW';
}

/* What is written on a green bar (web phone-app.css): white titles and
   icons, softer white for the quieter text. What opens from the bar (a
   menu, a sheet, a search field) keeps the page's own colours. */
const ON_GREEN = {
  green: true,
  strong: '#FFFFFF', // titles (--t-neutral-900/800/700)
  icon: '#FFFFFF', // the bar's icons
  body: 'rgba(255, 255, 255, 0.88)', // --t-neutral-600
  muted: 'rgba(255, 255, 255, 0.82)', // --t-neutral-500
  faint: 'rgba(255, 255, 255, 0.7)', // --t-neutral-400
  accent: '#BBF7D0', // --t-primary-700
  pressed: 'rgba(255, 255, 255, 0.16)', // a pressed icon's round
};

/**
 * The colours for what is written on a header bar: on the green header,
 * white (see ON_GREEN); otherwise null, and the bar keeps its own.
 *   const ink = useHeaderInk();
 *   <Text style={[styles.title, ink && { color: ink.strong }]}>
 */
export function useHeaderInk() {
  return useHeaderStyle() === 'GREEN' ? ON_GREEN : null;
}

/** The green header's status bar: light content while this screen is in front. */
function FocusedLightBar() {
  const focused = useIsFocused();
  return focused ? <StatusBar style="light" /> : null;
}

/* useIsFocused throws outside a route screen (a header drawn in a sheet or
   an overlay): there the bar is simply light while it shows. */
class GreenStatusBar extends Component {
  constructor(props) {
    super(props);
    this.state = { outside: false };
  }

  static getDerivedStateFromError() {
    return { outside: true };
  }

  componentDidCatch() { /* outside a screen: handled by the fallback */ }

  render() {
    return this.state.outside ? <StatusBar style="light" /> : <FocusedLightBar />;
  }
}

export default function HeaderGlow({ height, style }) {
  const id = `hg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const headerStyle = useHeaderStyle();
  const box = [height == null ? StyleSheet.absoluteFill : [styles.top, { height }], styles.clip, style];
  if (headerStyle === 'WHITE') {
    return <View pointerEvents="none" style={[box, styles.white]} />;
  }
  if (headerStyle === 'GREEN') {
    return (
      <View pointerEvents="none" style={[box, styles.green]}>
        <GreenStatusBar />
      </View>
    );
  }
  // The page's own colour, so the wash fades into the page in either mode.
  const page = t.neutral[0];
  return (
    <View pointerEvents="none" style={box}>
      <GradientFill colors={glowColors()} diagonal={false} opacity={HEADER_GLOW_STRENGTH} />
      {/* The soft bottom edge. */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={page} stopOpacity={0} />
            <Stop offset="0.8" stopColor={page} stopOpacity={0} />
            <Stop offset="1" stopColor={page} stopOpacity={0.7} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  clip: { overflow: 'hidden' },
  white: { backgroundColor: t.neutral[0] },
  // --header-green: var(--t-primary-600)
  green: { backgroundColor: t.primary[600] },
}));
