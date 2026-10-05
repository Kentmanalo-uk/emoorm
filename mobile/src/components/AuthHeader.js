import { Pressable, StyleSheet, Text, View } from 'react-native';
import { XIcon } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, t } from '../theme';

/**
 * The top of the phone Log in / Sign up / password sheet (web
 * components/AuthSheetBar.jsx, pages/AuthSheet.css .auth-sheet-bar): a grab
 * handle, a round close button and a link to the other form.
 *
 * onClose: the × (and a drag past the threshold, see auth/AuthSheet).
 * onSwitch / switchLabel: the green link at the right ("Sign up", "Log in").
 * switchBold: the password sheets show that link at 700, Log in / Sign up at 500.
 * panHandlers: the sheet's drag-to-close gesture, put on the bar.
 */
export default function AuthHeader({ onClose, onSwitch, switchLabel, switchBold = false, panHandlers }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: 14 + insets.top }]} {...panHandlers}>
      <View style={[styles.grabber, { top: 6 + insets.top }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        hitSlop={4}
        style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
      >
        <XIcon size={20} weight="bold" color={t.neutral[800]} />
      </Pressable>
      {switchLabel ? (
        <Pressable
          accessibilityRole="link"
          onPress={onSwitch}
          style={({ pressed }) => [styles.switch, pressed && styles.switchPressed]}
        >
          <Text style={[styles.switchText, switchBold && styles.switchBold]}>{switchLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: t.neutral[0],
    zIndex: 2,
  },
  grabber: {
    position: 'absolute',
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: t.neutral[200],
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.neutral[100],
  },
  closePressed: { backgroundColor: t.neutral[200] },
  switch: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  switchPressed: { backgroundColor: t.primary[50] },
  switchText: { fontSize: 15, lineHeight: 24, color: t.primary[700], ...font(500) },
  switchBold: { ...font(700) },
});
