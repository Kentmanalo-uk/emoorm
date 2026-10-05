import { useEffect, useRef, useState } from 'react';
import {
  Image, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ArrowClockwiseIcon, CameraIcon, UploadSimpleIcon, XIcon,
} from 'phosphor-react-native';
import { font } from '../../theme';

/** A government ID card's width over its height (web lib/idCardCheck ID_RATIO). */
export const ID_RATIO = 1.586;
const DIM = 'rgba(0, 0, 0, 0.58)';
const RING = 1000;

/**
 * The ID camera, full screen (web IdentityVerifier's CameraCapture): the
 * camera behind an ID-shaped guide with the rest dimmed, the tip under it,
 * Upload and the shutter at the bottom, then the photo to keep or retake.
 * The website also checks each frame on the phone (sharpness, light, glare,
 * placement) to colour the guide and take the photo by itself; here the
 * person takes it with the shutter.
 *
 * onCapture(asset): { uri, width, height, mimeType, fileName, file? }.
 * onUpload(): picks a photo from the library instead (the website's Upload).
 */
export default function IdCamera({ side, onCapture, onUpload, onClose }) {
  const insets = useSafeAreaInsets();
  const { width: vw, height: vh } = useWindowDimensions();
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState('starting'); // starting | live | review | error
  const [review, setReview] = useState(null);
  const [center, setCenter] = useState(null);
  const [guide, setGuide] = useState(null);
  const title = side === 'back' ? 'Back of your ID' : 'Front of your ID';

  // Ask once; no camera, or no permission, shows the website's camera error.
  useEffect(() => {
    if (!permission) return;
    if (permission.granted) return;
    if (permission.canAskAgain) {
      requestPermission().then((res) => { if (!res?.granted) setPhase('error'); }).catch(() => setPhase('error'));
    } else {
      setPhase('error');
    }
  }, [permission, requestPermission]);

  const takePhoto = async () => {
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.92 });
      if (!shot?.uri) return;
      setReview({
        uri: shot.uri,
        width: shot.width,
        height: shot.height,
        mimeType: 'image/jpeg',
        fileName: `id-${side || 'front'}.jpg`,
      });
      setPhase('review');
    } catch {
      setPhase('error');
    }
  };

  const retake = () => {
    setReview(null);
    setPhase('live');
  };

  // width: min(88vw, 640px, (100dvh - 300px) * 1.586)
  const guideW = Math.max(120, Math.min(vw * 0.88, 640, (vh - 300) * ID_RATIO));
  const tip = phase === 'starting' ? 'Starting camera…' : 'Place your ID inside the frame';
  const cameraOn = permission?.granted && phase !== 'error';
  const ratio = review?.width && review?.height ? review.width / review.height : ID_RATIO;

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.cam} accessibilityViewIsModal accessibilityLabel={`Take a photo: ${title}`}>
        {cameraOn ? (
          <CameraView
            ref={cameraRef}
            style={[StyleSheet.absoluteFill, phase === 'review' && styles.hidden]}
            facing="back"
            onCameraReady={() => setPhase((p) => (p === 'starting' ? 'live' : p))}
            onMountError={() => setPhase('error')}
          />
        ) : null}

        {/* The dim around the guide (the website draws it as the guide's shadow). */}
        {(phase === 'starting' || phase === 'live') && center && guide ? (
          <View
            pointerEvents="none"
            style={[styles.ring, {
              left: guide.x - RING,
              top: center.y + guide.y - RING,
              width: guide.width + RING * 2,
              height: guide.height + RING * 2,
            }]}
          />
        ) : null}

        <View style={[styles.top, { paddingTop: 10 + insets.top }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close camera" onPress={onClose} style={styles.close}>
            <XIcon size={22} weight="bold" color="#fff" />
          </Pressable>
          <Text style={styles.topTitle}>{phase === 'review' ? 'Check your photo' : title}</Text>
          <View style={{ width: 44 }} />
        </View>

        {phase === 'error' ? (
          <View style={styles.center}>
            <View style={styles.error}>
              <CameraIcon size={36} color="rgba(255, 255, 255, 0.9)" />
              <Text style={styles.errorText}>
                The camera is not available. Allow camera access in your settings, or upload a photo of your ID instead.
              </Text>
              <Pressable accessibilityRole="button" onPress={onUpload} style={[styles.btn, styles.btnPrimary]}>
                <UploadSimpleIcon size={18} color="#fff" />
                <Text style={styles.btnText}>Upload a photo</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {phase === 'starting' || phase === 'live' ? (
          <>
            <View style={styles.center} onLayout={(e) => setCenter(e.nativeEvent.layout)}>
              <View
                onLayout={(e) => setGuide(e.nativeEvent.layout)}
                style={[styles.guide, { width: guideW, aspectRatio: ID_RATIO }]}
                pointerEvents="none"
              >
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />
              </View>
              <Text style={styles.tip} accessibilityLiveRegion="polite">{tip}</Text>
            </View>
            <View style={[styles.bottom, { paddingBottom: 24 + insets.bottom }]}>
              <View style={styles.side}>
                <Pressable accessibilityRole="button" onPress={onUpload} style={styles.upload}>
                  <UploadSimpleIcon size={18} color="#fff" />
                  <Text style={styles.uploadText}>Upload</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                onPress={takePhoto}
                disabled={phase !== 'live'}
                style={[styles.shutter, phase !== 'live' && { opacity: 0.5 }]}
              >
                <View style={styles.shutterDot} />
              </Pressable>
              <View style={styles.side} />
            </View>
          </>
        ) : null}

        {phase === 'review' && review ? (
          <>
            <View style={styles.center}>
              <Image
                source={{ uri: review.uri }}
                accessibilityLabel={`${title}, as taken`}
                resizeMode="contain"
                style={[styles.photo, { width: Math.min(vw * 0.92, 720), aspectRatio: ratio, maxHeight: vh - 280 }]}
              />
              <Text style={styles.note}>Is your whole ID in the photo, sharp and easy to read?</Text>
            </View>
            <View style={[styles.bottom, styles.bottomReview, { paddingBottom: 24 + insets.bottom }]}>
              <Pressable accessibilityRole="button" onPress={retake} style={[styles.btn, { flex: 1 }]}>
                <ArrowClockwiseIcon size={18} color="#fff" />
                <Text style={styles.btnText}>Retake</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => onCapture(review)} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
                <Text style={styles.btnText}>Use photo</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  cam: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  hidden: { opacity: 0 },
  ring: { position: 'absolute', borderWidth: RING, borderColor: DIM, borderRadius: RING + 16 },

  top: { zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.35)' },
  topTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 17, lineHeight: 24, ...font(500) },

  center: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: '6%' },
  guide: { borderWidth: 3, borderColor: 'rgba(255, 255, 255, 0.92)', borderRadius: 16 },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: '#fff' },
  tl: { top: -3, left: -3, borderTopWidth: 6, borderLeftWidth: 6, borderTopLeftRadius: 16 },
  tr: { top: -3, right: -3, borderTopWidth: 6, borderRightWidth: 6, borderTopRightRadius: 16 },
  bl: { bottom: -3, left: -3, borderBottomWidth: 6, borderLeftWidth: 6, borderBottomLeftRadius: 16 },
  br: { bottom: -3, right: -3, borderBottomWidth: 6, borderRightWidth: 6, borderBottomRightRadius: 16 },
  tip: {
    maxWidth: '88%', paddingVertical: 9, paddingHorizontal: 16, borderRadius: 999, overflow: 'hidden',
    backgroundColor: 'rgba(17, 24, 39, 0.78)', color: '#fff', fontSize: 15, lineHeight: 24, textAlign: 'center', ...font(500),
  },
  note: { maxWidth: '88%', color: 'rgba(255, 255, 255, 0.85)', fontSize: 14, lineHeight: 21, textAlign: 'center', ...font(400) },

  bottom: { zIndex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 16, paddingHorizontal: 24 },
  bottomReview: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  side: { flex: 1, alignItems: 'flex-start' },
  upload: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  uploadText: { color: '#fff', fontSize: 14, lineHeight: 20, ...font(400) },
  shutter: { width: 74, height: 74, padding: 5, borderWidth: 4, borderColor: '#fff', borderRadius: 37 },
  shutterDot: { flex: 1, borderRadius: 999, backgroundColor: '#fff' },

  photo: { borderRadius: 12, backgroundColor: '#111' },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 18,
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.6)', borderRadius: 12,
  },
  btnPrimary: { borderColor: '#16a34a', backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontSize: 16, lineHeight: 22, ...font(500) },

  error: { alignItems: 'center', gap: 14, maxWidth: 360 },
  errorText: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 15, lineHeight: 22.5, textAlign: 'center', ...font(400) },
});

/** A web camera shot is a data: URL; the form needs it as a file. */
export const assetToUpload = async (asset, fallbackName) => {
  if (asset.file) return asset.file;
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    return new File([blob], asset.fileName || fallbackName, { type: asset.mimeType || blob.type || 'image/jpeg' });
  }
  return { uri: asset.uri, name: asset.fileName || fallbackName, type: asset.mimeType || 'image/jpeg' };
};
