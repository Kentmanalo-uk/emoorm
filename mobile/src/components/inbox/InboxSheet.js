import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../theme';

const native = Platform.OS !== 'web';

/**
 * A bottom sheet for the chat screen (web .msgr-sheet / .report-modal on
 * phones): slides up over a dimmed backdrop (msgr-sheet-up, 260ms), closes
 * on the backdrop and Android's back button. The caller draws the head and
 * body; `style` sets the panel's padding and corners.
 *
 * children may be a function (safeBottom) => node, to pad the end.
 */
export default function InboxSheet({ open, onClose, children, style, maxHeight = 0.8, label }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      progress.setValue(0);
      const anim = Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native });
      anim.start();
      return () => anim.stop();
    }
    if (!mounted) return undefined;
    const anim = Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native });
    anim.start(({ finished }) => { if (finished) setMounted(false); });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={native ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel={label}
          style={[styles.panel, { maxHeight: height * maxHeight, transform: [{ translateY }] }, style]}
        >
          {typeof children === 'function' ? children(insets.bottom) : children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: { width: '100%', backgroundColor: t.neutral[0], borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
});
