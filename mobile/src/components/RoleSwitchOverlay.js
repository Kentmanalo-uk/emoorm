import { useEffect, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, spacing } from '../theme';

// Dimmed backdrop with a heartbeat-pulsing icon + label, shown briefly while
// switching between the buyer and seller account views.
export default function RoleSwitchOverlay({ visible, label, Icon }) {
  const beat = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return undefined;
    let active = true;
    const pulse = () => {
      if (!active) return;
      beat.setValue(1);
      Animated.sequence([
        Animated.timing(beat, { toValue: 1.5, duration: 350, useNativeDriver: true }),
        Animated.timing(beat, { toValue: 1, duration: 350, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished && active) pulse();
      });
    };
    pulse();
    return () => { active = false; beat.stopAnimation(); };
  }, [visible, beat]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.row}>
          <Animated.View style={[styles.iconWrap, { transform: [{ scale: beat }] }]}>
            {Icon ? <Icon size={30} strokeWidth={1.8} color={colors.white} /> : null}
          </Animated.View>
          <Text style={styles.label}>{label}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  label: { marginLeft: spacing.md, color: colors.white, fontFamily: fontFamily.semiBold, fontSize: 15 },
});
