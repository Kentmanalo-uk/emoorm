import { StyleSheet, View } from 'react-native';
import { themed } from '../../theme';
import MoormyFace from './MoormyFace';

/**
 * Moormy's picture (web MoormyAvatar.jsx): the mascot's face, round.
 *
 * It used to take a `glow` and draw a breathing pink-to-green halo behind
 * her, 12pt out, 0.2 → 0.45 over 3.2s. Two places asked for it -- the top
 * of her thread and the card that opens her -- and in both it put a
 * pulsing light around a face that is already the brightest thing on a
 * white page. The face is drawn flat now (MoormyFace.js); a soft gradient
 * bloom behind flat art reads as a mistake rather than as a glow.
 */
export default function MoormyAvatar({ size = 40, style }) {
  return (
    <View
      style={[{ width: size, height: size }, styles.box, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <MoormyFace size={size} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  box: { borderRadius: 999, flexShrink: 0 },
}));
