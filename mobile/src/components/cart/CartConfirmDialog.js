import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QuestionIcon, WarningIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';

const native = Platform.OS !== 'web';

/**
 * The website's confirmation dialog on phones (web/src/components/ui/
 * ConfirmDialog.jsx + .css ≤480px): a sheet from the bottom with a round
 * icon, the question, a line under it, and Cancel / Confirm side by side.
 * Used for the cart's "Remove …?" questions and the identity check before
 * checkout (lib/confirm's confirmAction() and useIdentityGate on the website).
 * medium: drawn inside the page (the identity dialog), where the website's
 * phone build lowers its bold text to 500; confirmAction()'s sits outside.
 */
export default function CartConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel, medium = false,
}) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.bezier(0.16, 1, 0.3, 1), useNativeDriver: native }).start();
      return undefined;
    }
    if (!mounted) return undefined;
    const anim = Animated.timing(progress, { toValue: 0, duration: 160, easing: Easing.in(Easing.ease), useNativeDriver: native });
    anim.start(({ finished }) => { if (finished) setMounted(false); });
    return () => anim.stop();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mounted) return null;
  const Icon = danger ? WarningIcon : QuestionIcon;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onCancel} statusBarTranslucent>
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={cancelLabel} />
      </Animated.View>
      <View style={styles.dock} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[styles.panel, {
            opacity: progress,
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
          }]}
        >
          <View style={styles.body}>
            <View style={[styles.icon, !danger && styles.iconNeutral]}>
              <Icon size={20} color={danger ? t.danger[600] : t.sky[600]} />
            </View>
            <View style={styles.text}>
              <Text style={[styles.title, medium && styles.w500]} accessibilityRole="header">{title}</Text>
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          </View>
          <View style={[styles.actions, { paddingBottom: 16 + insets.bottom }]}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.btn, styles.btnCancel]}>
              <Text style={[styles.btnText, styles.btnTextCancel, medium && styles.w500]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onConfirm} style={[styles.btn, danger ? styles.btnDanger : styles.btnPrimary]}>
              <Text style={[styles.btnText, medium && styles.w500]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  dock: { flex: 1, justifyContent: 'flex-end' },
  panel: {
    backgroundColor: t.neutral[0],
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 22, paddingHorizontal: 16, paddingBottom: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.danger[100] },
  iconNeutral: { backgroundColor: t.sky[100] },
  text: { flex: 1, minWidth: 0 },
  title: { marginBottom: 6, fontSize: 17, lineHeight: 22, ...font(700), color: t.neutral[900] },
  message: { fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[600] },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 16, paddingHorizontal: 16 },
  btn: { flex: 1, minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnCancel: { backgroundColor: t.neutral[100] },
  btnDanger: { backgroundColor: t.danger[600] },
  btnPrimary: { backgroundColor: t.primary[600] },
  btnText: { fontSize: 14, lineHeight: 18, ...font(600), color: '#fff' },
  btnTextCancel: { color: t.neutral[700] },
  w500: font(500),
});
