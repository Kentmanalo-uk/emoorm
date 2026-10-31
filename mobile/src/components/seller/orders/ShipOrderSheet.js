import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  BarcodeIcon, CheckIcon, TruckIcon, XIcon,
} from '../../../lib/icons';
import OrderSheetFrame from '../../orders/OrderSheetFrame';
import { CourierMark } from '../../orders/CourierTracking';
import { toast } from '../../../lib/toast';
import { font, t, themed } from '../../../theme';
import { proofStyles } from './ProofPhotoSheet';

// What a waybill's tracking number looks like once cleaned up.
const cleanTracking = (text) => String(text || '').replace(/[^A-Za-z0-9-]/g, '').toUpperCase().slice(0, 40);
const TRACKING_OK = /^[A-Z0-9-]{6,40}$/;

// Barcodes printed on waybills (J&T, LBC, Flash… use Code 128).
const BARCODE_TYPES = ['code128', 'code39', 'code93', 'codabar', 'itf14', 'ean13', 'qr'];
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

/**
 * The camera reads the waybill's barcode (the website's BarcodeScanner, here
 * with expo-camera's own reader). Calls onRead(text) once, then stops.
 */
function BarcodeScanner({ onRead, onClose }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState('starting'); // starting | scanning | error
  const done = useRef(false);

  useEffect(() => {
    if (!permission) return;
    if (permission.granted) return;
    if (permission.canAskAgain) {
      requestPermission().then((p) => { if (!p.granted) setStatus('error'); }).catch(() => setStatus('error'));
    } else {
      setStatus('error');
    }
  }, [permission, requestPermission]);

  const read = ({ data }) => {
    if (done.current) return;
    const value = cleanTracking(data);
    if (!value) return;
    done.current = true;
    onRead(value);
  };

  const granted = permission?.granted;
  return (
    <View style={styles.scan}>
      {granted ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
          onCameraReady={() => setStatus('scanning')}
          onMountError={() => setStatus('error')}
          onBarcodeScanned={read}
        />
      ) : null}
      {status !== 'error' ? (
        <View pointerEvents="none" style={styles.frameWrap}>
          <View style={styles.frame}><View style={styles.frameLine} /></View>
        </View>
      ) : null}
      <Text style={styles.scanNote} accessibilityLiveRegion="polite">
        {status === 'starting' && 'Starting the camera…'}
        {status === 'scanning' && 'Point the camera at the barcode on the waybill'}
        {status === 'error' && (permission && !permission.granted
          ? 'Allow camera access to scan, or type the number instead.'
          : 'The camera could not start here. Type the tracking number instead.')}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Stop scanning" onPress={onClose} style={styles.scanClose}>
        <XIcon size={18} weight="bold" color="#fff" />
      </Pressable>
    </View>
  );
}

/** A courier to pick (ChoiceCard.css .choice-card with the courier's mark). */
function CourierChoice({ courier, checked, desc, onPress }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={[styles.choice, checked && styles.choiceOn]}
    >
      <CourierMark courier={courier} size={28} />
      <View style={styles.choiceBody}>
        <Text style={styles.choiceTitle}>{courier.name}</Text>
        {desc ? <Text style={styles.choiceDesc}>{desc}</Text> : null}
      </View>
      <View style={[styles.check, checked && styles.checkOn]}>
        {checked ? <CheckIcon size={12} weight="bold" color="#fff" /> : null}
      </View>
    </Pressable>
  );
}

/**
 * The seller hands a delivery order to a courier: pick the courier, scan
 * (or type) the waybill's tracking number, and the order becomes Shipped
 * (web/src/components/orders/ShipOrderSheet.jsx + .css).
 *
 *   <ShipOrderSheet open couriers={[…]} orderNumber="…"
 *     onCancel={…} onConfirm={async ({ courierId, trackingNumber }) => ok} />
 */
