import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, XIcon } from 'phosphor-react-native';
import { font, t } from '../theme';

/*
 * Every bottom sheet in the app, in one look: the Log in / Sign up sheet's
 * (web pages/AuthSheet.css, components/AuthSheetBar.jsx). A white sheet with
 * a 24px rounded top slides up over the dimmed page, with a grab handle, a
 * round grey × at the left (and the sheet's own link at the right, green),
 * then the title as the sign-in sheet writes "Sign In" (28px). Dragging the
 * bar down past 110px, tapping the × or the dimmed page, or Android's back
 * closes it. Same on every phone.
 *
 *   <Sheet open title onClose footer={<>…</>} action={{ label, onPress }}>…</Sheet>
 *   <SheetFrame …>: the same frame for a sheet that lays out its own body
 *   (scroll={false}, padded={false}: bring your own; safeBottom={false} when
 *   the body keeps clear of the home bar itself).
 * Also here: SheetOption (a choice row) and SheetButton (the footer buttons).
 * `variant` stays accepted for older callers; it only picks the options' and
 * buttons' looks now.
 */

const OPEN_MS = 380;
const CLOSE_MS = 240;
const DISMISS_PX = 110;
const native = Platform.OS !== 'web';

export function SheetFrame({
  open, onClose, title, action, children, footer, scroll = true, bodyStyle, style, dismissible = true,
  maxHeight = 0.9, padded = true, headerRight, safeBottom = true,
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const [panelH, setPanelH] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    if (open) {
      closing.current = false;
      drag.setValue(0);
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

  // Rise once the panel's height is known, so it travels exactly its height.
  useEffect(() => {
    if (!open || !panelH) return undefined;
    const anim = Animated.timing(progress, {
      toValue: 1, duration: OPEN_MS, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: native,
    });
    anim.start();
    return () => anim.stop();
  }, [open, panelH, progress]);

  const close = () => {
    if (!dismissible || closing.current) return;
    closing.current = true;
    onClose?.();
  };

  // The bar drags the sheet down; far enough closes it, as the sign-in sheet.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => dismissible && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_, g) => {
      if (g.dy > DISMISS_PX) { close(); return; }
      Animated.timing(drag, { toValue: 0, duration: 200, easing: Easing.out(Easing.ease), useNativeDriver: native }).start();
    },
    onPanResponderTerminate: () => {
      Animated.timing(drag, { toValue: 0, duration: 200, useNativeDriver: native }).start();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dismissible, onClose]);

  if (!mounted) return null;

  const rise = progress.interpolate({ inputRange: [0, 1], outputRange: [panelH || screenH, 0] });
  const translateY = Animated.add(rise, drag);
  // safeBottom={false}: the sheet keeps the home bar clear itself.
  const pad = [padded && styles.body, !footer && safeBottom && { paddingBottom: 18 + insets.bottom }];

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView style={styles.root} behavior={native ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          onLayout={(e) => { if (!panelH) setPanelH(e.nativeEvent.layout.height); }}
          style={[styles.panel, { maxHeight: screenH * maxHeight, transform: [{ translateY }] }, style]}
        >
          <View style={styles.bar} {...pan.panHandlers}>
            <View style={styles.grabber} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              hitSlop={4}
              disabled={!dismissible}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed, !dismissible && styles.closeOff]}
            >
              <XIcon size={20} weight="bold" color={t.neutral[800]} />
            </Pressable>
            {headerRight ?? (action ? (
              <Pressable
                accessibilityRole="button"
                onPress={action.onPress}
                disabled={action.disabled}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed, action.disabled && styles.actionOff]}
              >
                <Text style={styles.actionText}>{action.label}</Text>
              </Pressable>
            ) : null)}
          </View>
          {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}

          {scroll ? (
            <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} style={styles.bodyBox} contentContainerStyle={[pad, bodyStyle]} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.bodyBox, pad, bodyStyle]}>{children}</View>
          )}

          {footer ? <View style={[styles.foot, { paddingBottom: 12 + insets.bottom }]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function Sheet({
  open, title, onClose, children, footer, scroll = true, bodyStyle, style, action, dismissible, variant = 'buyer',
}) {
  return (
    <SheetFrame
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      scroll={scroll}
      bodyStyle={bodyStyle}
      style={style}
      action={action}
      dismissible={dismissible}
      padded={variant === 'seller'}
    >
      {children}
    </SheetFrame>
  );
}

/**
 * A choice in a sheet. Buyer: the filter sheet's row (.sfs-option, a check
 * when chosen) or, with `grid`, its two-column chip (.sfs-options.is-grid).
 * Seller: .scm-choice (a hairline under each; `danger` in red).
 */
export function SheetOption({ label, selected = false, onPress, variant = 'buyer', grid = false, danger = false, right, style }) {
  if (variant === 'seller') {
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, style]}>
        <Text style={[styles.choiceText, selected && styles.choiceOn, danger && styles.choiceDanger]}>{label}</Text>
        {right ?? (selected ? <CheckIcon size={18} weight="bold" color={t.primary[700]} /> : null)}
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.option, grid && styles.optionGrid, grid && selected && styles.optionGridOn, pressed && !grid && styles.optionPressed, style]}
    >
      <Text style={[styles.optionText, grid && styles.optionTextGrid, selected && styles.optionOn]} numberOfLines={grid ? 1 : undefined}>{label}</Text>
      {!grid && selected ? <CheckIcon size={18} weight="bold" color={t.primary[700]} /> : null}
    </Pressable>
  );
}

