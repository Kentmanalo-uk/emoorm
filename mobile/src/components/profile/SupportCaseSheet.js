import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PaperPlaneRightIcon, XIcon } from 'phosphor-react-native';
import apiClient from '../../api/client';
import { toast } from '../../lib/toast';
import { font, t } from '../../theme';
import { ProfileSelect } from './ProfileAddressPicker';
import {
  MESSAGE_MAX, SUBJECT_MAX, SUPPORT_CATEGORIES, errorText,
} from './profileLib';

const native = Platform.OS !== 'web';
const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map(([value, label]) => ({ value, label }));

function Field({ label, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Input({ multiline = false, style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={t.neutral[500]}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      {...props}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={[styles.input, multiline && styles.textarea, focused && styles.inputFocus, style]}
    />
  );
}

/**
 * "New support case" (web components/support/SupportChat.jsx NewCaseDialog,
 * a bottom sheet on phones): what it is about, a subject and the message.
 * onOpened(conversation) gets the new case.
 */
export default function SupportCaseSheet({ open, onClose, onOpened }) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [form, setForm] = useState({ category: 'ORDER', subject: '', message: '' });
  const [saving, setSaving] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      const anim = Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native });
      anim.start();
      return () => anim.stop();
    }
    if (!mounted) return undefined;
    const anim = Animated.timing(progress, { toValue: 0, duration: 240, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native });
    anim.start(({ finished }) => { if (finished) setMounted(false); });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const close = () => { if (!saving) onClose(); };

  const submit = async () => {
    const subject = form.subject.trim();
    const message = form.message.trim();
    if (subject.length < 3) {
      toast.error('Give your case a short subject (at least 3 characters).');
      return;
    }
    if (!message) {
      toast.error('Tell us what you need help with.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.post('/support/cases', { category: form.category, subject, message });
      toast.success('Case started — your municipal admin has it.');
      setForm({ category: 'ORDER', subject: '', message: '' });
      onOpened(res.data);
      onClose();
    } catch (err) {
      toast.error(errorText(err, 'Could not start your case'));
    } finally {
      setSaving(false);
    }
  };

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [screenH, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={native ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          accessibilityLabel="New support case"
          style={[styles.panel, { maxHeight: screenH * 0.85, paddingBottom: insets.bottom, transform: [{ translateY }] }]}
        >
          <View style={styles.head}>
            <Text style={styles.title}>New support case</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={styles.x}>
              <XIcon size={16} color={t.neutral[500]} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled" bounces={false}>
            <Field label="What is it about?">
              <ProfileSelect
                title="What is it about?"
                value={form.category}
                options={CATEGORY_OPTIONS}
                onChange={set('category')}
                style={styles.select}
                textStyle={styles.selectText}
              />
            </Field>
            <Field label="Subject">
              <Input value={form.subject} onChangeText={set('subject')} maxLength={SUBJECT_MAX} placeholder="e.g. My order has not arrived" />
            </Field>
            <Field label="Tell us more">
              <Input
                multiline
                value={form.message}
                onChangeText={set('message')}
                maxLength={MESSAGE_MAX}
                placeholder="Include order numbers or store names that help us sort this out."
              />
            </Field>
            <View style={styles.foot}>
              <Pressable accessibilityRole="button" onPress={close} disabled={saving} style={[styles.btn, styles.btnGhost, saving && styles.off]}>
                <Text style={[styles.btnText, { color: t.neutral[700] }]}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={submit}
                disabled={saving}
                style={({ pressed }) => [styles.btn, styles.btnGreen, pressed && { backgroundColor: t.primary[700] }, saving && styles.off]}
              >
                {saving ? <ActivityIndicator size={14} color="#fff" /> : <PaperPlaneRightIcon size={14} weight="fill" color="#fff" />}
                <Text style={[styles.btnText, { color: '#fff' }]}>{saving ? 'Sending…' : 'Start case'}</Text>
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
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.4)' },
  panel: {
    width: '100%', borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: t.neutral[0],
    boxShadow: '0px 20px 50px rgba(15, 23, 42, 0.2)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingHorizontal: 16, paddingBottom: 6 },
  title: { fontSize: 15, lineHeight: 24, color: t.neutral[900], ...font(500) },
  x: { width: 40, height: 40, marginRight: -12, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  form: { gap: 12, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 16 },
  field: { gap: 5 },
  label: { fontSize: 12.5, lineHeight: 20, color: t.neutral[700], ...font(500) },
  select: { minHeight: 46, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 8, borderColor: t.neutral[300] },
  selectText: { fontSize: 14, lineHeight: 22.4, color: t.neutral[900] },
  input: {
    minHeight: 46, paddingVertical: 9, paddingHorizontal: 11, borderWidth: 1, borderColor: t.neutral[300], borderRadius: 8,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontSize: 14, lineHeight: 22.4, ...font(400),
  },
  textarea: { height: 101, lineHeight: 20.3 },
  inputFocus: { borderColor: t.primary[600] },
  foot: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 9, paddingHorizontal: 14, borderWidth: 1, borderColor: 'transparent', borderRadius: 8,
  },
  btnGhost: { borderColor: t.neutral[300], backgroundColor: t.neutral[0] },
  btnGreen: { backgroundColor: t.primary[600] },
  btnText: { fontSize: 12, lineHeight: 14.4, ...font(500) },
  off: { opacity: 0.6 },
});
