import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDownIcon, CheckIcon } from '../lib/icons';
import { font, t, themed } from '../theme';
import { SheetFrame } from './Sheet';

/*
 * E-MOORM's own dropdown (web/src/components/ui/Select.jsx/.css, phones).
 *
 * The trigger is a grey field with the chosen option and a caret that turns
 * green and flips while open; the options open in a bottom sheet with a
 * grip, the field's name as its title and large rows (the chosen one green,
 * with a check). Like the website's ui-sheet it slides up in 300ms and down
 * in 240ms over a dimmed backdrop, and closes on the backdrop or Android's
 * back button. The sheet is the app's one sheet look on every phone.
 *
 * <Select value options={[{ value, label, disabled }]} onChange={(value) => …}
 *   title="Sort products" placeholder="Select…" style={…} textStyle={…} />
 *
 * `label` (optional) draws a field label above the trigger, and `error` a
 * line under it, for forms. Screens that draw their own trigger use
 * SelectSheet alone.
 */

const OPEN_MS = 300;
const CLOSE_MS = 240;
const native = Platform.OS !== 'web';

/** The options, one row each (.ui-select-option). */
function OptionRows({ options, value, onPick }) {
  const current = value === undefined || value === null ? '' : String(value);
  return options.filter((o) => !o.hidden).map((o) => {
    const on = String(o.value) === current;
    return (
      <Pressable
        key={String(o.value)}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: Boolean(o.disabled) }}
        disabled={o.disabled}
        onPress={() => onPick?.(o.value)}
        style={({ pressed }) => [styles.option, pressed && (on ? styles.optionOnPressed : styles.optionPressed)]}
      >
        <Text style={[styles.optionText, on && styles.optionOn, o.disabled && styles.optionDisabled]}>{o.label}</Text>
        {on ? <CheckIcon size={16} weight="bold" color={t.primary[600]} /> : null}
      </Pressable>
    );
  });
}

/**
 * The options sheet alone: <SelectSheet open title options value onPick onClose />.
 * In the app's one sheet look (the Log in / Sign up sheet's: Sheet.js
 * SheetFrame), on every phone.
 */
export function SelectSheet({
  open, title, options = [], value, onPick, onClose,
}) {
  return (
    <SheetFrame open={open} onClose={onClose} title={title} maxHeight={0.72} padded={false} bodyStyle={styles.listContent}>
      <OptionRows options={options} value={value} onPick={onPick} />
    </SheetFrame>
  );
}

export default function Select({
  label, value, options = [], onChange, placeholder = 'Select…', error, title, disabled = false,
  style, textStyle, caretSize = 14, caretColor, containerStyle, accessibilityLabel,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => String(o.value) === String(value ?? ''));
  const isPlaceholder = !selected || selected.value === '';
  const name = title || label || accessibilityLabel || placeholder;

  const pick = (next) => {
    setOpen(false);
    if (String(next) !== String(value ?? '')) onChange?.(next);
  };

  return (
    <View style={[label ? styles.field : null, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || label || title}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[styles.trigger, error && styles.triggerError, disabled && styles.triggerDisabled, style]}
      >
        <Text style={[styles.value, isPlaceholder && styles.placeholder, textStyle]} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <View style={open ? styles.caretOpen : null}>
          <CaretDownIcon size={caretSize} weight="bold" color={open ? t.primary[600] : (caretColor || t.neutral[500])} />
        </View>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SelectSheet open={open} title={name} options={options} value={value} onPick={pick} onClose={() => setOpen(false)} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  field: { marginBottom: 16 },
  label: { marginBottom: 8, fontSize: 14, lineHeight: 20, ...font(500), color: t.neutral[800] },
  error: { marginTop: 4, fontSize: 12, lineHeight: 16, ...font(400), color: t.danger[600] },

  // :where(.ui-select), with the phones' touch size (responsive.css: 46px, 16px).
  trigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    minHeight: 46, paddingHorizontal: 12, borderRadius: 10, backgroundColor: t.neutral[100],
  },
  triggerError: { borderWidth: 1, borderColor: t.danger[500], backgroundColor: t.neutral[0] },
  triggerDisabled: { opacity: 0.55 },
  value: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 20.8, ...font(400), color: t.neutral[800] },
  placeholder: { color: t.neutral[500] },
  caretOpen: { transform: [{ rotate: '180deg' }] },

  // .ui-select-sheet
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    width: '100%', paddingTop: 8, paddingHorizontal: 8,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: -10, blurRadius: 40, color: 'rgba(15, 23, 42, 0.16)' }],
  },
  grip: { alignSelf: 'center', width: 40, height: 4, marginTop: 2, marginBottom: 10, borderRadius: 999, backgroundColor: t.neutral[300] },
  sheetTitle: { marginHorizontal: 12, marginBottom: 8, fontSize: 16, lineHeight: 22, ...font(600), color: t.neutral[900] },
  list: { flexGrow: 0, flexShrink: 1 },
  listContent: { paddingHorizontal: 4 },
  glassTitle: { marginHorizontal: 20, marginTop: 4 },
  glassList: { paddingHorizontal: 12 },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    minHeight: 50, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12,
  },
  optionPressed: { backgroundColor: t.neutral[100] },
  optionOnPressed: { backgroundColor: t.primary[50] },
  optionText: { flexShrink: 1, fontSize: 16, lineHeight: 20.8, ...font(400), color: t.neutral[800] },
  optionOn: { ...font(600), color: t.primary[700] },
  optionDisabled: { color: t.neutral[400] },
}));
