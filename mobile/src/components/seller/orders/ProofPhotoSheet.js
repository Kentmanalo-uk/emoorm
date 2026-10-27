import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Linking, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowClockwiseIcon, CameraIcon, CheckCircleIcon, ImageSquareIcon, StorefrontIcon, TruckIcon, WarningCircleIcon,
} from 'phosphor-react-native';
import OrderSheetFrame from '../../orders/OrderSheetFrame';
import { uploadPrivateImage } from '../../../lib/upload';
import { toast } from '../../../lib/toast';
import { font, t } from '../../../theme';

/**
 * Asks the seller for the hand-over photo before an order is marked
 * Delivered (proof of delivery) or Picked up (proof of pickup)
 * (web/src/components/orders/ProofPhotoSheet.jsx + .css, on the cf-dialog
 * bottom sheet of phones).
 *
 *   <ProofPhotoSheet open kind="DELIVERY" | "PICKUP" orderNumber="…"
 *     onCancel={…} onConfirm={async (proofUrl) => ok} />
 *
 * Add a photo (the camera, or one from the gallery): it goes up straight
 * away, under its preview, and the button turns on once it is up. A failed
 * upload says why and offers Try again; Retake / Change photo swap it. When
 * the status change itself fails (onConfirm answers false), the sheet stays
 * open with the photo already up, so a retry doesn't send it again.
 */
