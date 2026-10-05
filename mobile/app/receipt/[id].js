import { useEffect, useState } from 'react';
import {
  Image, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeftIcon, PrinterIcon } from 'phosphor-react-native';
import apiClient from '../../src/api/client';
import { resolveImg } from '../../src/lib/media';
import { toast } from '../../src/lib/toast';
import LoadingSkeleton from '../../src/components/LoadingSkeleton';
import { font, t } from '../../src/theme';
import { peso, receiptDate, trackingLink } from '../../src/components/orders/orderProgress';

/*
 * The order receipt (web/src/pages/OrderReceipt.jsx + OrderReceipt.css at
 * phone size): Back and Print on a grey page, then the paper: brand, OFFICIAL
 * RECEIPT, seller and buyer, the order facts, the item table, the totals,
 * the payment proof, notes, signature lines and the footer.
 *
 * The paper is set in the system face (the website's 'Segoe UI', system-ui)
 * with real bold weights; the toolbar keeps the app's DM Sans.
 */

const BRAND_ICON = require('../../assets/brand-icon.png');

const SYSTEM = Platform.select({ web: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, Roboto, "Noto Sans", sans-serif', default: undefined });
const MONO = Platform.select({ web: '"Courier New", monospace', ios: 'Courier New', default: 'monospace' });

const paymentLabel = (m) => ({
  COD: 'Cash on Delivery / Pickup',
  GCASH: 'GCash (QR)',
  QRPH: 'QR Ph',
  BANK_TRANSFER: 'Bank Transfer',
})[m] || m || '—';

const fulfillmentLabel = (m) => (m === 'PICKUP' ? 'Store Pickup' : 'Delivery');

const statusLabel = (status, fulfillmentMethod) => ({
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PREPARING: 'Preparing',
  READY: fulfillmentMethod === 'PICKUP' ? 'Ready for Pickup' : 'Ready',
  READY_FOR_PICKUP: 'Ready for Pickup',
  TO_SHIP: 'To Ship',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  PICKED_UP: 'Picked Up',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
})[status] || status || '—';

const paymentStatusLabel = (order) => ({
  PENDING: order.paymentMethod === 'COD' ? 'Unpaid' : 'Awaiting payment',
  PENDING_VERIFICATION: 'Awaiting verification',
  PAID: 'Paid',
  FAILED: 'Proof rejected — resubmit',
  EXPIRED: 'Expired',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
})[order.paymentStatus] || order.paymentStatus || '—';

// The admin's app logo (App settings), asked for once per app run.
let logoAsked = null;
let logoValue = null;
const loadLogo = () => {
  logoAsked = logoAsked || apiClient.get('/app-settings')
    .then((res) => { logoValue = res?.data?.appLogo || null; })
    .catch(() => {});
  return logoAsked;
};

export default function OrderReceipt() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await apiClient.get(`/orders/${id}`);
        if (live) setOrder(res.data);
      } catch (err) {
        if (live) setError(err.message || 'Failed to load order');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [id]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  // The website prints the page (the browser's "Save as PDF" included). The
  // web build does the same; the phone app hands the receipt to the share
  // sheet as text (no print module is installed in the app yet).
  const print = async () => {
    if (Platform.OS === 'web' && typeof globalThis.print === 'function') {
      globalThis.print();
      return;
    }
    if (!order) return;
    try {
      await Share.share({ title: `Receipt ${order.orderNumber || order.id}`, message: receiptText(order) });
    } catch {
      toast.error('Could not share the receipt');
    }
  };

  const toolbar = (
    <View style={styles.toolbar}>
      <Pressable accessibilityRole="link" onPress={goBack} style={styles.back}>
        <CaretLeftIcon size={16} color={t.neutral[600]} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={print} style={({ pressed }) => [styles.printBtn, pressed && styles.printBtnPressed]}>
        <PrinterIcon size={16} color="#fff" />
        <Text style={styles.printText}>Print / Save as PDF</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ReceiptSkeleton />
      </View>
    );
  }
  if (error || !order) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <Text style={styles.loadingText}>{error || 'Order not found'}</Text>
      </View>
    );
  }

  const items = order.items || [];
  // Amounts come straight from the order record, as charged.
  const itemsSubtotal = Number(order.subtotal || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const discountAmount = Number(order.discountAmount || 0);
  const totalAmount = Number(order.total || 0);
  const store = order.store || {};
  const buyer = order.buyer || {};
  const orderNumber = order.orderNumber || order.id;

  const meta = [
    ['Order Date', receiptDate(order.createdAt)],
    ['Fulfillment', fulfillmentLabel(order.fulfillmentMethod)],
    ['Payment', paymentLabel(order.paymentMethod)],
    order.paymentReference ? ['Reference', order.paymentReference] : null,
    ['Payment Status', paymentStatusLabel(order)],
    ['Status', statusLabel(order.status, order.fulfillmentMethod)],
    order.trackingNumber ? ['Courier', order.courier?.name || order.courierName] : null,
    order.trackingNumber ? ['Tracking No.', order.trackingNumber, trackingLink(order)] : null,
  ].filter(Boolean);
  const metaRows = [];
  for (let i = 0; i < meta.length; i += 2) metaRows.push(meta.slice(i, i + 2));

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 24 + insets.bottom }]}>
        {toolbar}

        <View style={styles.paper}>
          <View style={styles.header}>
            <View style={styles.brand}>
              <ReceiptLogo />
              <View>
                <Text style={styles.brandName}>EMOORM</Text>
                <Text style={styles.brandSub}>Oriental Mindoro Marketplace</Text>
              </View>
            </View>
            <View>
              <Text style={styles.titleMain}>OFFICIAL RECEIPT</Text>
              <Text style={styles.titleSub}>Order #{orderNumber}</Text>
            </View>
          </View>

          <View style={styles.parties}>
            <View style={styles.party}>
              <Text style={styles.partyHead}>SELLER</Text>
              <Text style={[styles.partyLine, styles.strong]}>{store.name || '—'}</Text>
              {store.owner?.fullName ? <Text style={styles.partyLine}>{store.owner.fullName}</Text> : null}
              {store.address ? <Text style={styles.partyLine}>{store.address}</Text> : null}
              {store.contactNumber ? <Text style={styles.partyLine}>Tel: {store.contactNumber}</Text> : null}
            </View>
            <View style={styles.party}>
              <Text style={styles.partyHead}>BUYER</Text>
              <Text style={[styles.partyLine, styles.strong]}>{buyer.fullName || '—'}</Text>
              {order.contactNumber ? <Text style={styles.partyLine}>Tel: {order.contactNumber}</Text> : null}
              {order.deliveryAddress ? <Text style={styles.partyLine}>{order.deliveryAddress}</Text> : null}
            </View>
          </View>

          <View style={styles.meta}>
            {metaRows.map((row) => (
              <View key={row[0][0]} style={styles.metaRow}>
                {row.map(([label, value, link]) => (
                  <View key={label} style={styles.metaCell}>
                    <Text style={styles.metaLabel}>{label.toUpperCase()}</Text>
                    <Text style={styles.metaValue}>{value}</Text>
                    {link ? (
                      <Text accessibilityRole="link" onPress={() => Linking.openURL(link).catch(() => {})} style={styles.trackLink}>
                        Track your order here
                      </Text>
                    ) : null}
                  </View>
                ))}
                {row.length === 1 ? <View style={styles.metaCell} /> : null}
              </View>
            ))}
          </View>

          <ReceiptTable items={items} />

          <View style={styles.totals}>
            <TotalsRow label="Items Subtotal" value={peso(itemsSubtotal)} />
            <TotalsRow label={order.fulfillmentMethod === 'PICKUP' ? 'Pickup Fee' : 'Delivery Fee'} value={deliveryFee === 0 ? 'FREE' : peso(deliveryFee)} />
            {discountAmount > 0 ? (
              <TotalsRow label={`Discount${order.voucherCode ? ` (${order.voucherCode})` : ''}`} value={`-${peso(discountAmount)}`} />
            ) : null}
            <TotalsRow label="TOTAL" value={peso(totalAmount)} grand />
          </View>

          {order.paymentProofUrl ? (
            <View style={styles.section}>
              <Text style={styles.sectionHead}>PAYMENT PROOF</Text>
              <ProofImage uri={resolveImg(order.paymentProofUrl)} />
            </View>
          ) : null}

          {order.deliveryNotes ? (
            <View style={styles.section}>
              <Text style={styles.sectionHead}>ORDER NOTES</Text>
              <Text style={styles.notes}>{order.deliveryNotes}</Text>
            </View>
          ) : null}

          <View style={styles.signatures}>
            {['SELLER SIGNATURE', 'BUYER SIGNATURE'].map((label) => (
              <View key={label} style={styles.sig}>
                <View style={styles.sigLine} />
                <Text style={styles.sigLabel}>{label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Thank you for supporting local sellers in Oriental Mindoro.</Text>
            <Text style={[styles.footerText, styles.footerSmall]}>Generated by Emoorm on {receiptDate(new Date())}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/** The admin's logo (48px), or the brand icon. */
function ReceiptLogo() {
  const [value, setValue] = useState(logoValue);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadLogo().then(() => { if (live) setValue(logoValue); });
    return () => { live = false; };
  }, []);
  const uri = value && value !== '/brand-icon.png' && !failed ? resolveImg(value) : null;
  return (
    <Image
      source={uri ? { uri } : BRAND_ICON}
      onError={() => setFailed(true)}
      resizeMode="contain"
      style={styles.logo}
      accessibilityLabel="Emoorm"
    />
  );
}

/**
 * The item table. The website's table sizes its columns to their content:
 * Qty is 36 wide, Unit Price and Subtotal as wide as their widest cell, the
 * item name takes the rest. Each cell reports its text width and the column
 * takes the widest.
 */
function ReceiptTable({ items }) {
  const [widths, setWidths] = useState({ price: 0, total: 0 });
  const measure = (col) => (e) => {
    const w = Math.ceil(e.nativeEvent.layout.width);
    setWidths((cur) => (w > cur[col] ? { ...cur, [col]: w } : cur));
  };
  const col = (key) => (widths[key] ? { width: widths[key] + 8 } : null);

  return (
    <View style={styles.table}>
      <View style={[styles.tr, styles.thead]}>
        <Text style={[styles.th, styles.colName]}>ITEM</Text>
        <Text style={[styles.th, styles.colQty]}>QTY</Text>
        <View style={[styles.cell, col('price')]}><Text onLayout={measure('price')} style={[styles.th, styles.thInCell, styles.nowrap]} numberOfLines={1}>UNIT PRICE</Text></View>
        <View style={[styles.cell, col('total')]}><Text onLayout={measure('total')} style={[styles.th, styles.thInCell, styles.nowrap]} numberOfLines={1}>SUBTOTAL</Text></View>
      </View>
      {items.map((it, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={it.id || i} style={[styles.tr, styles.tbodyRow]}>
          <View style={[styles.td, styles.colName]}>
            <Text style={styles.itemName}>{it.product?.name || it.productName || 'Item'}</Text>
            {it.product?.unit ? <Text style={styles.itemUnit}>per {it.product.unit}</Text> : null}
          </View>
          <Text style={[styles.td, styles.tdText, styles.colQty, styles.center]}>{it.quantity}</Text>
          <View style={[styles.td, styles.right, col('price')]}>
            <Text onLayout={measure('price')} style={[styles.tdText, styles.nowrap]} numberOfLines={1}>{peso(it.price)}</Text>
          </View>
          <View style={[styles.td, styles.right, col('total')]}>
            <Text onLayout={measure('total')} style={[styles.tdText, styles.nowrap]} numberOfLines={1}>{peso(Number(it.price) * Number(it.quantity))}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function TotalsRow({ label, value, grand = false }) {
  return (
    <View style={[styles.totalsRow, grand && styles.totalsGrand]}>
      <Text style={[styles.totalsText, grand && styles.totalsGrandText]}>{label}</Text>
      <Text style={[styles.totalsText, grand && styles.totalsGrandText]}>{value}</Text>
    </View>
  );
}

/** The payment proof at its own shape, as wide as the paper. */
function ProofImage({ uri }) {
  const [ratio, setRatio] = useState(null);
  useEffect(() => {
    if (!uri) return;
    Image.getSize(uri, (w, h) => { if (w && h) setRatio(w / h); }, () => {});
  }, [uri]);
  return <Image source={{ uri }} resizeMode="contain" style={[styles.proof, { aspectRatio: ratio || 0.75 }]} accessibilityLabel="Payment proof" />;
}

/** The website's ReceiptSkeleton: one white card of grey bars. */
function ReceiptSkeleton() {
  return (
    <View style={styles.sk} accessibilityLabel="Loading receipt">
      <View style={styles.skCard}>
        <View style={styles.skSpread}>
          <LoadingSkeleton height={18} width={120} borderRadius={6} />
          <LoadingSkeleton height={12} width={90} borderRadius={6} />
        </View>
        <View style={{ gap: 8 }}>
          <LoadingSkeleton height={11} borderRadius={6} />
          <LoadingSkeleton height={11} borderRadius={6} />
          <LoadingSkeleton height={11} width="68%" borderRadius={6} />
        </View>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.skSpread}>
            <LoadingSkeleton height={12} width="55%" borderRadius={6} />
            <LoadingSkeleton height={12} width={64} borderRadius={6} />
          </View>
        ))}
        <View style={[styles.skSpread, styles.skTotal]}>
          <LoadingSkeleton height={16} width={60} borderRadius={6} />
          <LoadingSkeleton height={16} width={90} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

/** The receipt as plain text, for the phone's share sheet. */
function receiptText(order) {
  const lines = [
    'EMOORM — OFFICIAL RECEIPT',
    `Order #${order.orderNumber || order.id}`,
    '',
    `Seller: ${order.store?.name || '—'}`,
    `Buyer: ${order.buyer?.fullName || '—'}`,
    `Order Date: ${receiptDate(order.createdAt)}`,
    `Fulfillment: ${fulfillmentLabel(order.fulfillmentMethod)}`,
    `Payment: ${paymentLabel(order.paymentMethod)}`,
    `Payment Status: ${paymentStatusLabel(order)}`,
    `Status: ${statusLabel(order.status, order.fulfillmentMethod)}`,
    '',
    ...(order.items || []).map((it) => `${it.quantity} × ${it.product?.name || it.productName || 'Item'} @ ${peso(it.price)} = ${peso(Number(it.price) * Number(it.quantity))}`),
    '',
    `Items Subtotal: ${peso(order.subtotal)}`,
    `${order.fulfillmentMethod === 'PICKUP' ? 'Pickup Fee' : 'Delivery Fee'}: ${Number(order.deliveryFee || 0) === 0 ? 'FREE' : peso(order.deliveryFee)}`,
    Number(order.discountAmount) > 0 ? `Discount${order.voucherCode ? ` (${order.voucherCode})` : ''}: -${peso(order.discountAmount)}` : null,
    `TOTAL: ${peso(order.total)}`,
  ];
  return lines.filter((l) => l !== null).join('\n');
}

const paperText = { fontFamily: SYSTEM, color: t.neutral[900] };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.neutral[100] },
  page: { paddingTop: 8, paddingHorizontal: 12 },
  loadingText: { padding: 40, textAlign: 'center', fontSize: 15, lineHeight: 24, ...font(400), color: t.neutral[500] },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: 8 },
  backText: { fontSize: 14, lineHeight: 22.4, ...font(500), color: t.neutral[600] },
  printBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, borderRadius: 8, backgroundColor: t.primary[600],
  },
  printBtnPressed: { backgroundColor: t.primary[700] },
  printText: { fontSize: 14, lineHeight: 16.8, ...font(600), color: '#fff' },

  paper: {
    paddingVertical: 18, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#fff',
    shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  header: { gap: 12, marginBottom: 16, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: t.neutral[900] },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 48, height: 48 },
  brandName: { ...paperText, fontSize: 20, lineHeight: 32, fontWeight: '700', letterSpacing: 1, color: t.primary[600] },
  brandSub: { ...paperText, fontSize: 12, lineHeight: 19.2, color: t.neutral[500] },
  titleMain: { ...paperText, fontSize: 18, lineHeight: 28.8, fontWeight: '700', letterSpacing: 1.5 },
  titleSub: { marginTop: 4, fontFamily: MONO, fontSize: 13, lineHeight: 20.8, color: t.neutral[500] },

  parties: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  party: { flex: 1, minWidth: 0, paddingBottom: 2 },
  partyHead: { ...paperText, marginBottom: 8, fontSize: 11, lineHeight: 12.65, fontWeight: '600', letterSpacing: 1, color: t.neutral[500] },
  partyLine: { ...paperText, marginTop: 2, fontSize: 13, lineHeight: 18.2 },
  strong: { marginTop: 0, fontWeight: '700' },

  meta: {
    gap: 12, marginBottom: 16, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8, backgroundColor: t.neutral[50],
  },
  metaRow: { flexDirection: 'row', gap: 16 },
  metaCell: { flex: 1, minWidth: 0, gap: 2 },
  metaLabel: { ...paperText, fontSize: 11, lineHeight: 17.6, fontWeight: '600', letterSpacing: 1, color: t.neutral[500] },
  metaValue: { ...paperText, fontSize: 13, lineHeight: 20.8 },
  trackLink: { ...paperText, marginTop: 2, fontSize: 13, lineHeight: 20.8, fontWeight: '600', color: t.primary[600] },

  table: { marginBottom: 20 },
  tr: { flexDirection: 'row', alignItems: 'flex-start' },
  thead: { borderBottomWidth: 2, borderBottomColor: t.neutral[900] },
  th: { ...paperText, paddingVertical: 8, paddingHorizontal: 4, fontSize: 11, lineHeight: 17.6, fontWeight: '700', letterSpacing: 0.5, color: t.neutral[700] },
  cell: { flexShrink: 0, alignItems: 'flex-start', paddingHorizontal: 4 },
  thInCell: { paddingHorizontal: 0 },
  tbodyRow: { borderBottomWidth: 1, borderBottomColor: t.neutral[100] },
  td: { paddingVertical: 10, paddingHorizontal: 4, flexShrink: 0 },
  tdText: { ...paperText, fontSize: 13, lineHeight: 20.8 },
  colName: { flex: 1, minWidth: 0 },
  colQty: { width: 36 },
  center: { textAlign: 'center' },
  right: { alignItems: 'flex-end' },
  nowrap: { flexShrink: 0 },
  itemName: { ...paperText, marginBottom: 4, fontSize: 14, lineHeight: 22.4, fontWeight: '500' },
  itemUnit: { ...paperText, marginTop: 2, fontSize: 11, lineHeight: 17.6, color: t.neutral[500] },

  // Its 8px top margin folds into the table's 20px bottom margin.
  totals: {},
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  totalsText: { ...paperText, fontSize: 14, lineHeight: 22.4, fontVariant: ['tabular-nums'] },
  totalsGrand: { marginTop: 6, paddingTop: 10, borderTopWidth: 2, borderTopColor: t.neutral[900] },
  totalsGrandText: { fontSize: 16, lineHeight: 25.6, fontWeight: '700' },

  section: { marginTop: 28 },
  sectionHead: { ...paperText, marginBottom: 8, fontSize: 12, lineHeight: 13.8, fontWeight: '600', letterSpacing: 1, color: t.neutral[500] },
  proof: { width: '100%', borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8 },
  notes: {
    ...paperText, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, lineHeight: 20.8,
    backgroundColor: t.neutral[50], borderLeftWidth: 3, borderLeftColor: t.primary[600],
  },

  signatures: { flexDirection: 'row', gap: 24, marginTop: 40 },
  sig: { flex: 1, minWidth: 0 },
  sigLine: { height: 1, marginBottom: 6, backgroundColor: t.neutral[900] },
  sigLabel: { ...paperText, fontSize: 11, lineHeight: 17.6, textAlign: 'center', letterSpacing: 1, color: t.neutral[500] },

  footer: { marginTop: 28, paddingTop: 16, borderTopWidth: 1, borderTopColor: t.neutral[200] },
  footerText: { ...paperText, marginTop: 4, textAlign: 'center', fontSize: 12, lineHeight: 19.2, color: t.neutral[500] },
  footerSmall: { marginBottom: 4, fontSize: 11, lineHeight: 17.6 },

  sk: { marginVertical: 16, paddingHorizontal: 12 },
  skCard: { gap: 12, padding: 14, borderRadius: 14, backgroundColor: '#fff' },
  skSpread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  skTotal: { paddingTop: 10, borderTopWidth: 1, borderTopColor: t.neutral[150] },
});
