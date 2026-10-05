import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { QuestionIcon, WarningIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import OrderSheetFrame from './OrderSheetFrame';

/**
 * The website's ConfirmDialog as phones show it (ConfirmDialog.css ≤480px):
 * a bottom sheet with a round icon, the question, a line under it and two
 * equal buttons (Cancel grey, the action red or green).
 */
export default function OrderConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, loading = false, onConfirm, onCancel, children,
}) {
  return (
    <OrderSheetFrame
      open={open}
      onClose={() => { if (!loading) onCancel?.(); }}
      backdrop="rgba(15, 23, 42, 0.5)"
      scroll={false}
      footer={(
        <>
          <Pressable accessibilityRole="button" disabled={loading} onPress={onCancel} style={[styles.btn, styles.cancel, loading && styles.off]}>
            <Text style={[styles.btnText, styles.cancelText]}>{cancelLabel}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={loading} onPress={onConfirm} style={[styles.btn, danger ? styles.danger : styles.primary, loading && styles.off]}>
            {loading ? <ActivityIndicator size={14} color="#fff" style={{ marginRight: 6 }} /> : null}
            <Text style={[styles.btnText, styles.goText]}>{confirmLabel}</Text>
          </Pressable>
        </>
      )}
      footerStyle={styles.foot}
    >
      <View style={styles.body}>
        <View style={[styles.icon, !danger && styles.iconNeutral]}>
          {danger ? <WarningIcon size={20} color={t.danger[600]} /> : <QuestionIcon size={20} color={t.sky[600]} />}
        </View>
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          {children}
        </View>
      </View>
    </OrderSheetFrame>
  );
}

const styles = StyleSheet.create({
  body: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingTop: 22, paddingHorizontal: 16, paddingBottom: 4 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.danger[100] },
  iconNeutral: { backgroundColor: t.sky[100] },
  text: { flex: 1, minWidth: 0 },
  title: { marginBottom: 6, fontSize: 17, lineHeight: 20.4, ...font(500), color: t.neutral[900] },
  message: { fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[600] },
  foot: { gap: 10, paddingTop: 16, borderTopWidth: 0 },
  btn: { flex: 1, flexDirection: 'row', minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  cancel: { backgroundColor: t.neutral[100] },
  primary: { backgroundColor: t.primary[600] },
  danger: { backgroundColor: t.danger[600] },
  off: { opacity: 0.6 },
  btnText: { fontSize: 14, lineHeight: 20, ...font(500) },
  cancelText: { color: t.neutral[700] },
  goText: { color: '#fff' },
});
