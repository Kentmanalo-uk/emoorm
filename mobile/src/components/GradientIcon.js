import { Platform, StyleSheet, View } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { GradientFill } from './inbox/InboxGradient';

/*
 * A Phosphor icon painted with a two-colour gradient (top-left to
 * bottom-right): the gradient shows through the icon's shape (a mask), so any
 * icon works. The web build has no masks: there the icon takes the darker colour.
 *
 *   <GradientIcon Icon={HeartIcon} colors={['#f9a8d4', '#db2777']} size={24} />
 */
export default function GradientIcon({ Icon, colors, size = 24, weight = 'fill' }) {
  if (Platform.OS === 'web') return <Icon size={size} weight={weight} color={colors[colors.length - 1]} />;
  return (
    <MaskedView
      style={{ width: size, height: size }}
      maskElement={<View style={styles.mask}><Icon size={size} weight={weight} color="#000" /></View>}
    >
      <GradientFill colors={colors} diagonal />
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'transparent' },
});
