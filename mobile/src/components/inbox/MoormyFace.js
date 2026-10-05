import { useId } from 'react';
import { Platform } from 'react-native';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';

/**
 * Ate Moormy's face (web/src/components/moormy/MoormyFace.jsx): a friendly
 * Filipina "ate" with round glasses and her hair in a bun, on the brand's
 * pink-to-green circle. Decorative: her name is always said beside her.
 */
// Hidden from screen readers (react-native-svg hands these straight to the DOM on web).
const HIDDEN = Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

export default function MoormyFace({ size = 40 }) {
  const id = `mf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const url = (n) => `url(#${id}-${n})`;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" {...HIDDEN}>
      <Defs>
        <LinearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#f472b6" />
          <Stop offset="1" stopColor="#10b981" />
        </LinearGradient>
        <RadialGradient id={`${id}-gloss`} cx="0.3" cy="0.2" r="0.7">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={`${id}-skin`} cx="0.42" cy="0.38" r="0.7">
          <Stop offset="0" stopColor="#e7b48f" />
          <Stop offset="0.65" stopColor="#c98b62" />
          <Stop offset="1" stopColor="#a96a45" />
        </RadialGradient>
        <LinearGradient id={`${id}-neck`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#9c5f3d" />
          <Stop offset="1" stopColor="#bf7f57" />
        </LinearGradient>
        <LinearGradient id={`${id}-hair`} x1="0.2" y1="0" x2="0.8" y2="1">
          <Stop offset="0" stopColor="#3a2620" />
          <Stop offset="1" stopColor="#120a08" />
        </LinearGradient>
        <LinearGradient id={`${id}-shirt`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#34d399" />
          <Stop offset="1" stopColor="#047857" />
        </LinearGradient>
        <RadialGradient id={`${id}-lens`} cx="0.35" cy="0.3" r="0.8">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <Stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </RadialGradient>
        <ClipPath id={`${id}-clip`}><Circle cx="60" cy="60" r="60" /></ClipPath>
      </Defs>

      <G clipPath={url('clip')}>
        <Circle cx="60" cy="60" r="60" fill={url('bg')} />
        <G transform="matrix(1.2 0 0 1.2 -12 -6)">
          <Path d="M30 56 C28 32 42 20 60 20 C78 20 92 32 90 56 L92 86 C85 91 78 90 74 84 L46 84 C42 90 35 91 28 86 Z" fill={url('hair')} />
          <Path d="M14 122 C16 98 36 86 60 86 C84 86 104 98 106 122 Z" fill={url('shirt')} />
          <Path d="M49 86 L60 100 L71 86 Z" fill="#c98b62" />
          <Path d="M49 86 L60 100 L71 86" fill="none" stroke="#065f46" strokeWidth="1.6" strokeLinejoin="round" opacity="0.5" />
          <Path d="M24 108 C34 96 46 92 54 92" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.22" />
          <Rect x="52" y="70" width="16" height="20" rx="7" fill={url('neck')} />
          <Ellipse cx="38.5" cy="57" rx="4.2" ry="5.4" fill="#bf7f57" />
          <Ellipse cx="81.5" cy="57" rx="4.2" ry="5.4" fill="#bf7f57" />
          <Circle cx="38.5" cy="64.5" r="2.3" fill="#fbbf24" />
          <Circle cx="81.5" cy="64.5" r="2.3" fill="#fbbf24" />
          <Circle cx="37.9" cy="63.9" r="0.8" fill="#fff7d1" />
          <Circle cx="80.9" cy="63.9" r="0.8" fill="#fff7d1" />
          <Ellipse cx="60" cy="55" rx="22" ry="25" fill={url('skin')} />
          <Circle cx="60" cy="19" r="10" fill={url('hair')} />
          <Path d="M53 15 C56 11 63 11 66 14" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.25" />
          <Path d="M37 50 C36 33 47 26 60 26 C74 26 85 34 83 50 C79 42 72 38 64 37 C58 41 48 43 37 50 Z" fill={url('hair')} />
          <Path d="M45 33 C50 29 57 28 63 29" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.22" />
          <Path d="M45.5 46 C48 44.4 52 44.4 55 45.6" fill="none" stroke="#2a1a15" strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M65 45.6 C68 44.4 72 44.4 74.5 46" fill="none" stroke="#2a1a15" strokeWidth="1.8" strokeLinecap="round" />
          <Ellipse cx="51" cy="54" rx="2.6" ry="3.1" fill="#2a1a15" />
          <Ellipse cx="69" cy="54" rx="2.6" ry="3.1" fill="#2a1a15" />
          <Circle cx="51.9" cy="53" r="0.9" fill="#ffffff" />
          <Circle cx="69.9" cy="53" r="0.9" fill="#ffffff" />
          <Circle cx="51" cy="54" r="7.6" fill={url('lens')} stroke="#3b2622" strokeWidth="2.2" />
          <Circle cx="69" cy="54" r="7.6" fill={url('lens')} stroke="#3b2622" strokeWidth="2.2" />
          <Path d="M58.6 53.2 C59.6 52 60.4 52 61.4 53.2" fill="none" stroke="#3b2622" strokeWidth="2" strokeLinecap="round" />
          <Path d="M43.4 53 L39.5 51.5" stroke="#3b2622" strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M76.6 53 L80.5 51.5" stroke="#3b2622" strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M46.5 50 C47.8 48.6 49.6 48 51.4 48.2" fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
          <Path d="M64.5 50 C65.8 48.6 67.6 48 69.4 48.2" fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
          <Path d="M60 58 C59.2 61 58.6 62.6 60.6 63.2" fill="none" stroke="#9c5f3d" strokeWidth="1.5" strokeLinecap="round" />
          <Ellipse cx="45.5" cy="64" rx="4.2" ry="2.5" fill="#f472b6" opacity="0.38" />
          <Ellipse cx="74.5" cy="64" rx="4.2" ry="2.5" fill="#f472b6" opacity="0.38" />
          <Path d="M52.5 67 Q60 74.5 67.5 67 Q60 70.5 52.5 67 Z" fill="#b8475e" />
          <Path d="M55.5 69.4 Q60 71.6 64.5 69.4" fill="none" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
        </G>
        <Circle cx="60" cy="60" r="60" fill={url('gloss')} />
      </G>
    </Svg>
  );
}
