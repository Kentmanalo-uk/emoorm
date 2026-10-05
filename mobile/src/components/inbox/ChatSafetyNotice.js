import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretDownIcon, ShieldWarningIcon } from 'phosphor-react-native';
import { SAFETY_SUMMARY, SAFETY_TIPS } from '../../lib/safetyNotice';
import { font, t } from '../../theme';

/**
 * The safety strip between a chat's messages and its composer
 * (web/src/components/common/SafetyNotice.jsx + .css): a quiet amber band,
 * one line, with "Safety tips" opening the list. Not dismissable.
 */
export default function ChatSafetyNotice() {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap} accessibilityLabel="Safety and scam prevention">
      <View style={styles.row}>
        <ShieldWarningIcon size={15} weight="fill" color={t.warning[600]} />
        <Text style={styles.summary} numberOfLines={1}>{SAFETY_SUMMARY}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
        >
          <Text style={styles.toggleText}>Safety tips</Text>
          <CaretDownIcon size={11} weight="bold" color={t.warning[700]} style={open ? styles.caretOpen : null} />
        </Pressable>
      </View>
      {open ? (
        <View style={styles.tips}>
          {SAFETY_TIPS.map((tip) => (
            <View key={tip} style={styles.tip}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const text = { fontSize: 12, lineHeight: 17.4, color: t.warning[800], ...font(400) };

const styles = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: t.warning[100], backgroundColor: t.warning[50] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingHorizontal: 14 },
  summary: { ...text, flex: 1, minWidth: 0 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2, paddingHorizontal: 6, borderRadius: 5 },
  togglePressed: { backgroundColor: 'rgba(212, 136, 15, 0.12)' },
  toggleText: { ...text, color: t.warning[700], ...font(500) },
  caretOpen: { transform: [{ rotate: '180deg' }] },
  tips: { paddingRight: 14, paddingBottom: 9, paddingLeft: 18, gap: 3 },
  tip: { flexDirection: 'row' },
  bullet: { ...text, width: 14, textAlign: 'center' },
  tipText: { ...text, flex: 1 },
});
