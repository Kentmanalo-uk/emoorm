import { StyleSheet, View } from 'react-native';
import { isActiveNow } from '../lib/activeStatus';
import { t, themed } from '../theme';

/**
 * The green "active now" dot (web/src/components/ui/ActiveDot.jsx), with a
 * ring in the card colour so it stands off any logo or photo. Nothing when
 * the shop's seller or the buyer is not active.
 *
 * Place it inside a View with position: 'relative' that does not clip (a
 * round avatar usually clips, so wrap the avatar and put the dot beside it).
 *
 * who: a store, or a chat's buyer, from the API ({ active, activeAt }).
 * size: the diameter, ring included. inset: in from the bottom right corner
 * (on a big round logo the corner is well outside the circle).
 */
export default function ActiveDot({ who, size = 12, inset = 0 }) {
  if (!isActiveNow(who)) return null;
  const ring = Math.max(2, Math.round(size / 6));
  return (
    <View
      style={[styles.dot, {
        width: size, height: size, borderRadius: size / 2, borderWidth: ring, right: inset, bottom: inset,
      }]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Active now"
      pointerEvents="none"
    />
  );
}

const styles = themed(() => StyleSheet.create({
  dot: {
    position: 'absolute',
    zIndex: 3,
    elevation: 3,
    backgroundColor: t.success[500],
    borderColor: t.neutral[0],
  },
}));
