import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckIcon, XIcon } from 'phosphor-react-native';
import { font, t } from '../theme';

/*
 * The website's phone bottom sheets.
 *
 *   variant="buyer"   the search filter sheet (web/src/components/search/
 *                     SearchFilterSheet.css .sfs): 16px corners, a title row
 *                     with a hairline under it and a plain X
 *   variant="seller"  the Seller Center sheet (web/src/components/seller/
 *                     PhoneSheet.jsx, layout/SellerMobile.css .scm-sheet):
 *                     20px corners, a grip, a round grey X, padded body
 *
 * Slides up over a dimmed backdrop as the website does (index.css
 * ui-sheet-*: up in 300ms, down in 240ms) and closes on the backdrop, the X
 * and Android's back button. The body scrolls when it is taller than the
 * sheet allows (82% / 86% of the screen).
 *
 * <Sheet open title onClose footer={<>…</>} variant="buyer">…</Sheet>
 * Also here: SheetOption (a choice row) and SheetButton (the footer buttons).
 */

const OPEN_MS = 300;
const CLOSE_MS = 240;
const native = Platform.OS !== 'web';

export default function Sheet({
  open, title, onClose, children, footer, variant = 'buyer', grip, scroll = true, bodyStyle, style,
}) {
  const seller = variant === 'seller';
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

  // Rise once the panel's height is known, so it travels exactly its height.
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
  const showGrip = grip ?? seller;
  const bottom = Math.max(insets.bottom, 0);
  // Without a footer the body's end clears the home indicator (.scm-sheet-body:last-child).
  const pad = [seller ? styles.bodySeller : styles.bodyBuyer, !footer && { paddingBottom: (seller ? 18 : 12) + bottom }];

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={native ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>

        <Animated.View
          accessibilityViewIsModal
          onLayout={(e) => { if (!panelH) setPanelH(e.nativeEvent.layout.height); }}
          style={[
            styles.panel,
            seller ? styles.panelSeller : styles.panelBuyer,
            { maxHeight: screenH * (seller ? 0.86 : 0.82), transform: [{ translateY }] },
            style,
          ]}
        >
          {showGrip ? <View style={styles.grip} /> : null}
          <View style={seller ? styles.headSeller : styles.headBuyer}>
            <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={seller ? styles.closeSeller : styles.closeBuyer}>
              {seller ? <XIcon size={18} weight="bold" color={t.neutral[700]} /> : <XIcon size={20} color={t.neutral[500]} />}
            </Pressable>
          </View>

          {scroll ? (
            <ScrollView style={styles.bodyBox} contentContainerStyle={[pad, bodyStyle]} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.bodyBox, pad, bodyStyle]}>{children}</View>
          )}

          {footer ? <View style={[styles.foot, { paddingBottom: 12 + bottom }]}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
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
  backdrop: { backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: { width: '100%', backgroundColor: t.neutral[0], overflow: 'hidden' },
  panelBuyer: { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  panelSeller: {
    alignSelf: 'center', maxWidth: 560, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.16, shadowRadius: 15, elevation: 16,
  },
  grip: { alignSelf: 'center', width: 40, height: 4, marginTop: 10, marginBottom: 2, borderRadius: 999, backgroundColor: t.neutral[200] },

  headBuyer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 14, paddingRight: 8, paddingBottom: 10, paddingLeft: 20, borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  headSeller: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingTop: 6, paddingRight: 12, paddingBottom: 6, paddingLeft: 20,
  },
  title: { flexShrink: 1, fontSize: 18, lineHeight: 20.7, ...font(500), color: t.neutral[900] },
  closeBuyer: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  closeSeller: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100] },

  bodyBox: { flexGrow: 0, flexShrink: 1 },
  bodyBuyer: { paddingTop: 4, paddingBottom: 12 },
  bodySeller: { paddingTop: 6, paddingHorizontal: 20, paddingBottom: 12 },
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
