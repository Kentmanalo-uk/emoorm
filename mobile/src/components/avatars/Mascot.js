import { View } from 'react-native';
import MascotRig, { RIG_GROUND } from './MascotRig';
import { useLoop, useReducedMotion } from '../sell/motion';

/*
 * E-MOORM's mascot (graphics/mascot.jpg) sitting on an edge, waving: the
 * Sell page's, on the edge of its button (web/src/components/avatars/
 * Mascot.jsx). Drawn by MascotRig.
 *
 *   <Mascot size={72} />
 *
 * Drawn to sit on an edge: the line at y 104 of its 120 x 150 box is where
 * it sits, and its legs hang below it. `running` false holds it still (the
 * page out of view); so does reduced motion. `name` is kept for the callers
 * that pass it; there is one mascot.
 */

// A friendly wave: the arm swings, the forearm follows a beat behind.
const POSE = {
  base: 'sit',
  head: [[0, -3], [0.5, 3], [1, -3]],
  armR: {
    keys: [[0, 30], [0.5, 58], [1, 30]],
    bend: [[0, -22], [0.5, 10], [1, -22]],
  },
  face: { eyes: 'open', mouth: 'smile' },
};
// Its seat, where the old drawing's was.
const SEAT = 104;

export default function Mascot({ size = 64, running = true, style }) {
  const still = useReducedMotion();
  const clock = useLoop(1800, { running, still });
  const k = size / 120;
  return (
    <View style={[{ width: size, height: size * 1.25 }, style]} pointerEvents="none">
      <MascotRig
        size={size}
        clock={clock}
        pose={POSE}
        running={running}
        style={{ marginTop: (SEAT - RIG_GROUND.sit) * k }}
      />
    </View>
  );
}