/** A footer button. Buyer: .sfs-btn (square). Seller: .scm-btn (a pill; not primary = ghost). */
export function SheetButton({ label, primary = false, onPress, disabled = false, variant = 'buyer', style }) {
  const seller = variant === 'seller';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        seller ? styles.btnSeller : styles.btnBuyer,
        seller && !primary && styles.btnSellerGhost,
        !seller && primary && styles.btnBuyerPrimary,
        disabled && styles.btnDisabled,
        style,
      ]}
    >
      <Text style={[styles.btnText, seller && styles.btnTextSeller, primary && styles.btnTextPrimary, seller && !primary && styles.btnTextGhost]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.42)' },
  panel: {
    width: '100%', alignSelf: 'center', maxWidth: 640, backgroundColor: t.neutral[0], overflow: 'hidden',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.12, shadowRadius: 15, elevation: 16,
  },
  // The sign-in sheet's bar (AuthHeader): handle, round × at the left, link at the right.
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 14, paddingHorizontal: 12, paddingBottom: 8, backgroundColor: t.neutral[0],
  },
  grabber: {
    position: 'absolute', top: 6, left: '50%', marginLeft: -20, width: 40, height: 5, borderRadius: 999,
    backgroundColor: t.neutral[200],
  },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },
  closePressed: { backgroundColor: t.neutral[200] },
  closeOff: { opacity: 0.5 },
  action: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  actionPressed: { backgroundColor: t.primary[50] },
  actionOff: { opacity: 0.5 },
  actionText: { fontSize: 15, lineHeight: 24, color: t.primary[700], ...font(500) },
  // As the sign-in sheet's "Sign In" (AuthPanels title).
  title: {
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12,
    fontSize: 28, lineHeight: 32.2, letterSpacing: -0.28, color: t.neutral[900], ...font(500),
  },
  bodyBox: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 20, paddingBottom: 12 },
  foot: {
    flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 20,
    borderTopWidth: 1, borderTopColor: t.neutral[100],
  },

  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, paddingHorizontal: 20 },
  optionPressed: { backgroundColor: t.neutral[50] },
  optionText: { flexShrink: 1, fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[800] },
  optionOn: { ...font(500), color: t.primary[700] },
  optionGrid: { justifyContent: 'center', minHeight: 40, paddingHorizontal: 8, backgroundColor: t.neutral[100] },
  optionGridOn: { backgroundColor: t.primary[50], borderWidth: 1, borderColor: t.primary[200] },
  optionTextGrid: { fontSize: 14, lineHeight: 22.4, textAlign: 'center' },

  choice: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 48,
    paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  choiceText: { flexShrink: 1, fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[800] },
  choiceOn: { ...font(600), color: t.primary[700] },
  choiceDanger: { color: t.danger[600] },

  btnBuyer: {
    flex: 1, height: 46, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0],
  },
  btnBuyerPrimary: { borderColor: t.primary[600], backgroundColor: t.primary[600] },
  btnSeller: {
    flex: 1, flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, backgroundColor: t.primary[600],
  },
  btnSellerGhost: { borderWidth: 1, borderColor: t.neutral[200], backgroundColor: t.neutral[0] },
  btnDisabled: { opacity: 0.6 },
  btnText: { fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[800] },
  btnTextSeller: { ...font(600) },
  btnTextPrimary: { color: '#fff' },
  btnTextGhost: { color: t.neutral[700] },
});
