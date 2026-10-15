import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDownIcon, WarningIcon, XIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';
import { SelectSheet } from '../Select';
import { SheetFrame } from '../Sheet';

// The app's one sheet look on every phone (the sign-in sheet's: Sheet.js).
const framed = true;

/*
 * Report a shop (web/src/components/ReportModal.jsx, type SELLER), as the
 * website's phone bottom sheet. Reasons travel as the API's enum value.
 * On iOS 26 the same form sits in the system's Liquid Glass sheet
 * (NativeSheet); Android and older iPhones keep the website's sheet.
 */
const REASONS = [
  { value: 'FRAUD', label: 'Fraud or scam' },
  { value: 'ABUSIVE_BEHAVIOR', label: 'Harassment or abusive behaviour' },
  { value: 'INAPPROPRIATE_CONTENT', label: 'Selling prohibited items' },
  { value: 'MISLEADING', label: 'Item never arrived or was not as described' },
  { value: 'SPAM', label: 'Impersonation or spam' },
  { value: 'OTHER', label: 'Something else' },
];

const native = Platform.OS !== 'web';

export default function ShopReportSheet({ storeId, targetName, onClose }) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [focused, setFocused] = useState(null);
  const [panelH, setPanelH] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  // iOS 26: whether the system sheet is up (it slides away on its own).
  const [shown, setShown] = useState(true);

  useEffect(() => {
    if (!panelH) return undefined;
    const anim = Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [panelH, progress]);

  // Slides down before the parent removes it.
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (framed) {
      setShown(false);
      setTimeout(onClose, 320);
      return;
    }
    Animated.timing(progress, { toValue: 0, duration: 240, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native })
      .start(() => onClose());
  };

  const submit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    if (!description.trim()) { toast.error('Please describe the issue'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/reports', { type: 'SELLER', storeId: storeId || undefined, reason, description: description.trim() });
      toast.success('Report submitted. Our team will review it.');
      close();
    } catch (err) {
      toast.error(err.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const picked = REASONS.find((r) => r.value === reason);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [panelH || 900, 0] });

  const picker = (
    <SelectSheet
      open={picking}
      title="Reason for report"
      options={REASONS}
      value={reason}
      onPick={(value) => { setReason(value); setPicking(false); }}
      onClose={() => setPicking(false)}
    />
  );

  const form = (
    <>

      {targetName ? (
        <Text style={styles.target}>Reporting: <Text style={styles.targetName}>{targetName}</Text></Text>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.label}>Reason for report</Text>
        <Pressable
          style={[styles.input, styles.select, picking && styles.inputFocus]}
          onPress={() => setPicking(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.inputText, !picked && styles.placeholder]} numberOfLines={1}>{picked ? picked.label : 'Select a reason…'}</Text>
          {/* E-MOORM's own dropdown (ui/Select): its caret flips and turns green while open. */}
          <View style={picking ? styles.caretOpen : null}>
            <CaretDownIcon size={14} weight="bold" color={picking ? t.primary[600] : t.neutral[500]} />
          </View>
        </Pressable>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Additional details</Text>
        <TextInput
          style={[styles.input, styles.textarea, focused === 'desc' && styles.inputFocus]}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          placeholder="Describe the issue in detail…"
          placeholderTextColor={t.neutral[400]}
          value={description}
          onChangeText={setDescription}
          maxLength={2000}
          onFocus={() => setFocused('desc')}
          onBlur={() => setFocused(null)}
        />
        <Text style={styles.char}>{description.length}/2000</Text>
      </View>

      <Text style={styles.disclaimer}>
        This goes to the municipal admin for the shop&apos;s municipality. You can follow it in{' '}
        <Text style={styles.strong}>My Reports</Text>. False reports may result in account action.
      </Text>

      <View style={styles.actions}>
        <Pressable style={[styles.btn, styles.cancel]} onPress={close} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.submit, submitting && styles.disabled]} onPress={submit} disabled={submitting} accessibilityRole="button">
          {submitting ? (
            <View style={styles.busy}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submitText}>Submitting…</Text>
            </View>
          ) : <Text style={styles.submitText}>Submit Report</Text>}
        </Pressable>
      </View>
    </>
  );

  return (
    <SheetFrame safeBottom={false} open={shown} onClose={close} title="Report Seller" dismissible={!submitting} scroll={false} padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} bounces={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.body, { paddingBottom: 16 + insets.bottom }]}>
        {form}
      </ScrollView>
      {picker}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  panel: {
    maxHeight: '90%', backgroundColor: t.neutral[0], borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden',
    boxShadow: [{ offsetX: 0, offsetY: 20, blurRadius: 40, color: 'rgba(0, 0, 0, 0.15)' }],
  },
  body: { paddingTop: 18, paddingHorizontal: 16 },
  glassBody: { paddingTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  title: { fontSize: 17, lineHeight: 19.55, ...font(500), color: t.neutral[900] },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  target: {
    marginBottom: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, overflow: 'hidden',
    backgroundColor: t.neutral[100], color: t.neutral[500], fontSize: 13, lineHeight: 20.8, ...font(400),
  },
  targetName: { ...font(500) },
  field: { marginBottom: 16, gap: 6 },
  label: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[700] },
  input: {
    paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    backgroundColor: t.neutral[0], fontSize: 16, ...font(400), color: t.neutral[700],
  },
  inputFocus: { borderColor: t.danger[500] },
  select: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  inputText: { flex: 1, fontSize: 16, lineHeight: 19.2, ...font(400), color: t.neutral[700] },
  placeholder: { color: t.neutral[500] },
  caretOpen: { transform: [{ rotate: '180deg' }] },
  textarea: { minHeight: 118, lineHeight: 24, outlineStyle: 'none' },
  char: { alignSelf: 'flex-end', fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  disclaimer: { marginBottom: 20, fontSize: 12, lineHeight: 18, ...font(400), color: t.neutral[500] },
  strong: { ...font(500) },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0] },
  cancelText: { fontSize: 14, lineHeight: 16.8, ...font(400), color: t.neutral[700] },
  submit: { backgroundColor: t.danger[500] },
  submitText: { fontSize: 14, lineHeight: 16.8, ...font(500), color: '#fff' },
  disabled: { opacity: 0.5 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
