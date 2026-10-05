import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuestionIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import { IDENTITY_REQUIRED_MESSAGE } from './productLib';

const native = Platform.OS !== 'web';

/**
 * "Identity verification required" (web useIdentityGate's ConfirmDialog, a
 * bottom sheet on phones): Verify identity or Not now.
 */
export default function IdentityDialog({ open, onVerify, onCancel }) {
  const insets = useSafeAreaInsets();
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) return;
    rise.setValue(0);
    Animated.timing(rise, { toValue: 1, duration: 220, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: native }).start();
  }, [open, rise]);
  if (!open) return null;
  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={onCancel} accessibilityLabel="Close" />
        <Animated.View
          style={[styles.panel, {
            opacity: rise,
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
          }]}
          accessibilityViewIsModal
        >
          <View style={styles.body}>
            <View style={styles.icon}><QuestionIcon size={20} color={t.sky[600]} /></View>
            <View style={styles.text}>
              <Text style={styles.title} accessibilityRole="header">Identity verification required</Text>
              <Text style={styles.message}>{IDENTITY_REQUIRED_MESSAGE}</Text>
            </View>
          </View>
          <View style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable style={[styles.btn, styles.cancel]} onPress={onCancel} accessibilityRole="button">
              <Text style={[styles.btnText, styles.cancelText]}>Not now</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.primary]} onPress={onVerify} accessibilityRole="button">
              <Text style={[styles.btnText, styles.primaryText]}>Verify identity</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  panel: { borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: '#fff', overflow: 'hidden' },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 22, paddingHorizontal: 16, paddingBottom: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.sky[100] },
  text: { flex: 1, minWidth: 0 },
  title: { marginBottom: 6, fontSize: 17, lineHeight: 22, ...font(500), color: t.neutral[900] },
  message: { fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[600] },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 16, paddingHorizontal: 16 },
  btn: { flex: 1, minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontSize: 14, lineHeight: 20, ...font(500) },
  cancel: { backgroundColor: t.neutral[100] },
  cancelText: { color: t.neutral[700] },
  primary: { backgroundColor: t.primary[600] },
  primaryText: { color: '#fff' },
});
