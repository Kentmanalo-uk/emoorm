import { useState } from 'react';
import { View, Text, Pressable, Modal, FlatList, StyleSheet } from 'react-native';
import { ChevronDown, Check, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, control, fontFamily, radius, spacing, typography } from '../theme';

// Lightweight modal-based picker — RN has no native <select>, and this avoids
// pulling in @react-native-picker/picker just for one field.
export default function Select({ label, value, options, onChange, placeholder = 'Select…', error }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        style={[styles.input, error && styles.inputError]}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.value, !selected && styles.placeholder]}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label || 'Select an option'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              style={styles.list}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.option}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item.label}</Text>
                  {item.value === value ? <Check size={18} color={colors.primary} /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { ...typography.caption, color: colors.textPrimary, fontFamily: fontFamily.medium, fontWeight: '500', marginBottom: spacing.sm },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.gray100,
    minHeight: control.height,
  },
  inputError: { borderWidth: 1, borderColor: colors.error, backgroundColor: colors.white },
  value: { ...typography.body, color: colors.textPrimary },
  placeholder: { color: colors.textMuted },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.28)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius.lg * 2,
    borderTopRightRadius: radius.lg * 2,
    maxHeight: '70%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  sheetTitle: { ...typography.h3, color: colors.textPrimary },
  list: { paddingHorizontal: spacing.lg },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: control.height,
    paddingVertical: spacing.md,
  },
  optionText: { ...typography.body, color: colors.textPrimary },
});
