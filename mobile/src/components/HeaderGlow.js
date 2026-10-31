import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { t, themed } from '../theme';
import stopPaint from '../lib/stopPaint';
import { GradientFill } from './inbox/InboxGradient';

/*
 * The light wash behind the page headers: soft pink on the left to light
 * green on the right (Ate Moormy's colours, very softened), with a soft
 * bottom edge into the page's white. Put it first inside a header (it
 * fills it), or give `height` to cover a stack of views from the screen's
 * top (the status bar's gap and the bar under it).
 *
 *   <View style={styles.bar}><HeaderGlow />…</View>
 *   <HeaderGlow height={insets.top + 56} />
 */

// How strong the wash is (lower is lighter): one number for every header.
export const HEADER_GLOW_STRENGTH = 0.5;

/* Read on each render rather than captured once, so the wash turns with the
   mode: the same stops are deep pink and deep green on a dark page. */
const glowColors = () => [t.accent[200], t.accent[100], t.primary[100]];

export default function HeaderGlow({ height, style }) {
  const id = `hg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // The page's own colour, so the wash fades into the page in either mode.
  const page = t.neutral[0];
  return (
    <View pointerEvents="none" style={[height == null ? StyleSheet.absoluteFill : [styles.top, { height }], styles.clip, style]}>
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
}));
