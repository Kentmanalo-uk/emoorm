import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowSquareOutIcon, CheckIcon, CopyIcon, QrCodeIcon, UploadSimpleIcon,
} from 'phosphor-react-native';
import { resolveImg } from '../../lib/media';
import { toast } from '../../lib/toast';
import { uploadImage } from '../../lib/upload';
import { font, t } from '../../theme';
import { peso } from './orderProgress';
import { OrderButton } from './OrderBits';
import copyText from './copyText';

const QR_METHODS = {
  GCASH: { label: 'GCash', numberLabel: 'GCash number' },
  QRPH: { label: 'QR Ph', numberLabel: 'Account number' },
};
const qrMethod = (key) => QR_METHODS[key] || QR_METHODS.GCASH;
export const formatAccountNumber = (value) => {
  const text = String(value ?? '');
  return /^09\d{9}$/.test(text) ? `${text.slice(0, 4)} ${text.slice(4, 7)} ${text.slice(7)}` : text;
};

// Same reference rule the server applies.
const PAYMENT_REFERENCE_RE = /^[A-Za-z0-9 -]{4,64}$/;
const GCASH_LINK = 'gcash://';
const GCASH_ANDROID = 'intent://com.mynt.gcash#Intent;scheme=gcash;package=com.globe.gcash.android;end';

/**
 * Paying a confirmed QR order, or sending a new proof, under the order card
 * (Orders.jsx .order-proof-form): how to pay (PayPanel / GcashPhonePay), the
 * reference, the screenshot, Cancel and "I have paid" / "Submit proof".
 */
export default function OrderPayForm({ order, apiClient, onDone, onCancel }) {
  const [reference, setReference] = useState(order.paymentReference || '');
  const [url, setUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // undefined while loading, null when it could not load.
  const [store, setStore] = useState(undefined);

  useEffect(() => {
    let live = true;
    const storeId = order.storeId || order.store?.id;
    if (!storeId) return undefined;
    apiClient.get(`/stores/${storeId}`)
      .then((res) => { if (live) setStore(res.data || null); })
      .catch(() => { if (live) setStore(null); });
    return () => { live = false; };
  }, [order.id, order.storeId, order.store?.id, apiClient]);

  const pickProof = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      const res = await uploadImage(result.assets[0]);
      setUrl(res.url);
      toast.success('Proof uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    const ref = reference.trim();
    if (!PAYMENT_REFERENCE_RE.test(ref)) {
      toast.error('Reference must be 4–64 letters, numbers, spaces or dashes.');
      return;
    }
    if (!url) {
      toast.error('Upload your payment proof screenshot.');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.patch(`/orders/${order.id}/proof`, { paymentReference: ref, paymentProofUrl: url });
      toast.success('Payment sent. The seller will check it and then prepare your order.');
      onDone?.();
    } catch (err) {
      toast.error(err.message || 'Failed to submit payment proof');
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      {order.paymentStatus !== 'PENDING_VERIFICATION' ? <PayPanel order={order} store={store} /> : null}
      <Text style={styles.hint}>
        {order.paymentStatus === 'FAILED'
          ? 'Your previous proof was rejected. Pay if you haven\'t, then enter the reference from your payment app and upload a clear screenshot.'
          : order.paymentStatus === 'PENDING'
            ? 'After paying, enter the reference number from your payment app and upload a screenshot of the payment.'
            : 'Replace the reference and screenshot you submitted; the seller will verify the new one.'}
      </Text>
      <View style={styles.fields}>
        <TextInput
          style={styles.input}
          placeholder="Reference / transaction ID"
          placeholderTextColor={t.neutral[400]}
          value={reference}
          onChangeText={setReference}
          maxLength={64}
          autoCapitalize="characters"
        />
        {url ? (
          <View style={styles.preview}>
            <Image source={{ uri: resolveImg(url) }} style={styles.previewImg} accessibilityLabel="Payment proof" />
            <OrderButton label="Remove" onPress={() => setUrl('')} style={styles.inline} />
          </View>
        ) : (
          <OrderButton
            label={uploading ? 'Uploading…' : 'Upload screenshot'}
            Icon={UploadSimpleIcon}
            busy={uploading}
            onPress={pickProof}
            style={styles.inline}
          />
        )}
      </View>
      <View style={styles.actions}>
        <OrderButton label="Cancel" onPress={onCancel} disabled={submitting} style={styles.inline} />
        <OrderButton
          primary
          label={submitting ? 'Submitting…' : order.paymentStatus === 'PENDING' ? 'I have paid' : 'Submit proof'}
          busy={submitting}
          disabled={uploading}
          onPress={submit}
          style={styles.inline}
        />
      </View>
    </View>
  );
}

/** How to pay: the shop's QR and account with the amount, or GCash on a phone. */
function PayPanel({ order, store }) {
  if (store === undefined) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size={16} color={t.neutral[500]} />
        <Text style={styles.muted}>Loading the shop&apos;s QR…</Text>
      </View>
    );
  }
  if (!store?.paymentQrImage) {
    return (
      <Text style={[styles.muted, styles.missing]}>
        The shop&apos;s QR isn&apos;t available right now. Message the seller to ask how to pay {peso(order.total)}.
      </Text>
    );
  }
  const method = qrMethod(store.paymentQrType);
  if (store.paymentQrType === 'GCASH' && store.paymentAccountNumber) {
    return (
      <GcashPay
        amount={peso(order.total)}
        number={store.paymentAccountNumber}
        accountName={store.paymentAccountName}
        qrImage={resolveImg(store.paymentQrImage)}
        instructions={store.paymentInstructions}
      />
    );
  }
  return (
    <View style={styles.panel}>
      <Image source={{ uri: resolveImg(store.paymentQrImage) }} style={styles.qr} resizeMode="contain" accessibilityLabel={`${store.name || 'Shop'} ${method.label} QR code`} />
      <View>
        <Text style={styles.h4}>Scan to pay {peso(order.total)}</Text>
        <Text style={styles.sub}>with {method.label}, to {store.name || 'the shop'}</Text>
        {store.paymentAccountName ? (
          <View style={styles.payee}><Text style={styles.dt}>Account name</Text><Text style={styles.dd}>{store.paymentAccountName}</Text></View>
        ) : null}
        {store.paymentAccountNumber ? (
          <View style={styles.payee}>
            <Text style={styles.dt}>{method.numberLabel}</Text>
            <Text selectable style={styles.dd}>{formatAccountNumber(store.paymentAccountNumber)}</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.copySmall}
              onPress={async () => {
                if (await copyText(store.paymentAccountNumber)) toast.success('Number copied');
                else toast.error('Could not copy. Select the number and copy it instead.');
              }}
            >
              <CopyIcon size={13} color={t.neutral[700]} />
              <Text style={styles.copySmallText}>Copy</Text>
            </Pressable>
          </View>
        ) : null}
        {store.paymentInstructions ? <Text style={styles.note}>{store.paymentInstructions}</Text> : null}
      </View>
    </View>
  );
}

