import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CaretDownIcon } from 'phosphor-react-native';
import { font, t } from '../../../theme';
import { SelectSheet } from '../../Select';

/*
 * E-MOORM's own dropdown (web/src/components/ui/Select.jsx) as a Seller
 * Center form field draws it: the page's own field look (.scm-field
 * .ui-select, .seller-action-form .ui-select) with the chosen option and the
 * caret, the options in the bottom sheet. Like the website, the sheet only
 * has a title when the field gives one (aria-label / placeholder).
 *
 * <FieldSelect value options={[{ value, label }]} onChange={(v) => …} style title />
 */
export default function FieldSelect({
  value, options = [], onChange, title, style, textStyle, disabled = false, accessibilityLabel,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value ?? ''));
  const placeholder = !selected || selected.value === '';

  const pick = (next) => {
    setOpen(false);
    if (String(next) !== String(value ?? '')) onChange?.(next);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || title}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.trigger, disabled && styles.disabled, style]}
      >
        <Text style={[styles.value, placeholder && styles.placeholder, textStyle]} numberOfLines={1}>
          {selected ? selected.label : ''}
        </Text>
        <View style={open ? styles.caretOpen : null}>
          <CaretDownIcon size={14} weight="bold" color={open ? t.primary[600] : t.neutral[500]} />
        </View>
      </Pressable>
      <SelectSheet open={open} title={title} options={options} value={value} onPick={pick} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  // .scm-field .ui-select (the sheets' fields); pages pass their own look.
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  disabled: { opacity: 0.55 },
  value: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20.8, ...font(400), color: t.neutral[900] },
  placeholder: { color: t.neutral[500] },
  caretOpen: { transform: [{ rotate: '180deg' }] },
});
