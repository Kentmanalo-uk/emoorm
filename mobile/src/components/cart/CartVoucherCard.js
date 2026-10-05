import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { font, t } from '../../theme';

/*
 * "Have a voucher?" under the phone cart (web Cart.jsx .voucher-card, which
 * stays on phones): the code field over a full-width Apply / Remove button,
 * and the voucher's line once applied.
 */
export default function CartVoucherCard({
  value, onChangeText, applied, loading, canApply, onApply, onRemove, appliedNote, style,
}) {
  return (
    <View style={[styles.card, style]}>
      <Text style={styles.title} accessibilityRole="header">Have a voucher?</Text>
      <View style={styles.group}>
        <TextInput
          value={value}
          onChangeText={(text) => onChangeText(text.toUpperCase())}
          placeholder="Enter voucher code"
          placeholderTextColor="#757575"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!loading && !applied}
          style={[styles.input, (loading || applied) && styles.inputDisabled]}
          returnKeyType="done"
          onSubmitEditing={() => { if (canApply) onApply(); }}
        />
        {applied ? (
          <Pressable accessibilityRole="button" onPress={onRemove} style={styles.btn}>
            <Text style={styles.btnText}>Remove</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canApply }}
            disabled={!canApply}
            onPress={onApply}
            style={[styles.btn, !canApply && styles.btnDisabled]}
          >
            {loading ? (
              <View style={styles.busy}>
                <ActivityIndicator size={14} color="#fff" />
                <Text style={styles.btnText}>Checking…</Text>
              </View>
            ) : <Text style={styles.btnText}>Apply</Text>}
          </Pressable>
        )}
      </View>
      {applied && appliedNote ? <Text style={styles.note}>{appliedNote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginVertical: 12, padding: 12, borderRadius: 10, backgroundColor: t.neutral[0] },
  title: { marginBottom: 10.5, fontSize: 16, lineHeight: 18.4, ...font(500), color: t.accent[800] },
  group: { gap: 7 },
  input: {
    height: 46,
    paddingVertical: 7,
    paddingHorizontal: 10.5,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 0,
    fontSize: 14,
    ...font(400),
    color: '#000',
    backgroundColor: t.neutral[0],
  },
  inputDisabled: { backgroundColor: 'rgba(239, 239, 239, 0.3)', color: t.neutral[500] },
  btn: { minHeight: 31, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: t.primary[600], alignItems: 'center', justifyContent: 'center' },
  // The website leaves a disabled Apply looking the same.
  btnDisabled: {},
  btnText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: '#fff' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { marginTop: 8, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.primary[600] },
});
