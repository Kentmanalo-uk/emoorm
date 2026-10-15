import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, t } from '../../theme';
import Glass from '../Glass';

/*
 * Phones: a bar pinned to the bottom of a Seller Center page (web
 * components/seller/PhoneSaveBar.jsx + .css, .scm-savebar): Cancel and Save
 * changes by default, or any buttons as children. It floats over the page
 * (position absolute, bottom 0): give the scrolling content
 * `paddingBottom: savebarSpace(insets)` so its last field scrolls clear.
 *
 * iOS 26: Liquid Glass. Android and older iPhones: the website's look
 * (white at 97%, a hairline and a soft shadow above).
 *
 * <PhoneSaveBar onCancel onSave saving canSave saveLabel="Save changes" />
 * <PhoneSaveBar><PhoneSaveButton label="Back" onPress… /><PhoneSaveButton primary label="Next" … /></PhoneSaveBar>
 */

/** Room the bar takes at the bottom of the screen: 10 + 48 + 10 + the home bar. */
export const savebarSpace = (insets) => 68 + (insets?.bottom || 0);

export const SAVEBAR_FALLBACK = {
  backgroundColor: 'rgba(255, 255, 255, 0.97)',
  borderTopWidth: 1,
  borderTopColor: t.neutral[100],
  boxShadow: [{ offsetX: 0, offsetY: -6, blurRadius: 18, color: 'rgba(15, 23, 42, 0.06)' }],
};

/** One pill button of the bar: primary = the green Save (grows 1.6×), else the white Cancel. */
export function PhoneSaveButton({ label, primary = false, onPress, disabled = false, busy = false, busyLabel, grow, style, children }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { flexGrow: grow ?? (primary ? 1.6 : 1) },
        primary ? styles.save : styles.cancel,
        primary && (disabled && !busy) && styles.saveOff,
        pressed && styles.pressed,
        style,
      ]}
    >
      {busy ? <ActivityIndicator size={14} color={primary ? '#fff' : t.neutral[600]} style={styles.spin} /> : null}
      {children || (
        <Text style={[styles.text, primary ? styles.saveText : styles.cancelText, primary && disabled && !busy && styles.saveTextOff]} numberOfLines={1}>
          {busy ? (busyLabel || label) : label}
        </Text>
      )}
    </Pressable>
  );
}

export default function PhoneSaveBar({
  onCancel, onSave, saving = false, canSave = true, saveLabel = 'Save changes', cancelLabel = 'Cancel', children, style,
}) {
  const insets = useSafeAreaInsets();
  return (
    <Glass
      fallbackStyle={SAVEBAR_FALLBACK}
      style={[styles.bar, { paddingBottom: 10 + insets.bottom }, style]}
      accessibilityLabel="Save or cancel"
    >
      <View style={styles.row}>
        {children || (
          <>
            <PhoneSaveButton label={cancelLabel} onPress={onCancel} disabled={saving} />
            <PhoneSaveButton primary label={saveLabel} busyLabel="Saving…" busy={saving} disabled={!canSave} onPress={onSave} />
          </>
        )}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 60, paddingTop: 10, paddingHorizontal: 16 },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flexBasis: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    minHeight: 48, paddingHorizontal: 12, borderRadius: 999,
  },
  cancel: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0] },
  save: { backgroundColor: t.primary[600] },
  saveOff: { backgroundColor: t.neutral[200] },
  pressed: { opacity: 0.85 },
  spin: { marginRight: 6 },
  text: { fontSize: 15, lineHeight: 20, ...font(500) },
  cancelText: { color: t.neutral[700] },
  saveText: { color: '#fff' },
  saveTextOff: { color: t.neutral[500] },
});
