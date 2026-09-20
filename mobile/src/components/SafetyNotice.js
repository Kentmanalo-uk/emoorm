import { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import { CaretDownIcon as CaretDown, ShieldWarningIcon as ShieldWarning } from 'phosphor-react-native';
import { SAFETY_SUMMARY, SAFETY_TIPS } from '../lib/safetyNotice';
import { fontFamily, radius, spacing } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Safety & scam prevention strip for a conversation thread.
 *
 * Render it above the composer rather than inside the message list, so it stays
 * on screen for the whole conversation instead of scrolling away. It is
 * deliberately not dismissable — it matters most to whoever stopped reading it.
 * Matches web/src/components/common/SafetyNotice.jsx.
 */
export default function SafetyNotice() {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={styles.wrap} accessibilityRole="summary" accessibilityLabel="Safety and scam prevention">
      <Pressable
        style={styles.row}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? 'Hides the safety tips' : 'Shows the full list of safety tips'}
        hitSlop={4}
      >
        <ShieldWarning size={15} weight="fill" color={ICON_COLOR} />
        <Text style={styles.summary} numberOfLines={1}>{SAFETY_SUMMARY}</Text>
        <Text style={styles.toggleLabel}>Safety tips</Text>
        <CaretDown size={11} weight="bold" color={LINK_COLOR} style={open ? styles.caretOpen : null} />
      </Pressable>

      {open ? (
        <View style={styles.tips}>
          {SAFETY_TIPS.map((tip) => (
            <View key={tip} style={styles.tipRow}>
              <Text style={styles.bullet}>{'•'}</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// Amber, muted enough to live in the thread permanently without competing with
// the conversation. Kept in step with web's SafetyNotice.css.
const ICON_COLOR = '#d4880f';
const LINK_COLOR = '#a06a10';
const TEXT_COLOR = '#8a5a12';

const styles = StyleSheet.create({
  // Inset inside the composer's padding, so it reads as a card rather than a
  // full-bleed band. The composer's own gap handles the spacing below it.
  wrap: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f6e3bf',
    borderRadius: radius.lg,
    backgroundColor: '#fffbf2',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: spacing.md,
  },
  // Truncates instead of wrapping, so the strip stays one line tall and the
  // composer never shifts underneath it.
  summary: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamily.regular,
    color: TEXT_COLOR,
  },
  toggleLabel: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    color: LINK_COLOR,
  },
  caretOpen: {
    transform: [{ rotate: '180deg' }],
  },
  tips: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  tipRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  bullet: {
    fontSize: 12,
    lineHeight: 17,
    color: TEXT_COLOR,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fontFamily.regular,
    color: TEXT_COLOR,
  },
});