export default function ShipOrderSheet({
  open, couriers = [], orderNumber, onCancel, onConfirm,
}) {
  const insets = useSafeAreaInsets();
  const [courierId, setCourierId] = useState('');
  const [tracking, setTracking] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focus, setFocus] = useState(false);

  // A fresh sheet each time it opens, with the shop's one courier chosen.
  const first = couriers.length === 1 ? couriers[0].id : '';
  useEffect(() => {
    if (!open) return;
    setCourierId(first);
    setTracking('');
    setScanning(false);
    setBusy(false);
  }, [open, orderNumber, first]);

  const onRead = (value) => {
    setTracking(value);
    setScanning(false);
    toast.success('Tracking number scanned');
  };

  const valid = Boolean(courierId) && TRACKING_OK.test(tracking);

  const confirm = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onConfirm?.({ courierId, trackingNumber: tracking });
    if (ok === false) setBusy(false);
  };

  return (
    <OrderSheetFrame
      open={open}
      onClose={() => { if (busy) return; if (scanning) setScanning(false); else onCancel?.(); }}
      dismissable={!busy}
      backdrop="rgba(15, 23, 42, 0.5)"
      footer={(
        <>
          <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={[proofStyles.btn, proofStyles.cancel, busy && proofStyles.off]}>
            <Text style={[proofStyles.btnText, proofStyles.cancelText]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!valid || busy}
            onPress={confirm}
            style={[proofStyles.btn, proofStyles.primary, (!valid || busy) && proofStyles.off]}
          >
            {busy ? <ActivityIndicator size={14} color="#fff" style={proofStyles.spin} /> : null}
            <Text style={[proofStyles.btnText, proofStyles.goText]}>{busy ? 'Saving…' : 'Mark shipped'}</Text>
          </Pressable>
        </>
      )}
      footerStyle={[proofStyles.foot, { paddingBottom: 16 + insets.bottom }]}
    >
      <View style={[proofStyles.body, styles.body]}>
        <View style={proofStyles.head}>
          <View style={proofStyles.icon}><TruckIcon size={20} weight="fill" color={t.primary[600]} /></View>
          <View style={proofStyles.headText}>
            <Text style={proofStyles.title} accessibilityRole="header">Ship order</Text>
            {orderNumber ? <Text style={proofStyles.order}>Order {orderNumber}</Text> : null}
          </View>
        </View>

        <View accessibilityRole="radiogroup">
          <Text style={styles.label}>Courier</Text>
          {couriers.length === 0 ? (
            <Text style={proofStyles.hint}>This order is delivered by you, not by a courier.</Text>
          ) : (
            <View style={styles.courierList}>
              {couriers.map((c) => (
                <CourierChoice
                  key={c.id}
                  courier={c}
                  checked={courierId === c.id}
                  desc={couriers.length === 1 ? "The buyer's choice, paid with the order" : null}
                  onPress={() => setCourierId(c.id)}
                />
              ))}
            </View>
          )}
        </View>

        <View>
          <Text style={styles.label} nativeID="ship-tracking-label">Tracking number</Text>
          {scanning ? (
            <BarcodeScanner onRead={onRead} onClose={() => setScanning(false)} />
          ) : (
            <View style={styles.trackRow}>
              <TextInput
                value={tracking}
                onChangeText={(v) => setTracking(cleanTracking(v))}
                placeholder="Scan or type the waybill number"
                placeholderTextColor={t.neutral[400]}
                autoComplete="off"
                autoCorrect={false}
                autoCapitalize="characters"
                spellCheck={false}
                accessibilityLabelledBy="ship-tracking-label"
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
                style={[styles.trackInput, focus && styles.trackFocus]}
              />
              <Pressable accessibilityRole="button" onPress={() => setScanning(true)} style={styles.scanBtn}>
                <BarcodeIcon size={20} color="#fff" />
                <Text style={styles.scanBtnText}>Scan</Text>
              </Pressable>
            </View>
          )}
          <Text style={styles.trackHint}>The buyer sees the courier and this number, with a link to track the parcel.</Text>
        </View>
      </View>
    </OrderSheetFrame>
  );
}

const styles = themed(() => StyleSheet.create({
  body: { gap: 16 },
  label: { marginBottom: 8, fontSize: 13, lineHeight: 20.8, ...font(600), color: t.neutral[700] },
  courierList: { gap: 8 },
  choice: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 12, paddingHorizontal: 14,
    borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 14, backgroundColor: t.neutral[0],
  },
  choiceOn: {
    borderColor: t.primary[600], backgroundColor: t.primary[50],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 3, color: 'rgba(16, 185, 129, 0.12)' }],
  },
  choiceBody: { flex: 1, minWidth: 0, gap: 2 },
  choiceTitle: { fontSize: 15, lineHeight: 19.5, ...font(600), color: t.neutral[900] },
  choiceDesc: { fontSize: 13, lineHeight: 18.2, ...font(400), color: t.neutral[500] },
  check: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: t.neutral[300], backgroundColor: t.neutral[0],
  },
  checkOn: { borderColor: t.primary[600], backgroundColor: t.primary[600] },

  trackRow: { flexDirection: 'row', gap: 8 },
  trackInput: {
    flex: 1, minWidth: 0, height: 46, paddingHorizontal: 12, borderWidth: 1.5, borderColor: t.neutral[200], borderRadius: 12,
    backgroundColor: t.neutral[0], color: t.neutral[900], fontFamily: MONO, fontSize: 15, letterSpacing: 0.6, outlineStyle: 'none',
  },
  trackFocus: { borderColor: t.primary[500] },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 46, paddingHorizontal: 14, borderRadius: 12, backgroundColor: t.primary[600],
  },
  scanBtnText: { fontSize: 14, lineHeight: 20, ...font(600), color: t.onBrand },
  trackHint: { marginTop: 8, fontSize: 12.5, lineHeight: 18.1, ...font(400), color: t.neutral[500] },

  scan: { overflow: 'hidden', aspectRatio: 4 / 3, borderRadius: 14, backgroundColor: '#0b1210' },
  frameWrap: { ...StyleSheet.absoluteFill, paddingVertical: '24%', paddingHorizontal: '10%' },
  frame: {
    flex: 1, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.9)', borderRadius: 10, justifyContent: 'center',
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 999, color: 'rgba(0, 0, 0, 0.35)' }],
  },
  frameLine: {
    marginHorizontal: '6%', height: 2, backgroundColor: t.primary[400],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 10, color: t.primary[400] }],
  },
  scanNote: {
    position: 'absolute', left: 12, right: 12, bottom: 10, textAlign: 'center',
    fontSize: 13, lineHeight: 20.8, ...font(400), color: t.onBrand,
    textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  scanClose: {
    position: 'absolute', top: 8, right: 8, width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
}));
