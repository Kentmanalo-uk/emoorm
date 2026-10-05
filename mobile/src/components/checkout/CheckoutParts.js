import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircleIcon, ClockCountdownIcon, StorefrontIcon, TruckIcon, WarningIcon,
} from 'phosphor-react-native';
import CartProductImage from '../cart/CartProductImage';
import { cartPeso as peso } from '../cart/cartSettings';
import { font, t } from '../../theme';

/*
 * The pieces of the phone checkout (web/src/pages/Checkout.jsx with
 * Checkout.css "Phone checkout" .co-phone rules): flat white panels on a grey
 * page, each with a 17px title, the saved-address list, the form fields, the
 * per-shop status boxes, the items card, the summary and the bottom bar.
 */

/** A flat white panel with its title (.co-phone .checkout-section). */
export function CheckoutSection({ title, children, onLayout, style }) {
  return (
    <View style={[styles.section, style]} onLayout={onLayout}>
      {title ? <Text style={styles.sectionTitle} accessibilityRole="header">{title}</Text> : null}
      {children}
    </View>
  );
}

/** The browser's radio with the phone checkout's pink accent colour. */
function Radio({ checked }) {
  return (
    <View style={[styles.radio, checked && styles.radioOn]}>
      {checked ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

/** Saved addresses, then "Enter a different address" (.saved-address-picker). */
export function CheckoutSavedAddresses({ addresses, selectedId, onPick, onManual }) {
  return (
    <View style={styles.saved}>
      {addresses.map((addr) => {
        const on = selectedId === addr.id;
        return (
          <Pressable
            key={addr.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onPick(addr)}
            style={[styles.savedOption, on && styles.savedOptionOn]}
          >
            <Radio checked={on} />
            <View style={styles.savedBody}>
              <View style={styles.savedNameRow}>
                <Text style={styles.savedName}>{addr.label ? `${addr.label} — ` : ''}{addr.fullName}</Text>
                {addr.isDefault ? <View style={styles.defaultTag}><Text style={styles.defaultTagText}>Default</Text></View> : null}
              </View>
              <Text style={styles.savedLine}>
                {addr.street}, {addr.barangay}, {addr.municipality?.name}, {addr.province || 'Oriental Mindoro'}
              </Text>
              <Text style={styles.savedPhone}>{addr.contactNumber}</Text>
            </View>
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selectedId === null }}
        onPress={onManual}
        style={[styles.savedOption, selectedId === null && styles.savedOptionOn]}
      >
        <Radio checked={selectedId === null} />
        <View style={styles.savedBody}>
          <Text style={styles.savedName}>Enter a different address</Text>
          <Text style={styles.savedLine}>Use a one-off address for this order</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** A labelled text field (.form-group .form-label .form-input). */
export function CheckoutField({ label, value, onChangeText, placeholder, error, keyboardType, autoComplete }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#757575"
        keyboardType={keyboardType}
        autoComplete={autoComplete}
        accessibilityLabel={label}
        style={[styles.input, error && styles.inputError]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

/** A shop's status line (.store-status ok / bad), with an optional button under it. */
export function CheckoutStatus({ tone = 'ok', Icon, title, lines = [], note, action, style }) {
  const bad = tone === 'bad';
  const color = bad ? t.danger[800] : t.primary[800];
  const Glyph = Icon || (bad ? WarningIcon : CheckCircleIcon);
  return (
    <View style={[styles.status, bad ? styles.statusBad : styles.statusOk, style]} accessibilityRole={bad ? 'alert' : undefined}>
      <Glyph size={16} color={color} style={styles.statusIcon} />
      <View style={styles.statusBody}>
        <Text style={[styles.statusTitle, { color }]}>{title}</Text>
        {lines.filter(Boolean).map((line) => (
          <Text key={line} style={[styles.statusText, { color }]}>{line}</Text>
        ))}
        {note ? <Text style={[styles.statusText, styles.statusNote, { color }]}>{note}</Text> : null}
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} disabled={action.disabled} style={styles.statusBtn}>
            <Text style={styles.statusBtnText}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const variationText = (item) => (item.selectedVariations && Object.keys(item.selectedVariations).length
  ? Object.entries(item.selectedVariations).map(([name, value]) => `${name}: ${value}`).join(', ')
  : '');

/** One shop's lines and its delivery fee row (.co-m-store). */
export function CheckoutStoreItems({ storeName, items, pickup, shipLabel, shipAmount, first }) {
  return (
    <View style={!first && styles.storeNext}>
      <View style={styles.storeHead}>
        <StorefrontIcon size={18} color={t.neutral[900]} />
        <Text style={styles.storeName} numberOfLines={1}>{storeName}</Text>
      </View>
      {items.map((item) => {
        const variation = variationText(item);
        return (
          <View key={item.id} style={[styles.item, item.unavailable && styles.itemOff]}>
            <View style={styles.itemImg}>
              <CartProductImage src={item.image || item.images?.[0]} />
            </View>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
              {variation ? <Text style={styles.itemVar}>{variation}</Text> : null}
              {item.unavailable ? (
                <Text style={styles.itemBad}>{item.unavailableReason || 'Unavailable'}</Text>
              ) : (
                <View style={styles.itemRow}>
                  <Text style={styles.itemPrice}>{peso(item.price)}</Text>
                  <Text style={styles.itemQty}>×{item.quantity}</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
      <View style={styles.ship}>
        <View style={styles.shipLeft}>
          {pickup ? <StorefrontIcon size={16} color={t.neutral[800]} /> : <TruckIcon size={16} color={t.neutral[800]} />}
          <Text style={styles.shipText}>{shipLabel}</Text>
        </View>
        <Text style={styles.shipText}>{shipAmount}</Text>
      </View>
    </View>
  );
}

/** "Pay after the seller confirms your order" (.co-pay-later). */
export function CheckoutPayLater({ shopName, total, methodLabel }) {
  return (
    <View style={styles.payLater} accessibilityRole="text">
      <ClockCountdownIcon size={22} weight="fill" color={t.primary[600]} style={styles.payLaterIcon} />
      <View style={styles.payLaterBody}>
        <Text style={styles.payLaterTitle}>Pay after the seller confirms your order</Text>
        <Text style={styles.payLaterText}>
          Nothing to pay now. When {shopName || 'the shop'} confirms your order, we&apos;ll notify you
          and it moves to <Text style={styles.bold}>To Pay</Text> in My Orders. Pay {peso(total)} there with the shop&apos;s {methodLabel || 'QR'},
          then send your reference number and screenshot. The seller checks the payment and prepares your order.
        </Text>
      </View>
    </View>
  );
}

/** Order Summary with the voucher field (.checkout-summary). */
export function CheckoutSummary({
  itemCount, subtotal, shipLabel, shipAmount, voucher, discountAmount, total,
  voucherInput, onVoucherInput, voucherLoading, onApply, onRemove,
}) {
  const canApply = !voucherLoading && Boolean(voucherInput.trim()) && subtotal !== 0;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, styles.summaryTitle]} accessibilityRole="header">Order Summary</Text>
      <View style={styles.row}>
        <Text style={styles.rowText}>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'items'})</Text>
        <Text style={styles.rowText}>{peso(subtotal)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowText}>{shipLabel}</Text>
        <Text style={styles.rowText}>{shipAmount}</Text>
      </View>
      {voucher && discountAmount > 0 ? (
        <View style={styles.row}>
          <Text style={[styles.rowText, styles.rowGreen]}>Voucher ({voucher.voucher.code})</Text>
          <Text style={[styles.rowText, styles.rowGreen]}>-{peso(discountAmount)}</Text>
        </View>
      ) : null}
      <View style={styles.divider} />
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalAmount}>{peso(total)}</Text>
      </View>

      <View style={styles.voucher}>
        <Text style={styles.voucherLabel}>Voucher</Text>
        <View style={styles.voucherRow}>
          <TextInput
            value={voucherInput}
            onChangeText={(text) => onVoucherInput(text.toUpperCase())}
            placeholder="Enter code"
            placeholderTextColor="#757575"
            autoCapitalize="characters"
            editable={!voucherLoading && !voucher}
            accessibilityLabel="Voucher"
            style={[styles.voucherInput, (voucherLoading || voucher) && styles.voucherInputOff]}
          />
          {voucher ? (
            <Pressable accessibilityRole="button" onPress={onRemove} style={[styles.voucherBtn, styles.voucherBtnBack]}>
              <Text style={[styles.voucherBtnText, styles.voucherBtnTextBack]}>Remove</Text>
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
              disabled={!canApply}
              onPress={onApply}
              style={[styles.voucherBtn, !canApply && styles.voucherBtnOff]}
            >
              <Text style={styles.voucherBtnText}>{voucherLoading ? '…' : 'Apply'}</Text>
            </Pressable>
          )}
        </View>
        {voucher ? <Text style={styles.voucherNote}>{voucher.voucher.description || 'Voucher applied'}</Text> : null}
      </View>
    </View>
  );
}

/** The bottom bar: voucher saving, Total (n items) and Place Order (.co-m-bar). */
export function CheckoutBar({ saving, itemCount, total, busy, label, disabled, onPress }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.bar}>
      {saving ? <Text style={styles.saving}>{saving}</Text> : null}
      <View style={[styles.barRow, { paddingBottom: 10 + insets.bottom }]}>
        <View style={styles.barTotal}>
          <Text style={styles.barTotalText}>Total ({itemCount} {itemCount === 1 ? 'item' : 'items'})</Text>
          <Text style={styles.barTotalAmount}>{peso(total)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
          disabled={disabled}
          onPress={onPress}
          style={[styles.cta, disabled && styles.ctaOff]}
        >
          {busy ? <ActivityIndicator size={18} color="#fff" /> : null}
          <Text style={styles.ctaText}>{label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "Order Placed Successfully!" (.order-success-card). */
export function CheckoutSuccess({ orderId, payLater, onReceipt, onOrders, onShop }) {
  return (
    <View style={styles.success}>
      <CheckCircleIcon size={64} color={t.primary[600]} />
      <Text style={styles.successText}>Thank you for your order. Your order has been received and is being processed.</Text>
      {payLater ? (
        <View style={styles.successNext}>
          <ClockCountdownIcon size={18} weight="fill" color={t.primary[600]} style={styles.successNextIcon} />
          <Text style={styles.successNextText}>
            No payment yet. Once the seller confirms your order, we&apos;ll notify you and it moves to <Text style={styles.bold}>To Pay</Text> in My Orders, where you pay with the shop&apos;s QR.
          </Text>
        </View>
      ) : null}
      {orderId ? (
        <View style={styles.reference}>
          <Text style={styles.referenceText}><Text style={styles.bold}>Order ID:</Text> {orderId}</Text>
        </View>
      ) : null}
      <View style={styles.successActions}>
        {orderId ? (
          <Pressable accessibilityRole="link" onPress={onReceipt} style={[styles.successBtn, styles.successBtnPrimary]}>
            <Text style={styles.successBtnText}>View Receipt</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" onPress={onOrders} style={[styles.successBtn, styles.successBtnPrimary]}>
          <Text style={styles.successBtnText}>My Orders</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={onShop} style={[styles.successBtn, styles.successBtnOutline]}>
          <Text style={[styles.successBtnText, styles.successBtnTextOutline]}>Continue Shopping</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: 16, backgroundColor: t.neutral[0] },
  sectionTitle: { marginBottom: 12, fontSize: 17, lineHeight: 19.55, ...font(500), color: t.neutral[900] },
  summaryTitle: { marginBottom: 8, paddingBottom: 12 },
  bold: font(500),

  saved: { gap: 10, marginBottom: 17 },
  savedOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 12,
    backgroundColor: t.neutral[0],
  },
  savedOptionOn: { borderColor: t.accent[500], backgroundColor: t.accent[50] },
  radio: {
    width: 18,
    height: 18,
    marginTop: 3,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#767676',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  radioOn: { borderWidth: 2, borderColor: t.accent[500] },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent[500] },
  savedBody: { flex: 1, minWidth: 0 },
  savedName: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  savedNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8 },
  defaultTag: { paddingVertical: 2, paddingHorizontal: 8, backgroundColor: t.success[100] },
  defaultTagText: { fontSize: 11, lineHeight: 17.6, ...font(500), color: t.primary[600] },
  savedLine: { marginTop: 4, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[500] },
  savedPhone: { marginTop: 4, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.neutral[500] },

  group: { marginBottom: 14, gap: 6 },
  label: { fontSize: 12.5, lineHeight: 20, ...font(600), color: t.neutral[700] },
  input: {
    height: 48,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: t.neutral[200],
    borderRadius: 8,
    backgroundColor: t.neutral[0],
    fontSize: 13.5,
    ...font(400),
    color: t.neutral[900],
  },
  inputError: { borderColor: t.danger[600] },
  error: { marginTop: -2, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.danger[600] },

  status: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  statusOk: { borderColor: t.primary[200], backgroundColor: t.success[50] },
  statusBad: { borderColor: t.danger[200], backgroundColor: t.danger[50] },
  statusIcon: { marginTop: 2 },
  statusBody: { flex: 1, minWidth: 0 },
  statusTitle: { fontSize: 13, lineHeight: 20.8, ...font(500) },
  statusText: { marginTop: 2, fontSize: 12, lineHeight: 19.2, ...font(400) },
  statusNote: { fontStyle: 'italic' },
  statusBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: t.neutral[300],
    backgroundColor: '#fff',
  },
  statusBtnText: { fontSize: 12, lineHeight: 19.2, ...font(500), color: t.neutral[700] },

  storeNext: { marginTop: 16 },
  storeHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  storeName: { flexShrink: 1, fontSize: 16, lineHeight: 25.6, ...font(400), color: t.neutral[900] },
  item: { flexDirection: 'row', gap: 12, paddingTop: 6, paddingBottom: 12 },
  itemOff: { opacity: 0.55 },
  itemImg: { width: 84, height: 84, borderRadius: 8, overflow: 'hidden', backgroundColor: t.neutral[100] },
  itemInfo: { flex: 1, minWidth: 0, gap: 4 },
  itemName: { fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[900] },
  itemVar: { fontSize: 13.5, lineHeight: 21.6, ...font(400), color: t.neutral[500] },
  itemBad: { fontSize: 13, lineHeight: 20.8, ...font(400), color: '#dc2626' },
  itemRow: { marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemPrice: { fontSize: 16, lineHeight: 25.6, ...font(400), color: t.accent[500] },
  itemQty: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[600] },
  ship: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: t.primary[50],
  },
  shipLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  shipText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[800] },

  payLater: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    // 16px on the website, collapsing with the payment list's 8px margin.
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: t.primary[100],
    backgroundColor: t.primary[50],
  },
  payLaterIcon: { marginTop: 1 },
  payLaterBody: { flex: 1, minWidth: 0 },
  payLaterTitle: { marginBottom: 4, fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[900] },
  payLaterText: { fontSize: 13, lineHeight: 19.5, ...font(400), color: t.neutral[700] },

  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  rowText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700] },
  rowGreen: { color: t.primary[600] },
  divider: { height: 1, marginVertical: 8, backgroundColor: t.neutral[200] },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  totalLabel: { fontSize: 15, lineHeight: 24, ...font(500), color: t.neutral[900] },
  totalAmount: { fontSize: 18, lineHeight: 28.8, ...font(500), color: t.neutral[900] },
  voucher: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.neutral[200] },
  voucherLabel: { marginBottom: 6, fontSize: 13, lineHeight: 20.8, ...font(600), color: t.neutral[900] },
  voucherRow: { flexDirection: 'row', gap: 6 },
  voucherInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: t.neutral[300],
    borderRadius: 8,
    backgroundColor: '#fff',
    fontSize: 16,
    ...font(400),
    color: '#000',
  },
  voucherInputOff: { backgroundColor: 'rgba(239, 239, 239, 0.3)', color: t.neutral[500] },
  voucherBtn: {
    height: 46,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.primary[600],
  },
  voucherBtnOff: { backgroundColor: t.neutral[400] },
  voucherBtnBack: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff' },
  voucherBtnText: { fontSize: 13, lineHeight: 15.6, ...font(500), color: '#fff' },
  voucherBtnTextBack: { color: t.neutral[700] },
  voucherNote: { marginTop: 6, fontSize: 12, lineHeight: 19.2, ...font(400), color: t.primary[600] },

  bar: {
    backgroundColor: '#fff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 12,
  },
  saving: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: t.accent[50], color: t.accent[600], fontSize: 13, lineHeight: 20.8, ...font(400) },
  barRow: { gap: 8, paddingTop: 10, paddingHorizontal: 16 },
  barTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  barTotalText: { fontSize: 16, lineHeight: 25.6, ...font(400), color: t.neutral[900] },
  barTotalAmount: { fontSize: 20, lineHeight: 32, ...font(500), color: t.accent[500] },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 999,
    backgroundColor: t.accent[500],
  },
  ctaOff: { opacity: 0.5 },
  ctaText: { fontSize: 16, lineHeight: 19.2, ...font(500), color: '#fff' },

  // The phone shell lifts the card's h1 into the back bar (the screen's
  // title), so the card starts with the icon.
  success: {
    alignItems: 'center',
    gap: 14,
    marginTop: 20,
    marginBottom: 12,
    marginHorizontal: 12,
    paddingVertical: 28,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  successText: { alignSelf: 'stretch', fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[500], textAlign: 'center' },
  successNext: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    alignSelf: 'stretch',
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: t.primary[50],
  },
  successNextIcon: { marginTop: 2 },
  successNextText: { flex: 1, fontSize: 14, lineHeight: 21, ...font(400), color: t.neutral[700] },
  reference: { alignSelf: 'stretch', paddingVertical: 10.5, paddingHorizontal: 17.5, borderRadius: 8, backgroundColor: t.neutral[100] },
  referenceText: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[700], textAlign: 'center' },
  successActions: { alignSelf: 'stretch', gap: 8, marginTop: 14 },
  successBtn: { minHeight: 48, paddingHorizontal: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  successBtnPrimary: { backgroundColor: t.primary[600] },
  successBtnOutline: { borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff' },
  successBtnText: { fontSize: 15, lineHeight: 24, ...font(500), color: '#fff' },
  successBtnTextOutline: { color: t.neutral[700] },
});
