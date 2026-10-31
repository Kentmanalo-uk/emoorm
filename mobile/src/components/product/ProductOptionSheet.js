import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MinusIcon, PlusIcon, TruckIcon, XIcon } from '../../lib/icons';
import ProductImage from '../ProductImage';
import {
  pricedVariation, priceRange, stockedVariation, stockForSelection, unitPriceFor,
} from '../../lib/variantPricing';
import { font, t, themed } from '../../theme';
import { SheetFrame } from '../Sheet';
import { peso } from './productLib';
import { imagedVariation, optionImage } from '../../lib/variationImage';
import { buyLabel } from '../../lib/availability';

const native = Platform.OS !== 'web';
const PLACEHOLDER = require('../../../assets/pdp-placeholder-product.png');

/**
 * Phone bottom sheet for picking a product's options and quantity before
 * adding it to the cart or buying it now (web/src/components/ProductOptionSheet.jsx).
 *
 * mode: 'cart' | 'buy' | null (closed).
 * onConfirm(action): runs the add ('cart') or buy ('buy'); the sheet only
 * checks that every option group has a pick first. Opened for Buy now, the
 * sheet offers both, so a buyer who changes their mind can still add to cart.
 * limits: { least, most } for the quantity when the product's kind sets them
 * (a paluto's minimum order and no stock cap); stockText and soldOutText
 * replace the stock line and "Out of stock" for kinds that word them otherwise;
 * priceFrom shows sizes' prices as "from ₱350", priceUnit follows the price (" / head").
 */