export default function ProofPhotoSheet({
  open, kind = 'DELIVERY', orderNumber, onCancel, onConfirm,
}) {
  const insets = useSafeAreaInsets();
  // photo: { asset, status: 'uploading' | 'ready' | 'failed', url, error }
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  // The upload that counts: a newer pick replaces an older one still going.
  const attempt = useRef(0);

  useEffect(() => {
    if (!open) return;
    attempt.current += 1;
    setPhoto(null);
    setSaving(false);
  }, [open]);

  const pickup = kind === 'PICKUP';
  const title = pickup ? 'Proof of pickup' : 'Proof of delivery';
  const hint = pickup
    ? 'Take a photo of the order being handed to the buyer at your pickup point.'
    : 'Take a photo of the order at the delivery address, ideally with the buyer or at their door.';
  const action = pickup ? 'Mark picked up' : 'Mark delivered';
  const Icon = pickup ? StorefrontIcon : TruckIcon;
  const uploading = photo?.status === 'uploading';
  const busy = saving || uploading;
  const ready = photo?.status === 'ready';

  // Any photo the phone can open (uploadImage makes it a JPEG the server accepts).
  const send = async (asset) => {
    attempt.current += 1;
    const mine = attempt.current;
    setPhoto({ asset, status: 'uploading', url: null, error: null });
    try {
      const { url } = await uploadPrivateImage(asset);
      if (attempt.current === mine) setPhoto((cur) => (cur?.asset === asset ? { ...cur, status: 'ready', url } : cur));
    } catch (err) {
      if (attempt.current === mine) {
        setPhoto((cur) => (cur?.asset === asset
          ? { ...cur, status: 'failed', error: err?.message || 'Could not upload the photo' }
          : cur));
      }
    }
  };

  const choose = (picked) => {
    if (!picked || saving) return;
    send(picked);
  };

  // "Take photo" opens the camera (the website's capture="environment").
  const takePhoto = async () => {
    try {
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          if (permission.canAskAgain === false) {
            toast.error('Camera access is off for E-MOORM. Choose a photo from the gallery, or allow the camera in Settings.');
            Linking.openSettings?.().catch(() => {});
          } else {
            toast.error('Allow camera access to take the photo, or choose one from the gallery.');
          }
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!result.canceled) choose(result.assets?.[0]);
    } catch (err) {
      toast.error(err?.message || 'The camera could not start. Choose a photo from the gallery instead.');
    }
  };

  const choosePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!result.canceled) choose(result.assets?.[0]);
    } catch (err) {
      toast.error(err?.message || 'Could not open your photos');
    }
  };

  const confirm = async () => {
    if (!ready || saving) return;
    setSaving(true);
    // false: the status update failed (already reported); stay open to retry.
    const ok = await onConfirm?.(photo.url);
    if (ok === false) setSaving(false);
  };

  const asset = photo?.asset;
  const ratio = asset?.width && asset?.height ? asset.width / asset.height : 4 / 3;

  return (
    <OrderSheetFrame
      open={open}
      onClose={() => { if (!saving) onCancel?.(); }}
      dismissable={!saving}
      backdrop="rgba(15, 23, 42, 0.5)"
      footer={(
        <>
          <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={[proofStyles.btn, proofStyles.cancel, saving && proofStyles.off]}>
            <Text style={[proofStyles.btnText, proofStyles.cancelText]}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready || saving }}
            accessibilityHint={ready ? undefined : 'Add a photo first'}
            disabled={!ready || saving}
            onPress={confirm}
            style={[proofStyles.btn, proofStyles.primary, (!ready || saving) && proofStyles.off]}
          >
            {saving ? <ActivityIndicator size={14} color="#fff" style={proofStyles.spin} /> : null}
            <Text style={[proofStyles.btnText, proofStyles.goText]}>{saving ? 'Saving…' : action}</Text>
          </Pressable>
        </>
      )}
      footerStyle={[proofStyles.foot, { paddingBottom: 16 + insets.bottom }]}
    >
      <View style={proofStyles.body}>
        <View style={proofStyles.head}>
          <View style={proofStyles.icon}><Icon size={20} weight="fill" color={t.primary[600]} /></View>
          <View style={proofStyles.headText}>
            <Text style={proofStyles.title} accessibilityRole="header">{title}</Text>
            {orderNumber ? <Text style={proofStyles.order}>Order {orderNumber}</Text> : null}
          </View>
        </View>
        <Text style={proofStyles.hint}>{hint} The buyer can see this photo on their order.</Text>

        {photo ? (
          <>
            <View style={styles.preview}>
              <Image
                source={{ uri: asset.uri }}
                style={[styles.previewImg, { aspectRatio: ratio }, uploading && styles.previewDim]}
                resizeMode="contain"
                accessibilityLabel={`${title} preview`}
              />
              {uploading ? (
                <View style={[styles.state, styles.stateBusy]} accessibilityLiveRegion="polite">
                  <ActivityIndicator size={16} color="#fff" />
                  <Text style={styles.stateText}>Uploading photo…</Text>
                </View>
              ) : null}
              {ready ? (
                <View style={[styles.state, styles.stateReady]} accessibilityLiveRegion="polite">
                  <CheckCircleIcon size={18} weight="fill" color="#fff" />
                  <Text style={styles.stateText}>Photo added</Text>
                </View>
              ) : null}
              {photo.status === 'failed' ? (
                <View style={[styles.state, styles.stateFailed]} accessibilityLiveRegion="assertive">
                  <View style={styles.errorRow}>
                    <WarningCircleIcon size={18} weight="fill" color="#fff" />
                    <Text style={[styles.stateText, styles.errorText]}>{photo.error}</Text>
                  </View>
                  <Pressable accessibilityRole="button" onPress={() => send(photo.asset)} style={styles.tryAgain}>
                    <ArrowClockwiseIcon size={15} color="#b91c1c" />
                    <Text style={styles.tryAgainText}>Try again</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View style={styles.swap}>
              <Pressable accessibilityRole="button" onPress={takePhoto} disabled={busy} style={[styles.swapBtn, busy && proofStyles.off]}>
                <CameraIcon size={17} color={t.neutral[700]} />
                <Text style={styles.swapText}>Retake</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={choosePhoto} disabled={busy} style={[styles.swapBtn, busy && proofStyles.off]}>
                <ImageSquareIcon size={17} color={t.neutral[700]} />
                <Text style={styles.swapText}>Change photo</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.add}>
            <Text style={styles.addLabel}>Add a photo</Text>
            <View style={styles.pick}>
              <Pressable accessibilityRole="button" onPress={takePhoto} style={[styles.pickBtn, styles.pickPrimary]}>
                <CameraIcon size={22} color={t.primary[700]} />
                <Text style={[styles.pickText, styles.pickTextPrimary]}>Take photo</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={choosePhoto} style={styles.pickBtn}>
                <ImageSquareIcon size={22} color={t.neutral[700]} />
                <Text style={styles.pickText}>Choose from gallery</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </OrderSheetFrame>
  );
}

/** The cf-dialog sheet pieces (ProofPhotoSheet.css + ConfirmDialog.css ≤480px), shared with ShipOrderSheet. */
export const proofStyles = StyleSheet.create({
  body: { gap: 14, paddingTop: 20, paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50] },
  headText: { flex: 1, minWidth: 0 },
  title: { fontSize: 17, lineHeight: 27.2, ...font(600), color: t.neutral[900] },
  order: { marginTop: 2, fontSize: 12.5, lineHeight: 20, ...font(400), color: t.neutral[500] },
  hint: { fontSize: 13.5, lineHeight: 20.25, ...font(400), color: t.neutral[600] },
  foot: { gap: 10, paddingTop: 16, borderTopWidth: 0 },
  btn: {
    flex: 1, flexDirection: 'row', minHeight: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  cancel: { backgroundColor: t.neutral[100] },
  primary: { backgroundColor: t.primary[600] },
  off: { opacity: 0.6 },
  spin: { marginRight: 6 },
  btnText: { fontSize: 14, lineHeight: 20, ...font(600) },
  cancelText: { color: t.neutral[700] },
  goText: { color: '#fff' },
});

const styles = StyleSheet.create({
  preview: { overflow: 'hidden', borderRadius: 14, backgroundColor: t.neutral[100] },
  previewImg: { width: '100%', maxHeight: 300 },
  previewDim: { opacity: 0.7 },
  // The upload's state, as a band along the preview's bottom.
  state: {
    position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  stateBusy: { backgroundColor: 'rgba(17, 24, 39, 0.72)' },
  stateReady: { backgroundColor: 'rgba(4, 120, 87, 0.88)' },
  stateFailed: { backgroundColor: 'rgba(185, 28, 28, 0.92)', flexWrap: 'wrap', justifyContent: 'space-between' },
  stateText: { fontSize: 13.5, lineHeight: 19, ...font(500), color: '#fff' },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flexGrow: 1, flexShrink: 1, flexBasis: 180 },
  errorText: { flexShrink: 1 },
  tryAgain: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#fff',
  },
  tryAgainText: { fontSize: 13, lineHeight: 18, ...font(600), color: '#b91c1c' },
  swap: { flexDirection: 'row', gap: 10 },
  swapBtn: {
    flex: 1, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: t.neutral[300], borderRadius: 10, backgroundColor: '#fff',
  },
  swapText: { fontSize: 13.5, lineHeight: 19, ...font(500), color: t.neutral[700] },
  add: { gap: 8 },
  addLabel: { fontSize: 13.5, lineHeight: 19, ...font(600), color: t.neutral[800] },
  pick: { flexDirection: 'row', gap: 10 },
  pickBtn: {
    flex: 1, height: 104, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.neutral[300], borderRadius: 14, backgroundColor: t.neutral[50],
  },
  pickPrimary: { borderColor: t.primary[300], backgroundColor: t.primary[50] },
  pickText: { fontSize: 14, lineHeight: 20, ...font(500), color: t.neutral[700], textAlign: 'center' },
  pickTextPrimary: { color: t.primary[700] },
});
