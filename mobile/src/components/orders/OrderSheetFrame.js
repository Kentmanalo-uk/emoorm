import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { XIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';

const native = Platform.OS !== 'web';

/**
 * The bottom sheets of My Orders on phones: the order details
 * (Orders.css .order-details-modal), Rate & Review (ReviewModal.css) and the
 * confirm dialog (ConfirmDialog.css). A white panel with 16px top corners
 * rising over a dimmed backdrop (ui-sheet-*: up in 300ms, down in 240ms).
 *
 * title + onClose: the sticky title row (none when `title` is not given).
 * headerStyle / titleStyle: the row's own padding and type per sheet.
 * footer: the sticky button row. maxHeight: share of the screen (0.9).
 * backdrop: the dim colour (Orders: rgba(0,0,0,.5)).
 */
export default function OrderSheetFrame({
  open, title, onClose, children, footer, footerStyle, headerStyle, titleStyle, bodyStyle,
  maxHeight = 0.9, backdrop = 'rgba(0, 0, 0, 0.5)', scroll = true, dismissable = true,
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [panelH, setPanelH] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) { setMounted(true); return undefined; }
    if (!mounted) return undefined;
    const anim = Animated.timing(progress, { toValue: 0, duration: 240, easing: Easing.bezier(0.4, 0, 1, 1), useNativeDriver: native });
    anim.start(({ finished }) => { if (finished) { setMounted(false); setPanelH(0); } });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !panelH) return undefined;
    const anim = Animated.timing(progress, { toValue: 1, duration: 300, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native });
    anim.start();
    return () => anim.stop();
  }, [open, panelH, progress]);

  if (!mounted) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [panelH || screenH, 0] });
  const close = () => { if (dismissable) onClose?.(); };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={native ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: backdrop, opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onLayout={(e) => { if (!panelH) setPanelH(e.nativeEvent.layout.height); }}
          style={[styles.panel, { maxHeight: screenH * maxHeight, transform: [{ translateY }] }]}
        >
          {title ? (
            <View style={[styles.head, headerStyle]}>
              <Text style={[styles.title, titleStyle]} numberOfLines={1} accessibilityRole="header">{title}</Text>
              <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}>
                <XIcon size={20} color={t.neutral[500]} />
              </Pressable>
            </View>
          ) : null}
          {scroll ? (
            <ScrollView style={styles.body} contentContainerStyle={[!footer && { paddingBottom: insets.bottom }, bodyStyle]} bounces={false} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={[!footer && { paddingBottom: insets.bottom }, bodyStyle]}>{children}</View>
          )}
          {footer ? <View style={[styles.foot, { paddingBottom: 12 + insets.bottom }, footerStyle]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  panel: { width: '100%', backgroundColor: t.neutral[0], borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
  title: { flexShrink: 1, fontSize: 17, lineHeight: 19.55, ...font(500), color: t.neutral[900] },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  body: { flexGrow: 0, flexShrink: 1 },
  foot: {
    flexDirection: 'row', gap: 10.5, paddingTop: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: t.neutral[200], backgroundColor: t.neutral[0],
  },
});
