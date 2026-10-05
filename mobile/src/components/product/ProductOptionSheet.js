import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MinusIcon, PlusIcon, TruckIcon, XIcon } from 'phosphor-react-native';
import ProductImage from '../ProductImage';
import {
  pricedVariation, priceRange, stockedVariation, stockForSelection, unitPriceFor,
} from '../../lib/variantPricing';
import { font, t } from '../../theme';
import { peso } from './productLib';

const native = Platform.OS !== 'web';
const PLACEHOLDER = require('../../../assets/pdp-placeholder-product.png');

/**
 * Phone bottom sheet for picking a product's options and quantity before
 * adding it to the cart or buying it now (web/src/components/ProductOptionSheet.jsx).
 *
 * mode: 'cart' | 'buy' | null (closed). onConfirm() runs the add or buy; the
 * sheet only checks that every option group has a pick first.
 */
export default function ProductOptionSheet({
  mode, product, image, selected, onSelect, quantity, onQuantity, onConfirm, onClose, busy = false,
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const [shown, setShown] = useState(mode);
  const [missing, setMissing] = useState('');
  const [qtyText, setQtyText] = useState(String(quantity));
  const progress = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef(null);
  const groupY = useRef({});

  useEffect(() => { setQtyText(String(quantity)); }, [quantity]);

  // Keep the sheet mounted while it slides away.
  useEffect(() => {
    if (mode) {
      setShown(mode);
      setMissing('');
      progress.setValue(0);
      Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: native }).start();
      return undefined;
    }
    if (!shown) return undefined;
    const anim = Animated.timing(progress, { toValue: 0, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: native });
    anim.start(({ finished }) => { if (finished) setShown(null); });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (!shown || !product) return null;

  const variations = Array.isArray(product.variations) ? product.variations.filter((v) => v?.name) : [];
  const stockGroup = stockedVariation(product.variations);
  const stock = stockForSelection(product, selected);
  const outOfStock = stock <= 0;
  const optionSoldOut = (groupName, opt) => stockGroup?.name === groupName && Number(stockGroup.stocks?.[opt] || 0) <= 0;
  const picked = variations.filter((v) => selected[v.name]).map((v) => `${v.name}: ${selected[v.name]}`);
  const unpicked = variations.filter((v) => !selected[v.name]).map((v) => v.name);
  const pricedGroup = pricedVariation(product.variations);
  const range = priceRange(product);
  const chosen = !!(pricedGroup && selected[pricedGroup.name]);
  const unit = unitPriceFor(product, selected, quantity);
  const showRange = !!pricedGroup && range.min !== range.max && !chosen;
  const total = unit * quantity;
  const low = product.lowStockThreshold || 5;

  const setQty = (n) => onQuantity(Math.max(1, Math.min(stock || 1, n)));

  const confirm = () => {
    const first = variations.find((v) => !selected[v.name]);
    if (first) {
      setMissing(first.name);
      const y = groupY.current[first.name];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
      return;
    }
    onConfirm();
  };

  const label = shown === 'buy' ? 'Buy now' : 'Add to cart';
  // The options grid: as many 96px+ columns as fit, 8px apart.
  const innerW = Math.min(screenW, 768) - 32;
  const cols = Math.max(1, Math.floor((innerW + 8) / 104));
  const optionW = (innerW - (cols - 1) * 8) / cols;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [screenH * 0.8, 0] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={native ? 'padding' : undefined}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View
          style={[styles.sheet, { maxHeight: screenH * 0.78, transform: [{ translateY }] }]}
          accessibilityViewIsModal
          accessibilityLabel={`${label}: choose options`}
        >
          <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <XIcon size={18} weight="bold" color="#fff" />
          </Pressable>

          <View style={styles.head}>
            <View style={styles.thumb}>{image ? <ProductImage src={image} /> : <Image source={PLACEHOLDER} style={styles.thumbImg} />}</View>
            <View style={styles.headInfo}>
              <Text style={styles.price}>{showRange ? `${peso(range.min)} – ${peso(range.max)}` : peso(unit)}</Text>
              <View style={[styles.stock, outOfStock ? styles.stockOut : stock <= low ? styles.stockLow : null]}>
                <Text style={[styles.stockText, outOfStock ? styles.stockOutText : stock <= low ? styles.stockLowText : null]}>
                  {outOfStock ? 'Out of stock' : stock <= low ? `Only ${stock} left` : `Stock: ${stock}`}
                </Text>
              </View>
              <Text style={styles.picked} numberOfLines={1}>
                {variations.length === 0 ? product.name : unpicked.length ? `Select ${unpicked.join(', ')}` : picked.join(', ')}
              </Text>
            </View>
          </View>

          {product.store?.name ? (
            <View style={styles.banner}>
              <TruckIcon size={17} weight="fill" color={t.primary[700]} />
              <Text style={styles.bannerText} numberOfLines={1}>
                Sold by <Text style={styles.bannerStrong}>{product.store.name}</Text>
              </Text>
              <Text style={styles.bannerNote}>Delivery options at checkout</Text>
            </View>
          ) : null}

          <ScrollView ref={scrollRef} style={styles.bodyScroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {variations.map((v) => {
              const options = Array.isArray(v.options) ? v.options : [];
              return (
                <View key={v.name} style={styles.group} onLayout={(e) => { groupY.current[v.name] = e.nativeEvent.layout.y; }}>
                  <Text style={styles.groupTitle}>
                    {v.name} <Text style={styles.groupCount}>({options.length})</Text>
                  </Text>
                  <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel={v.name}>
                    {options.map((opt) => {
                      const on = selected[v.name] === opt;
                      const soldOut = optionSoldOut(v.name, opt);
                      const price = pricedGroup?.name === v.name && Number(pricedGroup.prices?.[opt]) > 0 ? pricedGroup.prices[opt] : null;
                      return (
                        <Pressable
                          key={opt}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: on, disabled: soldOut && !on }}
                          disabled={soldOut && !on}
                          onPress={() => {
                            onSelect(v.name, on ? undefined : opt);
                            if (missing === v.name) setMissing('');
                            // Keep the quantity within the new option's stock.
                            if (!on && stockGroup?.name === v.name) {
                              const left = Number(stockGroup.stocks?.[opt] || 0);
                              if (left > 0 && quantity > left) onQuantity(left);
                            }
                          }}
                          style={[
                            styles.option, { width: optionW },
                            on && styles.optionOn,
                            missing === v.name && !on && styles.optionError,
                            soldOut && styles.optionSoldOut,
                          ]}
                        >
                          <Text style={[styles.optionText, on && styles.optionTextOn]}>{opt}</Text>
                          {soldOut ? <Text style={styles.optionSoldOutText}>Sold out</Text> : null}
                          {price != null ? <Text style={[styles.optionPrice, on && styles.optionTextOn]}>{peso(price)}</Text> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                  {missing === v.name ? <Text style={styles.error}>Please select {v.name}.</Text> : null}
                </View>
              );
            })}

            <View style={[styles.group, styles.qtyRow]}>
              <Text style={[styles.groupTitle, styles.qtyTitle]}>Quantity</Text>
              <View style={styles.qty}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  disabled={quantity <= 1}
                  onPress={() => setQty(quantity - 1)}
                  style={styles.qtyBtn}
                >
                  <MinusIcon size={15} weight="bold" color={quantity <= 1 ? t.neutral[300] : t.neutral[800]} />
                </Pressable>
                <TextInput
                  value={qtyText}
                  keyboardType="number-pad"
                  accessibilityLabel="Quantity"
                  onChangeText={(raw) => {
                    const digits = raw.replace(/\D/g, '');
                    setQtyText(digits);
                    if (digits) setQty(parseInt(digits, 10));
                  }}
                  onBlur={() => setQtyText(String(quantity))}
                  style={styles.qtyInput}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  disabled={quantity >= stock}
                  onPress={() => setQty(quantity + 1)}
                  style={styles.qtyBtn}
                >
                  <PlusIcon size={15} weight="bold" color={quantity >= stock ? t.neutral[300] : t.neutral[800]} />
                </Pressable>
              </View>
            </View>
            {!outOfStock && quantity >= stock && stock > 1 ? (
              <Text style={styles.note}>You’ve reached the available stock.</Text>
            ) : null}
          </ScrollView>

          <View style={[styles.foot, { paddingBottom: 10 + insets.bottom }]}>
            <Pressable
              accessibilityRole="button"
              onPress={confirm}
              disabled={outOfStock || busy}
              style={[styles.confirm, shown === 'buy' && styles.confirmBuy, (outOfStock || busy) && styles.confirmOff]}
            >
              {outOfStock ? <Text style={styles.confirmText}>Out of stock</Text> : busy ? (
                <View style={styles.busy}><ActivityIndicator size="small" color="#fff" /><Text style={styles.confirmText}>Please wait…</Text></View>
              ) : (
                <>
                  <Text style={styles.confirmText}>{label}</Text>
                  {shown === 'buy' ? <Text style={styles.confirmSmall}>{peso(total)}</Text> : null}
                </>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: '#fff',
    boxShadow: [{ offsetX: 0, offsetY: -8, blurRadius: 30, color: 'rgba(15, 23, 42, 0.18)' }],
  },
  close: {
    position: 'absolute', top: -52, right: 14, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  head: { flexDirection: 'row', gap: 14, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 12 },
  thumb: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[100] },
  thumbImg: { width: '100%', height: '100%' },
  headInfo: { flex: 1, minWidth: 0, justifyContent: 'flex-end', gap: 4 },
  price: { fontSize: 24, lineHeight: 26.4, ...font(500), color: t.accent[500] },
  stock: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, backgroundColor: t.primary[50] },
  stockText: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.primary[700] },
  stockLow: { backgroundColor: '#fff7ed' },
  stockLowText: { color: '#c2410c' },
  stockOut: { backgroundColor: '#fef2f2' },
  stockOutText: { color: '#b91c1c' },
  picked: { fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500] },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 4, paddingVertical: 9, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: t.primary[50],
  },
  bannerText: { flexShrink: 1, minWidth: 0, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.primary[700] },
  bannerStrong: { ...font(500) },
  bannerNote: { flexShrink: 0, marginLeft: 'auto', fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingTop: 4, paddingHorizontal: 16, paddingBottom: 12 },
  group: { paddingTop: 12, paddingBottom: 4 },
  groupTitle: { marginBottom: 10, fontSize: 15, lineHeight: 17.25, ...font(500), color: t.neutral[900] },
  groupCount: { color: t.neutral[500] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    minHeight: 42, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10,
    backgroundColor: t.neutral[50], alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  optionOn: { borderColor: t.accent[500], backgroundColor: '#fdf2f8' },
  optionError: { borderColor: '#fca5a5' },
  optionSoldOut: { opacity: 0.5 },
  optionText: { fontSize: 13.5, lineHeight: 16.875, ...font(400), color: t.neutral[800], textAlign: 'center' },
  optionTextOn: { color: t.accent[600] },
  optionPrice: { fontSize: 12, lineHeight: 15, ...font(400), color: t.neutral[500] },
  optionSoldOutText: { fontSize: 11.5, lineHeight: 14.4, ...font(400), color: '#b91c1c' },
  error: { marginTop: 6, fontSize: 12.5, lineHeight: 20, ...font(400), color: '#dc2626' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16 },
  qtyTitle: { marginBottom: 0 },
  qty: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10 },
  qtyBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[50] },
  qtyInput: {
    width: 48, height: 46, padding: 0, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.neutral[200],
    fontSize: 15, ...font(400), color: t.neutral[900], textAlign: 'center', backgroundColor: '#fff', outlineStyle: 'none',
  },
  note: { marginTop: 6, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500], textAlign: 'right' },
  foot: { paddingTop: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.neutral[150] },
  confirm: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent[500] },
  confirmBuy: { backgroundColor: t.primary[600] },
  confirmOff: { opacity: 0.5 },
  confirmText: { fontSize: 16, lineHeight: 18.4, ...font(500), color: '#fff' },
  confirmSmall: { fontSize: 12, lineHeight: 19.2, ...font(400), color: 'rgba(255,255,255,0.9)' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
