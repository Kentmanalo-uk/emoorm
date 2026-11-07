import { Pressable, StyleSheet, Text, View } from 'react-native';
import { XIcon } from '../lib/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, t, themed } from '../theme';
import { LIGHT } from '../theme/palettes';
import { liquidGlass } from './Glass';

/**
 * The top of the phone Log in / Sign up / password sheet (web
 * components/AuthSheetBar.jsx, pages/AuthSheet.css .auth-sheet-bar): a grab
 * handle, a round close button and a link to the other form.
 *
 * onClose: the × (and a drag past the threshold, see auth/AuthSheet).
 * onSwitch / switchLabel: the green link at the right ("Sign up", "Log in").
 * switchBold: the password sheets show that link at 700, Log in / Sign up at 500.
 * panHandlers: the sheet's drag-to-close gesture, put on the bar.
 * onBand: the Log in / Sign up first step, over its pink-to-mint band
 *   (AuthSheet.css .auth-choose): the bar clear, × on the right, the other
 *   door at the left as a white pill. The band is light in either mode, so
 *   these keep the light palette's colours.
 */
export default function AuthHeader({
  onClose, onSwitch, switchLabel, switchBold = false, panHandlers, onBand = false,
}) {
  const insets = useSafeAreaInsets();
  // iOS 26: the system's page sheet already sits below the status bar.
  const top = liquidGlass ? 0 : insets.top;
  return (
    <View style={[styles.bar, onBand && styles.barBand, { paddingTop: 14 + top }]} {...panHandlers}>
      <View style={[styles.grabber, onBand && styles.grabberBand, { top: 6 + top }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        hitSlop={4}
        style={({ pressed }) => [styles.close, onBand && styles.closeBand, pressed && (onBand ? styles.closeBandPressed : styles.closePressed)]}
      >
        <XIcon size={20} weight="bold" color={onBand ? LIGHT.neutral[800] : t.neutral[800]} />
      </Pressable>
      {switchLabel ? (
        <Pressable
          accessibilityRole="link"
          onPress={onSwitch}
          style={({ pressed }) => [styles.switch, onBand && styles.switchBand, pressed && (onBand ? styles.switchBandPressed : styles.switchPressed)]}
        >
          <Text style={[styles.switchText, switchBold && styles.switchBold, onBand && styles.switchTextBand]}>{switchLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
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

  // Over the band.
  barBand: { flexDirection: 'row-reverse', backgroundColor: 'transparent' },
  grabberBand: { backgroundColor: 'rgba(255, 255, 255, 0.85)' },
  closeBand: { backgroundColor: 'rgba(255, 255, 255, 0.7)' },
  closeBandPressed: { backgroundColor: 'rgba(255, 255, 255, 0.9)' },
  switchBand: { paddingVertical: 7, paddingHorizontal: 14, backgroundColor: 'rgba(255, 255, 255, 0.7)' },
  switchBandPressed: { backgroundColor: LIGHT.primary[50] },
  switchTextBand: { fontSize: 14, lineHeight: 22.4, color: LIGHT.primary[700] },
}));
