import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CaretDownIcon, CheckIcon, WarningIcon, XIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';
import InboxSheet from './InboxSheet';

/*
 * "Report shop" / "Report buyer" from a chat's ⋯ menu
 * (web/src/components/ReportModal.jsx, a bottom sheet on phones). Reasons
 * travel as the API's enum value; the label is only shown.
 */
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
  BUYER: [
    { value: 'NON_PAYMENT', label: 'Did not pay for the order' },
    { value: 'FAKE_ORDER', label: 'Fake or repeated bogus orders' },
    { value: 'ABUSIVE_BEHAVIOR', label: 'Harassment or abusive behaviour' },
    { value: 'FRAUD', label: 'Fraud or chargeback abuse' },
    { value: 'SPAM', label: 'Spam messages' },
    { value: 'OTHER', label: 'Something else' },
  ],
};
const HEADING = { PRODUCT: 'Report Product', SELLER: 'Report Seller', BUYER: 'Report Buyer' };
const DESTINATION = {
  PRODUCT: "This goes to the municipal admin for the shop's municipality.",
  SELLER: "This goes to the municipal admin for the shop's municipality.",
  BUYER: "This goes to the municipal admin for the buyer's municipality.",
};

export default function ChatReportSheet({
  open, type, productId, storeId, reportedBuyerId, targetName, onClose,
}) {
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const reasons = REPORT_REASONS[type] || REPORT_REASONS.PRODUCT;

  useEffect(() => {
    if (open) { setReason(''); setDescription(''); setPicking(false); }
  }, [open]);

  const submit = async () => {
    if (!reason) { toast.error('Please select a reason'); return; }
    if (!description.trim()) { toast.error('Please describe the issue'); return; }
    setSubmitting(true);
    try {
      await apiClient.post('/reports', {
        type,
        productId: productId || undefined,
        storeId: storeId || undefined,
        reportedBuyerId: reportedBuyerId || undefined,
        reason,
        description: description.trim(),
      });
      toast.success('Report submitted. Our team will review it.');
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const chosen = reasons.find((r) => r.value === reason);

  return (
    <InboxSheet open={open} onClose={onClose} maxHeight={0.9} label={HEADING[type] || 'Report'} style={styles.sheet}>
      {(bottom) => (
        <ScrollView contentContainerStyle={[styles.inner, { paddingBottom: 16 + bottom }]} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <View style={styles.titleRow}>
              <WarningIcon size={20} color={t.danger[500]} />
              <Text style={styles.title} accessibilityRole="header">{HEADING[type] || 'Report'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close}>
              <XIcon size={20} color={t.neutral[500]} />
            </Pressable>
          </View>

          {targetName ? (
            <Text style={styles.target}>Reporting: <Text style={styles.targetName}>{targetName}</Text></Text>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Reason for report</Text>
            <Pressable accessibilityRole="button" onPress={() => setPicking((v) => !v)} style={[styles.select, picking && styles.focus]}>
              <Text style={[styles.selectText, !chosen && styles.selectPlaceholder]} numberOfLines={1}>{chosen ? chosen.label : 'Select a reason…'}</Text>
              <CaretDownIcon size={14} color={t.neutral[500]} />
            </Pressable>
            {picking ? (
              <View style={styles.options}>
                {reasons.map((r) => (
                  <Pressable key={r.value} accessibilityRole="button" onPress={() => { setReason(r.value); setPicking(false); }} style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}>
                    <Text style={[styles.optionText, r.value === reason && styles.optionOn]}>{r.label}</Text>
                    {r.value === reason ? <CheckIcon size={16} weight="bold" color={t.primary[700]} /> : null}
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
              textAlignVertical="top"
              style={styles.textarea}
            />
            <Text style={styles.char}>{description.length}/2000</Text>
          </View>

          <Text style={styles.disclaimer}>
            {DESTINATION[type] || DESTINATION.PRODUCT} You can follow it in{' '}
            <Text style={styles.strong}>My Reports</Text>. False reports may result in account action.
          </Text>

          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={submit} disabled={submitting} style={[styles.submit, submitting && styles.disabled]}>
              <Text style={styles.submitText}>{submitting ? 'Submitting…' : 'Submit Report'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </InboxSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  inner: { paddingTop: 18, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  title: { fontSize: 17, lineHeight: 19.55, color: t.neutral[900], ...font(500) },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  target: { marginBottom: 16, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: t.neutral[100], fontSize: 13, lineHeight: 20.8, color: t.neutral[500], ...font(400) },
  targetName: { ...font(500) },
  field: { marginBottom: 16, gap: 6 },
  label: { fontSize: 13, lineHeight: 20.8, color: t.neutral[700], ...font(500) },
  select: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 46,
    paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8, backgroundColor: t.neutral[0],
  },
  focus: { borderColor: t.danger[500] },
  selectText: { flex: 1, fontSize: 16, color: t.neutral[700], ...font(400) },
  selectPlaceholder: { color: t.neutral[700] },
  options: { borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 12 },
  optionPressed: { backgroundColor: t.neutral[50] },
  optionText: { flexShrink: 1, fontSize: 15, lineHeight: 20, color: t.neutral[800], ...font(400) },
  optionOn: { color: t.primary[700], ...font(500) },
  textarea: {
    minHeight: 118, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    fontSize: 16, lineHeight: 24, color: t.neutral[700], ...font(400), outlineStyle: 'none',
  },
  char: { fontSize: 12, lineHeight: 19.2, color: t.neutral[500], textAlign: 'right', ...font(400) },
  disclaimer: { marginBottom: 20, fontSize: 12, lineHeight: 18, color: t.neutral[500], ...font(400) },
  strong: { ...font(500) },
  actions: { flexDirection: 'row', gap: 8 },
  cancel: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8, backgroundColor: t.neutral[0] },
  cancelText: { fontSize: 14, color: t.neutral[700], ...font(400) },
  submit: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: t.danger[500] },
  submitText: { fontSize: 14, color: t.neutral[0], ...font(500) },
  disabled: { opacity: 0.5 },
});
