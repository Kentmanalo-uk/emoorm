import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretDownIcon, CheckIcon, WarningIcon, XIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';

const native = Platform.OS !== 'web';

/* web/src/components/ReportModal.jsx: reasons go to the API as their value. */
const REPORT_REASONS = {
  PRODUCT: [
    { value: 'COUNTERFEIT', label: 'Counterfeit or fake product' },
    { value: 'INAPPROPRIATE_CONTENT', label: 'Prohibited or illegal item' },
    { value: 'MISLEADING', label: 'Misleading description or photos' },
    { value: 'SPAM', label: 'Spam or duplicate listing' },
    { value: 'OTHER', label: 'Something else' },
  ],
  SELLER: [
    { value: 'FRAUD', label: 'Fraud or scam' },
    { value: 'ABUSIVE_BEHAVIOR', label: 'Harassment or abusive behaviour' },
    { value: 'INAPPROPRIATE_CONTENT', label: 'Selling prohibited items' },
    { value: 'MISLEADING', label: 'Item never arrived or was not as described' },
    { value: 'SPAM', label: 'Impersonation or spam' },
    { value: 'OTHER', label: 'Something else' },
  ],
};
const HEADING = { PRODUCT: 'Report Product', SELLER: 'Report Seller' };
const DESTINATION = "This goes to the municipal admin for the shop's municipality.";

/**
 * Report a listing or a shop (web ReportModal, a bottom sheet on phones).
 * Mounted while open; onClose runs after it has slid away.
 */
export default function ReportSheet({ type = 'PRODUCT', productId, storeId, targetName, onClose }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [focus, setFocus] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const reasons = REPORT_REASONS[type] || REPORT_REASONS.PRODUCT;

  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native }).start();
  }, [progress]);

  const close = () => {
    Animated.timing(progress, { toValue: 0, duration: 240, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native })
      .start(() => onClose());
  };

  const submit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    if (!description.trim()) { toast.error('Please describe the issue'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/reports', {
        type,
        productId: productId || undefined,
        storeId: storeId || undefined,
        reason,
        description: description.trim(),
      });
      toast.success('Report submitted. Our team will review it.');
      close();
    } catch (err) {
      toast.error(err.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] });
  const label = reasons.find((r) => r.value === reason)?.label;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={native ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.panel, { maxHeight: screenH * 0.9, transform: [{ translateY }] }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 16 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <WarningIcon size={20} color={t.danger[500]} />
                <Text style={styles.title} accessibilityRole="header">{HEADING[type] || 'Report'}</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={close} accessibilityRole="button" accessibilityLabel="Close">
                <XIcon size={20} color={t.neutral[500]} />
              </Pressable>
            </View>

            {targetName ? (
              <Text style={styles.target}>Reporting: <Text style={styles.targetStrong}>{targetName}</Text></Text>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>Reason for report</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: picking }}
                onPress={() => setPicking((v) => !v)}
                style={[styles.select, picking && styles.focus]}
              >
                <Text style={[styles.selectText, !label && styles.placeholder]} numberOfLines={1}>{label || 'Select a reason…'}</Text>
                <CaretDownIcon size={16} color={t.neutral[500]} />
              </Pressable>
              {picking ? (
                <View style={styles.list}>
                  {reasons.map((r) => (
                    <Pressable
                      key={r.value}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: reason === r.value }}
                      onPress={() => { setReason(r.value); setPicking(false); }}
                      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                    >
                      <Text style={[styles.optionText, reason === r.value && styles.optionOn]}>{r.label}</Text>
                      {reason === r.value ? <CheckIcon size={16} weight="bold" color={t.primary[600]} /> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Additional details</Text>
              <TextInput
                multiline
                numberOfLines={4}
                placeholder="Describe the issue in detail…"
                placeholderTextColor={t.neutral[400]}
                value={description}
                onChangeText={setDescription}
                maxLength={2000}
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
                style={[styles.textarea, focus && styles.focus]}
                textAlignVertical="top"
              />
              <Text style={styles.char}>{description.length}/2000</Text>
            </View>

            <Text style={styles.disclaimer}>
              {DESTINATION} You can follow it in{' '}
              <Text style={styles.disclaimerStrong} onPress={() => { close(); router.push('/reports'); }}>My Reports</Text>
              . False reports may result in account action.
            </Text>

            <View style={styles.actions}>
              <Pressable style={[styles.btn, styles.cancel]} onPress={close} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.submit, submitting && styles.off]} onPress={submit} disabled={submitting} accessibilityRole="button">
                {submitting ? <ActivityIndicator size="small" color="#fff" /> : null}
                <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit Report'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  panel: { borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#fff', overflow: 'hidden' },
  content: { paddingTop: 18, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 1 },
  title: { fontSize: 17, lineHeight: 22, ...font(500), color: t.neutral[900] },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  target: {
    marginBottom: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, overflow: 'hidden',
    backgroundColor: t.neutral[100], fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500],
  },
  targetStrong: { ...font(500) },
  field: { marginBottom: 16, gap: 6 },
  label: { fontSize: 13, lineHeight: 20.8, ...font(500), color: t.neutral[700] },
  select: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8, backgroundColor: '#fff',
  },
  selectText: { flex: 1, fontSize: 16, lineHeight: 22, ...font(400), color: t.neutral[700] },
  placeholder: { color: t.neutral[700] },
  focus: { borderColor: t.danger[500] },
  list: { borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11, paddingHorizontal: 12 },
  optionPressed: { backgroundColor: t.neutral[100] },
  optionText: { flex: 1, fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[700] },
  optionOn: { ...font(500), color: t.primary[700] },
  textarea: {
    minHeight: 112, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    fontSize: 16, ...font(400), color: t.neutral[700], backgroundColor: '#fff', outlineStyle: 'none',
  },
  char: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500], textAlign: 'right' },
  disclaimer: { marginBottom: 20, fontSize: 12, lineHeight: 18, ...font(400), color: t.neutral[500] },
  disclaimerStrong: { ...font(500) },
  actions: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, minHeight: 44, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff' },
  cancelText: { fontSize: 14, lineHeight: 20, ...font(400), color: t.neutral[700] },
  submit: { backgroundColor: t.danger[500] },
  submitText: { fontSize: 14, lineHeight: 20, ...font(500), color: '#fff' },
  off: { opacity: 0.5 },
});