/** Phones paying a GCash shop by hand (checkout/GcashPhonePay.jsx). */
function GcashPay({ amount, number, accountName, qrImage, instructions }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(number))) {
      toast.error('Could not copy. Press and hold the number to copy it.');
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };
  const open = () => {
    const link = Platform.OS === 'android' ? GCASH_ANDROID : GCASH_LINK;
    Linking.openURL(link).catch(() => toast.error(`GCash didn't open? Open the GCash app yourself and send ${amount} to the number above.`));
  };

  return (
    <View style={styles.gc}>
      <Text style={styles.gcTitle} accessibilityRole="header">Pay with GCash</Text>
      <View style={styles.gcPayee}>
        <Text style={styles.gcSend}>Send <Text style={styles.gcStrong}>{amount}</Text> to</Text>
        <View style={styles.gcNumber}>
          <Text selectable style={styles.gcDigits}>{formatAccountNumber(number)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'GCash number copied' : 'Copy GCash number'}
            onPress={copy}
            style={[styles.gcCopy, copied && styles.gcCopied]}
          >
            {copied ? <CheckIcon size={16} weight="bold" color={t.primary[700]} /> : <CopyIcon size={16} color={t.accent[600]} />}
            <Text style={[styles.gcCopyText, copied && { color: t.primary[700] }]}>{copied ? 'Copied' : 'Copy'}</Text>
          </Pressable>
        </View>
        {accountName ? (
          <View style={styles.gcName}>
            <Text style={styles.gcNameLabel}>Account Name</Text>
            <Text style={styles.gcNameValue}>{accountName}</Text>
          </View>
        ) : null}
      </View>
      <Pressable accessibilityRole="link" onPress={open} style={({ pressed }) => [styles.gcOpen, pressed && { backgroundColor: '#0066d6' }]}>
        <Text style={styles.gcOpenText}>Open GCash</Text>
        <ArrowSquareOutIcon size={18} weight="bold" color="#fff" />
      </Pressable>
      <Text style={styles.gcNote}>After paying, return to E-MOORM to submit your payment reference and screenshot.</Text>
      {instructions ? <Text style={styles.gcInstructions}>{instructions}</Text> : null}
      {qrImage ? (
        <View>
          <Pressable accessibilityRole="button" onPress={() => setShowQr((v) => !v)} style={styles.gcQrToggle}>
            <QrCodeIcon size={16} color={t.accent[600]} />
            <Text style={styles.gcQrToggleText}>Show the shop&apos;s QR code</Text>
          </Pressable>
          {showQr ? <Image source={{ uri: qrImage }} style={styles.gcQr} resizeMode="contain" accessibilityLabel="The shop's GCash QR code" /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 10, paddingHorizontal: 20, paddingBottom: 16, borderTopWidth: 1, borderTopColor: t.neutral[100], backgroundColor: t.neutral[0],
  },
  hint: { marginTop: 12, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[600] },
  fields: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  input: {
    flexGrow: 1, flexBasis: 220, paddingVertical: 9, paddingHorizontal: 12, fontSize: 14, ...font(400),
    borderWidth: 1, borderColor: t.neutral[300], backgroundColor: t.neutral[0], color: t.neutral[900],
  },
  inline: { paddingHorizontal: 16 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewImg: { width: 48, height: 48, borderWidth: 1, borderColor: t.neutral[200] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },

  loading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  muted: { fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[600] },
  missing: { marginTop: 12 },
  panel: { gap: 16, marginTop: 12, padding: 14, backgroundColor: t.neutral[50], borderWidth: 1, borderColor: t.neutral[200] },
  qr: { alignSelf: 'center', width: 220, maxWidth: '100%', aspectRatio: 1, padding: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: t.neutral[200] },
  h4: { fontSize: 16, lineHeight: 24, ...font(500), color: t.neutral[900] },
  sub: { marginTop: 2, marginBottom: 10, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[600] },
  payee: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4, marginBottom: 6 },
  dt: { minWidth: 96, fontSize: 13, ...font(400), color: t.neutral[500] },
  dd: { fontSize: 13, ...font(500), color: t.neutral[900] },
  copySmall: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2, paddingHorizontal: 8, borderWidth: 1, borderColor: t.neutral[300], backgroundColor: '#fff' },
  copySmallText: { fontSize: 12, ...font(500), color: t.neutral[700] },
  note: { marginTop: 10, fontSize: 13, lineHeight: 20.8, ...font(400), color: t.neutral[600] },

  gc: { gap: 14, marginTop: 12, padding: 16, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 12, backgroundColor: t.neutral[50] },
  gcTitle: { fontSize: 16, lineHeight: 24, ...font(500), color: t.neutral[900] },
  gcPayee: { gap: 10, padding: 14, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 10, backgroundColor: t.neutral[0] },
  gcSend: { fontSize: 14, lineHeight: 22.4, ...font(400), color: t.neutral[600] },
  gcStrong: { ...font(500), color: t.neutral[900] },
  gcNumber: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  gcDigits: { flexShrink: 1, fontSize: 22, lineHeight: 32, letterSpacing: 0.44, ...font(500), color: t.neutral[900] },
  gcCopy: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 999, backgroundColor: t.neutral[0],
  },
  gcCopied: { borderColor: t.primary[200], backgroundColor: t.primary[50] },
  gcCopyText: { fontSize: 14, ...font(500), color: t.accent[600] },
  gcName: { gap: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.neutral[100] },
  gcNameLabel: { fontSize: 12.5, ...font(400), color: t.neutral[500] },
  gcNameValue: { fontSize: 15, ...font(500), color: t.neutral[900] },
  gcOpen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 999, backgroundColor: '#007cff' },
  gcOpenText: { fontSize: 16, ...font(500), color: '#fff' },
  gcNote: { fontSize: 13.5, lineHeight: 20.25, ...font(400), color: t.neutral[600] },
  gcInstructions: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, backgroundColor: t.neutral[0], fontSize: 13, lineHeight: 18.85, ...font(400), color: t.neutral[700] },
  gcQrToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  gcQrToggleText: { fontSize: 13.5, ...font(500), color: t.accent[600] },
  gcQr: { alignSelf: 'center', width: 200, maxWidth: '100%', aspectRatio: 1, marginTop: 10, padding: 8, borderWidth: 1, borderColor: t.neutral[200], borderRadius: 8, backgroundColor: t.neutral[0] },
});
