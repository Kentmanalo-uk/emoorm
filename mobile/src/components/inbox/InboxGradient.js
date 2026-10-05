import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Rect, Stop } from 'react-native-svg';
import { font, t } from '../../theme';

// Ate Moormy's pink and green (web Moormy.css --mmy-*).
export const MMY = {
  pink: t.accent[500],
  pinkSoft: '#fdf2f8',
  pinkLine: '#fbcfe8',
  pinkInk: '#be185d',
  green: t.primary[500],
};

/**
 * A CSS linear-gradient as a background: fills its parent (absolute), with
 * the parent's corner radius given as `radius`. `diagonal` is 135deg, else 90deg.
 */
export function GradientFill({ colors = [MMY.pink, MMY.green], radius = 0, diagonal = true, opacity = 1, style }) {
  const id = `ig${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden', opacity }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2={diagonal ? '1' : '0'}>
            {colors.map((c, i) => <Stop key={`${c}${i}`} offset={String(i / (colors.length - 1))} stopColor={c} />)}
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The pink-to-green "AI" pill after Ate Moormy's name (.mmy-ai-tag). */
export function AiTag({ style }) {
  return (
    <View style={[styles.tag, style]}>
      <GradientFill radius={999} diagonal={false} />
      <Text style={styles.tagText}>AI</Text>
    </View>
  );
}

/**
 * A Phosphor icon filled with a gradient, drawn from the icon's own fill
 * paths (the website fills its phone icons with url(#sh-grad-<tone>)).
 */
const iconPaths = (Icon) => Icon({}).props.weights.get('fill');
export function GradientIcon({ Icon, size = 24, colors }) {
  const id = `gi${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={colors[0]} />
          <Stop offset="1" stopColor={colors[1]} />
        </LinearGradient>
      </Defs>
      <G fill={`url(#${id})`}>{iconPaths(Icon)}</G>
    </Svg>
  );
}

// web/src/components/ui/ToolGradients.jsx
export const TOOL_GRADIENTS = {
  orange: ['#fbbf24', '#ea580c'],
  blue: ['#38bdf8', '#2563eb'],
  violet: ['#c084fc', '#6d28d9'],
  green: ['#4ade80', '#047857'],
  amber: ['#fde047', '#ea580c'],
  rose: ['#fda4af', '#e11d48'],
  pink: ['#f9a8d4', '#c026d3'],
  teal: ['#5eead4', '#0e7490'],
  slate: ['#cbd5e1', '#475569'],
};

const styles = StyleSheet.create({
  tag: { marginLeft: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden', alignSelf: 'center' },
  tagText: { fontSize: 11, lineHeight: 15, letterSpacing: 0.3, color: '#fff', ...font(500) },
});
