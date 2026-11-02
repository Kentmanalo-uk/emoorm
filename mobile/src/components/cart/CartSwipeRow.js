import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { font, t, themed } from '../../theme';

/**
 * A cart line that slides left to show what can be done with it: Find
 * similar and Remove. One row is open at a time, tapping the row shuts it,
 * and a screen reader gets the same two as actions, since it cannot swipe.
 *
 * Built on PanResponder: a sideways drag is one the list's vertical scroll
 * has no claim on, so nothing has to be linked into the app for it.
 */

const ACTION_WIDTH = 76;
const OPEN = ACTION_WIDTH * 2;
const OPEN_PAST = 56;
const RUBBER = 0.25;

// The row that is open now, so opening another can shut it.
let shutOpenRow = null;

export default function CartSwipeRow({ children, onSimilar, onRemove }) {
  const { width } = useWindowDimensions();
  const x = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);
  const [open, setOpen] = useState(false);

  const settle = (to) => {
    offset.current = to;
    Animated.spring(x, {
      toValue: to, friction: 9, tension: 90, useNativeDriver: true,
    }).start();
  };
  // One function for the life of the row, so "is this the open one" holds.
  const shutRef = useRef(null);
  const stable = useRef(() => shutRef.current());
  shutRef.current = () => {
    settle(0);
    setOpen(false);
    if (shutOpenRow === stable.current) shutOpenRow = null;
  };

  const openUp = () => {
    if (shutOpenRow && shutOpenRow !== stable.current) shutOpenRow();
    shutOpenRow = stable.current;
    settle(-OPEN);
    setOpen(true);
    Haptics.selectionAsync().catch(() => {});
  };
  const openRef = useRef(openUp);
  openRef.current = openUp;

  useEffect(() => () => { if (shutOpenRow === stable.current) shutOpenRow = null; }, []);

  // Sideways and meant: a tap that wobbles still reaches the stepper.
  const sideways = (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5
    && (g.dx < 0 || offset.current < 0);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: sideways,
    onMoveShouldSetPanResponderCapture: sideways,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      const next = offset.current + g.dx;
      // Past the buttons it drags heavily, and never right of closed.
      x.setValue(next < -OPEN ? -OPEN + (next + OPEN) * RUBBER : Math.min(0, next));
    },
    onPanResponderRelease: (_, g) => {
      const next = offset.current + g.dx;
      if (next < -OPEN_PAST || g.vx < -0.4) openRef.current();
      else shutRef.current();
    },
    onPanResponderTerminate: () => shutRef.current(),
  })).current;

  const similar = () => {
    shutRef.current();
    onSimilar();
  };
  // Off to the left first, so the line leaves rather than blinks out.
  const remove = () => {
    if (shutOpenRow === stable.current) shutOpenRow = null;
    Animated.timing(x, {
      toValue: -width, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start(() => onRemove());
  };

  return (
    <View
      style={styles.row}
      accessibilityActions={[{ name: 'similar', label: 'Find similar' }, { name: 'remove', label: 'Remove' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'similar') onSimilar();
        if (e.nativeEvent.actionName === 'remove') onRemove();
      }}
    >
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={similar} style={({ pressed }) => [styles.action, styles.similar, pressed && styles.pressed]}>
          <Text style={styles.actionText}>Find similar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={remove} style={({ pressed }) => [styles.action, styles.remove, pressed && styles.pressed]}>
          <Text style={styles.actionText}>Remove</Text>
        </Pressable>
      </View>
      <Animated.View {...pan.panHandlers} style={[styles.front, { transform: [{ translateX: x }] }]}>
        {children}
        {open ? (
          <Pressable style={StyleSheet.absoluteFill} onPress={() => shutRef.current()} accessibilityLabel="Close" accessibilityRole="button" />
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { overflow: 'hidden', backgroundColor: t.neutral[0] },
  front: { backgroundColor: t.neutral[0] },
  actions: { ...StyleSheet.absoluteFill, flexDirection: 'row', justifyContent: 'flex-end' },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  // White on them, so the same in both themes.
  similar: { backgroundColor: '#E57373' },
  remove: { backgroundColor: '#DC2626' },
  pressed: { opacity: 0.8 },
  actionText: { fontSize: 13.5, lineHeight: 18, ...font(500), color: '#FFFFFF', textAlign: 'center' },
}));
