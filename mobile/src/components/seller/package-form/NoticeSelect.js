import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDownIcon, CheckIcon } from '../../../lib/icons';
import { font, t, themed } from '../../../theme';
import { P } from './pkfLib';
import { SheetFrame } from '../../Sheet';

// The app's one sheet look on every phone (the sign-in sheet's: Sheet.js).
const framed = true;

/*
 * The website's own dropdown (web/src/components/ui/Select.jsx + Select.css)
 * as a phone shows it, with the package form's field look (.pkf-input
 * .pkf-select): the field shows the chosen option and a caret; tapping it
 * opens a bottom sheet with large rows (.ui-select-sheet: a grip, no title
 * since the field has no aria-label, the chosen row green with a check).
 *
 * Shown in the app's one sheet look (the sign-in sheet's: Sheet.js SheetFrame)
 * on every phone.
 */

const OPEN_MS = 300;
const CLOSE_MS = 240;
const native = Platform.OS !== 'web';

export default function NoticeSelect({ value, options, onChange }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const placeholder = !selected || selected.value === '';

  const pick = (next) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={[styles.trigger, open && styles.triggerOpen]}
      >
        <Text style={[styles.value, placeholder && styles.valuePlaceholder]} numberOfLines={1}>
          {selected ? selected.label : ''}
        </Text>
        <CaretDownIcon
          size={14}
          weight="bold"
          color={open ? t.primary[600] : t.neutral[500]}
          style={open ? styles.caretOpen : null}
        />
      </Pressable>
      <SheetFrame safeBottom={false} open={open} onClose={() => setOpen(false)} title="How early must buyers order?" scroll={false} padded={false} maxHeight={0.72}>
        <OptionList options={options} value={value} onPick={pick} style={[styles.glassList, { marginBottom: 12 + insets.bottom }]} />
      </SheetFrame>
    </>
  );
}

function SelectSheet({ open, options, value, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [panelH, setPanelH] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }
    if (!mounted) return undefined;
    // Slide away first, then unmount.
    const anim = Animated.timing(progress, {
      toValue: 0, duration: CLOSE_MS, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native,
    });
    anim.start(({ finished }) => { if (finished) { setMounted(false); setPanelH(0); } });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !panelH) return undefined;
    const anim = Animated.timing(progress, {
      toValue: 1, duration: OPEN_MS, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native,
    });
    anim.start();
    return () => anim.stop();
  }, [open, panelH, progress]);

  if (!mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [panelH || screenH, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onLayout={(e) => { if (!panelH) setPanelH(e.nativeEvent.layout.height); }}
          style={[
            styles.panel,
            { maxHeight: screenH * 0.72, paddingBottom: 12 + insets.bottom, transform: [{ translateY }] },
          ]}
        >
          <View style={styles.grip} />
          <OptionList options={options} value={value} onPick={onPick} />
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The options, large rows; the chosen one green with a check (.ui-select-list.is-sheet). */
function OptionList({ options, value, onPick, style }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={[styles.list, style]} contentContainerStyle={styles.listContent} bounces={false} overScrollMode="never">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value || 'none'}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(o.value)}
            style={({ pressed }) => [styles.option, (pressed || on) && (on ? styles.optionOnActive : styles.optionActive)]}
          >
            <Text style={[styles.optionText, on && styles.optionTextOn]}>{o.label}</Text>
            {on ? <CheckIcon size={16} weight="bold" color={t.primary[600]} /> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  // .pkf-input.pkf-select.ui-select (the caret sits inside the 40px right padding's start)
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 46,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 40,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  triggerOpen: { borderColor: P.green },
  value: { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 25.6, color: P.ink, ...font(400) },
  valuePlaceholder: { color: t.neutral[500] },
  caretOpen: { transform: [{ rotate: '180deg' }] },

  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: {
    width: '100%',
    paddingTop: 8,
    paddingHorizontal: 8,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: -10, blurRadius: 40, color: 'rgba(15, 23, 42, 0.16)' }],
  },
  grip: {
    alignSelf: 'center', width: 40, height: 4, marginTop: 2, marginBottom: 10, borderRadius: 999, backgroundColor: t.neutral[300],
  },
  list: { flexGrow: 0 },
  // Inside the glass sheet: the website's side padding, room for the home bar.
  glassList: { paddingHorizontal: 8 },
  listContent: { paddingHorizontal: 4 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  optionActive: { backgroundColor: t.neutral[100] },
  optionOnActive: { backgroundColor: t.primary[50] },
  optionText: { flexShrink: 1, fontSize: 16, lineHeight: 20.8, color: t.neutral[800], ...font(400) },
  optionTextOn: { color: t.primary[700], ...font(600) },
}));
