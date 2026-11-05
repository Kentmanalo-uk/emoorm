import { useEffect, useRef } from 'react';
import {
  Animated, Easing, StyleSheet, View,
} from 'react-native';
import { font, themed, t } from '../theme';
import { isPageMoving, onPageMotion } from '../lib/pageMotion';

/*
 * Words in a weight wave (the Start selling sticker's, and the signed-out
 * pages' Log in button): each letter goes regular, semibold, extra bold and
 * back, one after another left to right, then they all rest before the next
 * wave. A font's weight cannot be animated, so each letter stacks its three
 * weights and fades the heavier ones in on top (a heavier glyph covers the
 * lighter one under it, so there is no see-through dip). Each cell is as wide
 * as the boldest glyph, pulled together a little, so nothing shifts.
 *
 *   <WeightWaveText text="Log in" style={{ fontSize: 15, lineHeight: 18, color: t.onBrand }} />
 *
 * style:  size, line height and colour (the weight is the wave's)
 * period: one wave and its rest, in ms
 * rest:   a further pause between waves, in ms
 * paused: hold still (regular weight)
 *
 * Between waves nothing runs at all, and no wave starts or carries on
 * while the page under it is being scrolled (lib/pageMotion): a running
 * animation makes Android redraw the whole window every frame, and this
 * sits over Home, where that window is the banners, the shortcuts and
 * every card on screen.
 */
const clamp = { extrapolate: 'clamp' };
// The last letter's wave ends here; past it nothing changes.
const WAVE_END = 0.75;

export default function WeightWaveText({
  text, style, period = 2800, rest = 2000, paused = false,
}) {
  const wave = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (paused) return undefined;
    // Restarted by hand rather than Animated.loop, which the web build
    // does not run natively, and so the rest between waves draws nothing.
    let on = true;
    let running = false;
    let timer = null;
    const later = (ms) => { clearTimeout(timer); timer = setTimeout(run, ms); };
    function run() {
      timer = null;
      // A scroll in progress: the end of it starts the next wave.
      if (!on || isPageMoving()) return;
      running = true;
      wave.setValue(0);
      Animated.timing(wave, {
        toValue: WAVE_END, duration: period * WAVE_END, easing: Easing.linear, useNativeDriver: true,
      }).start(({ finished }) => {
        running = false;
        if (!on) return;
        if (finished) later(period * (1 - WAVE_END) + rest);
        // Stopped by a scroll that has already ended by the time the
        // native side says so: nothing else would start it again.
        else if (!timer && !isPageMoving()) later(600);
      });
    }
    const off = onPageMotion((moving) => {
      if (moving) {
        clearTimeout(timer);
        timer = null;
        if (running) { wave.stopAnimation(); wave.setValue(0); }
      } else if (on && !running && !timer) later(600);
    });
    run();
    return () => { on = false; clearTimeout(timer); off(); wave.stopAnimation(); };
  }, [paused, period, rest, wave]);

  const letters = [...text];
  const last = Math.max(1, letters.length - 1);
  const size = StyleSheet.flatten(style)?.fontSize || 14;
  const pull = { marginRight: -0.6 * (size / 11) };
  return (
    <View style={styles.words} accessible accessibilityLabel={text}>
      {letters.map((raw, i) => {
        const ch = raw === ' ' ? ' ' : raw;
        const at = 0.1 + (0.55 * i) / last; // the wave runs through ~65% of the cycle; the rest is still
        const semi = wave.interpolate({ inputRange: [at - 0.1, at - 0.05, at + 0.05, at + 0.1], outputRange: [0, 1, 1, 0], ...clamp });
        const bold = wave.interpolate({ inputRange: [at - 0.05, at, at + 0.05], outputRange: [0, 1, 0], ...clamp });
        return (
          // eslint-disable-next-line react/no-array-index-key
          <View key={i} style={i < letters.length - 1 ? pull : null} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Animated.Text style={[style, styles.bold, styles.sizer]}>{ch}</Animated.Text>
            <Animated.Text style={[style, styles.layer, styles.regular]}>{ch}</Animated.Text>
            <Animated.Text style={[style, styles.layer, styles.semi, { opacity: semi }]}>{ch}</Animated.Text>
            <Animated.Text style={[style, styles.layer, styles.bold, { opacity: bold }]}>{ch}</Animated.Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  words: { flexDirection: 'row' },
  sizer: { opacity: 0 },
  layer: { position: 'absolute', left: 0, right: 0, top: 0, textAlign: 'center' },
  regular: { ...font(400) },
  semi: { ...font(600) },
  bold: { ...font(800) },
}));