export default function ProductOptionSheet({
  mode, product, image, selected, onSelect, quantity, onQuantity, onConfirm, onClose, busy = false,
  limits = null, stockText = null, soldOutText = 'Out of stock', priceFrom = false, priceUnit = '',
}) {
  const insets = useSafeAreaInsets();
  const { height: screenH, width: screenW } = useWindowDimensions();
  const [shown, setShown] = useState(mode);
  const [missing, setMissing] = useState('');
  // Which footer button was pressed, so only that one shows it is working.
  const [pressed, setPressed] = useState(null);
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
      setPressed(null);
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

  // iOS 26 keeps the system sheet mounted, so it can rise and go down itself.
  if (!product || !shown) return null;

  const variations = Array.isArray(product.variations) ? product.variations.filter((v) => v?.name) : [];
  const stockGroup = stockedVariation(product.variations);
  const stock = stockForSelection(product, selected);
  const { least, most } = limits || { least: 1, most: stock };
  const outOfStock = most <= 0;
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
  // Options with their own photo show it, and the head shows the picked one's.
  const photoGroup = imagedVariation(product.variations);
  const headImage = optionImage(product.variations, selected) || image;

  const setQty = (n) => onQuantity(Math.max(least, Math.min(most || 1, n)));

  const confirm = (action = shown) => {
    const first = variations.find((v) => !selected[v.name]);
    if (first) {
      setMissing(first.name);
      const y = groupY.current[first.name];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 40), animated: true });
      return;
    }
    setPressed(action);
    onConfirm(action);
  };
  const split = shown === 'buy' && !outOfStock;

  const label = shown === 'buy' ? buyLabel(product) : 'Add to cart';
  // The options grid: as many 96px+ columns as fit, 8px apart.
  const innerW = Math.min(screenW, 768) - 32;
  const cols = Math.max(1, Math.floor((innerW + 8) / 104));
  const optionW = (innerW - (cols - 1) * 8) / cols;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [screenH * 0.8, 0] });

  // The sheet's head, options, quantity and buttons (in either sheet).
  const content = (
    <>
      <View style={styles.head}>
        <View style={styles.thumb}>{headImage ? <ProductImage src={headImage} /> : <Image source={PLACEHOLDER} style={styles.thumbImg} />}</View>
        <View style={styles.headInfo}>
          <Text style={styles.price}>
            {showRange ? (priceFrom ? `from ${peso(range.min)}` : `${peso(range.min)} – ${peso(range.max)}`) : peso(unit)}
            {priceUnit ? <Text style={styles.priceUnit}>{priceUnit}</Text> : null}
          </Text>
          <View style={[styles.stock, outOfStock ? styles.stockOut : !stockText && stock <= low ? styles.stockLow : null]}>
            <Text style={[styles.stockText, outOfStock ? styles.stockOutText : !stockText && stock <= low ? styles.stockLowText : null]}>
              {outOfStock ? soldOutText : stockText || (stock <= low ? `Only ${stock} left` : `Stock: ${stock}`)}
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

      <ScrollView showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} ref={scrollRef} style={styles.bodyScroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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
                  const photo = photoGroup?.name === v.name ? photoGroup.images[opt] : null;
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
                      {photo ? <View style={styles.optionThumb}><ProductImage src={photo} /></View> : null}
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
          <Text style={[styles.groupTitle, styles.qtyTitle]}>
            Quantity{least > 1 ? <Text style={styles.groupCount}> (minimum {least})</Text> : null}
          </Text>
          <View style={styles.qty}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease quantity"
              disabled={quantity <= least}
              onPress={() => setQty(quantity - 1)}
              style={styles.qtyBtn}
            >
              <MinusIcon size={15} weight="bold" color={quantity <= least ? t.neutral[300] : t.neutral[800]} />
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
              disabled={quantity >= most}
              onPress={() => setQty(quantity + 1)}
              style={styles.qtyBtn}
            >
              <PlusIcon size={15} weight="bold" color={quantity >= most ? t.neutral[300] : t.neutral[800]} />
            </Pressable>
          </View>
        </View>
        {!outOfStock && quantity >= stock && stock > 1 ? (
          <Text style={styles.note}>You’ve reached the available stock.</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.foot, split && styles.footSplit, { paddingBottom: 10 + insets.bottom }]}>
        {split ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => confirm('cart')}
            disabled={busy}
            style={[styles.confirm, styles.confirmSplit, styles.confirmCart, busy && styles.confirmOff]}
          >
            {busy && pressed === 'cart' ? (
              <View style={styles.busy}><ActivityIndicator size="small" color={t.accent[600]} /><Text style={[styles.confirmText, styles.cartText]}>Adding…</Text></View>
            ) : <Text style={[styles.confirmText, styles.cartText]}>Add to cart</Text>}
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => confirm(shown)}
          disabled={outOfStock || busy}
          style={[styles.confirm, split && styles.confirmSplit, shown === 'buy' && styles.confirmBuy, (outOfStock || busy) && styles.confirmOff]}
        >
          {outOfStock ? <Text style={styles.confirmText}>{soldOutText}</Text> : busy && pressed !== 'cart' ? (
            <View style={styles.busy}><ActivityIndicator size="small" color="#fff" /><Text style={styles.confirmText}>Please wait…</Text></View>
          ) : (
            <>
              <Text style={styles.confirmText}>{label}</Text>
              {shown === 'buy' ? <Text style={styles.confirmSmall}>{peso(total)}</Text> : null}
            </>
          )}
        </Pressable>
      </View>
    </>
  );

  // The app's one sheet look on every phone (the sign-in sheet's: Sheet.js
  // SheetFrame): handle, round × at the left, then the product and options.
  return (
    <SheetFrame safeBottom={false} open={Boolean(mode)} onClose={onClose} scroll={false} padded={false} maxHeight={0.82}>
      {content}
    </SheetFrame>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: t.neutral[0],
    boxShadow: [{ offsetX: 0, offsetY: -8, blurRadius: 30, color: 'rgba(15, 23, 42, 0.18)' }],
  },
  glassClose: {
    position: 'absolute', top: 0, right: 12, zIndex: 2, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[100],
  },
  close: {
    position: 'absolute', top: -52, right: 14, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.62)',
  },
  head: { flexDirection: 'row', gap: 14, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 },
  thumb: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: t.neutral[100] },
  thumbImg: { width: '100%', height: '100%' },
  headInfo: { flex: 1, minWidth: 0, justifyContent: 'flex-end', gap: 4 },
  price: { fontSize: 24, lineHeight: 26.4, ...font(500), color: t.accent[500] },
  priceUnit: { fontSize: 14 },
  stock: { alignSelf: 'flex-start', paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6, backgroundColor: t.primary[50] },
  stockText: { fontSize: 12, lineHeight: 19.2, ...font(400), color: t.primary[700] },
  stockLow: { backgroundColor: t.orange[100] },
  stockLowText: { color: t.orange[700] },
  stockOut: { backgroundColor: t.danger[50] },
  stockOutText: { color: t.danger[700] },
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
  optionOn: { borderColor: t.accent[500], backgroundColor: t.accent[50] },
  optionThumb: { width: 44, height: 44, marginBottom: 2, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  optionError: { borderColor: t.danger[300] },
  optionSoldOut: { opacity: 0.5 },
  optionText: { fontSize: 13.5, lineHeight: 16.875, ...font(400), color: t.neutral[800], textAlign: 'center' },
  optionTextOn: { color: t.accent[600] },
  optionPrice: { fontSize: 12, lineHeight: 15, ...font(400), color: t.neutral[500] },
  optionSoldOutText: { fontSize: 11.5, lineHeight: 14.4, ...font(400), color: t.danger[700] },
  error: { marginTop: 6, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.danger[600] },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16 },
  qtyTitle: { marginBottom: 0 },
  qty: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10 },
  qtyBtn: { width: 38, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: t.neutral[50] },
  qtyInput: {
    width: 48, height: 46, padding: 0, borderLeftWidth: 1, borderRightWidth: 1, borderColor: t.neutral[200],
    fontSize: 15, ...font(400), color: t.neutral[900], textAlign: 'center', backgroundColor: t.neutral[0], outlineStyle: 'none',
  },
  note: { marginTop: 6, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500], textAlign: 'right' },
  foot: { paddingTop: 10, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.neutral[150] },
  confirm: { height: 50, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accent[500] },
  confirmBuy: { backgroundColor: t.primary[600] },
  // Opened for Buy now: Add to cart beside it, the two side by side.
  footSplit: { flexDirection: 'row', gap: 10 },
  confirmSplit: { flex: 1, minWidth: 0 },
  confirmCart: { backgroundColor: t.accent[50], borderWidth: 1.5, borderColor: t.accent[500] },
  cartText: { color: t.accent[600] },
  confirmOff: { opacity: 0.5 },
  confirmText: { fontSize: 16, lineHeight: 18.4, ...font(500), color: t.onBrand },
  confirmSmall: { fontSize: 12, lineHeight: 19.2, ...font(400), color: 'rgba(255,255,255,0.9)' },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
