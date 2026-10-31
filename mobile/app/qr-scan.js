import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  DesktopIcon, FlashlightIcon, QrCodeIcon, XIcon,
} from '../src/lib/icons';
import { font, t, themed } from '../src/theme';

/*
 * Scan to log in on a computer (Profile's scan button): the website's
 * "Log in with QR" shows a code (emoorm.shop → Log in → Log in with QR); this
 * camera reads it and opens qr-approve.js, where the person allows that
 * computer into the account signed in here. Only E-MOORM login codes count;
 * anything else says so under the frame and the camera keeps looking.
 */

// Must match the prefix the backend encodes into the QR image
// (backend/src/services/qrLogin.service.js).
const QR_PREFIX = 'EMOORM-QR-LOGIN:';
const FRAME = 248;
const CORNER = 34;

// Haptics: a short "found it" tap; an app build without the module stays silent.
let Haptics = null;
try {
  // eslint-disable-next-line global-require
  Haptics = require('expo-haptics');
} catch {
  Haptics = null;
}
const foundTap = () => {
  try {
    Haptics?.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // No haptics on this phone.
  }
};

export default function QrScan() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [notOurs, setNotOurs] = useState(false);
  const done = useRef(false);
  const notOursTimer = useRef(null);
  const sweep = useRef(new Animated.Value(0)).current;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  // The line that sweeps the frame while it looks.
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(sweep, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); clearTimeout(notOursTimer.current); };
  }, [sweep]);

  const onScanned = ({ data }) => {
    if (done.current) return;
    const value = String(data || '');
    if (!value.startsWith(QR_PREFIX)) {
      setNotOurs(true);
      clearTimeout(notOursTimer.current);
      notOursTimer.current = setTimeout(() => setNotOurs(false), 2200);
      return;
    }
    done.current = true;
    foundTap();
    router.replace({ pathname: '/qr-approve', params: { token: value } });
  };

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <View style={[styles.permission, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.permIcon}><QrCodeIcon size={40} color={t.primary[600]} /></View>
        <Text style={styles.permTitle}>Allow the camera to scan</Text>
        <Text style={styles.permText}>
          E-MOORM uses the camera only to read the QR code on your computer, so you can log in there without a password.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={permission.canAskAgain ? requestPermission : () => Linking.openSettings().catch(() => {})}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
        >
          <Text style={styles.primaryBtnText}>{permission.canAskAgain ? 'Allow camera' : 'Open Settings'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.linkBtn}>
          <Text style={styles.linkBtnText}>Not now</Text>
        </Pressable>
      </View>
    );
  }

  // The frame, a little above the middle (room for the help under it).
  const left = (width - FRAME) / 2;
  const top = Math.max(insets.top + 96, (height - FRAME) / 2 - 60);
  const lineY = sweep.interpolate({ inputRange: [0, 1], outputRange: [10, FRAME - 12] });

  return (
    <View style={styles.screen}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />

      {/* Everything but the frame darkened. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.shade, { top: 0, left: 0, right: 0, height: top }]} />
        <View style={[styles.shade, { top: top + FRAME, left: 0, right: 0, bottom: 0 }]} />
        <View style={[styles.shade, { top, left: 0, width: left, height: FRAME }]} />
        <View style={[styles.shade, { top, right: 0, width: left, height: FRAME }]} />
        <View style={[styles.frame, { top, left }]}>
          <View style={[styles.corner, styles.cTL]} />
          <View style={[styles.corner, styles.cTR]} />
          <View style={[styles.corner, styles.cBL]} />
          <View style={[styles.corner, styles.cBR]} />
          <Animated.View style={[styles.line, { transform: [{ translateY: lineY }] }]} />
        </View>
      </View>

      {/* Top: close, the title, the light. */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={goBack} style={styles.roundBtn} hitSlop={6}>
          <XIcon size={20} weight="bold" color="#fff" />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">Scan to log in</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={torch ? 'Turn the light off' : 'Turn the light on'}
          accessibilityState={{ selected: torch }}
          onPress={() => setTorch((v) => !v)}
          style={[styles.roundBtn, torch && styles.roundBtnOn]}
          hitSlop={6}
        >
          <FlashlightIcon size={20} weight={torch ? 'fill' : 'regular'} color={torch ? t.neutral[900] : '#fff'} />
        </Pressable>
      </View>

      {/* Under the frame: what to point at, or that this code is not one. */}
      <View style={[styles.hintWrap, { top: top + FRAME + 22 }]} pointerEvents="none">
        <Text style={[styles.hint, notOurs && styles.hintBad]} accessibilityLiveRegion="polite">
          {notOurs ? 'That isn’t an E-MOORM login code' : 'Point your camera at the QR code'}
        </Text>
      </View>

      {/* How to get the code on the computer. */}
      <View style={[styles.help, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.helpIcon}><DesktopIcon size={22} color={t.primary[600]} /></View>
        <View style={styles.helpText}>
          <Text style={styles.helpTitle}>On your computer</Text>
          <Text style={styles.helpBody}>
            Open emoorm.shop, tap Log in, then “Log in with QR”. Scan the code to sign in there as you — no password needed.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  shade: { position: 'absolute', backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  frame: { position: 'absolute', width: FRAME, height: FRAME, overflow: 'hidden' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff' },
  cTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 },
  cTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 },
  line: {
    position: 'absolute', left: 16, right: 16, height: 2, borderRadius: 1, backgroundColor: t.primary[400],
    boxShadow: [{ offsetX: 0, offsetY: 0, blurRadius: 10, color: t.primary[400] }],
  },

  top: {
    position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16,
  },
  roundBtn: {
    width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  roundBtnOn: { backgroundColor: '#fff' },
  title: { fontSize: 17, lineHeight: 22, ...font(600), color: '#fff' },

  hintWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  hint: {
    overflow: 'hidden', paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999,
    fontSize: 14, lineHeight: 19, ...font(500), color: '#fff', backgroundColor: 'rgba(0, 0, 0, 0.45)', textAlign: 'center',
  },
  hintBad: { backgroundColor: t.danger[600] },

  help: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 12,
    paddingTop: 18, paddingHorizontal: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: t.neutral[0],
  },
  helpIcon: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary[50],
  },
  helpText: { flex: 1, gap: 3 },
  helpTitle: { fontSize: 15, lineHeight: 20, ...font(600), color: t.neutral[900] },
  helpBody: { fontSize: 13.5, lineHeight: 19, ...font(400), color: t.neutral[600] },

  permission: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, backgroundColor: t.neutral[0],
  },
  permIcon: {
    width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center',
    marginBottom: 18, backgroundColor: t.primary[50],
  },
  permTitle: { fontSize: 20, lineHeight: 26, ...font(600), color: t.neutral[900], textAlign: 'center' },
  permText: { marginTop: 8, marginBottom: 24, fontSize: 14.5, lineHeight: 21, ...font(400), color: t.neutral[600], textAlign: 'center' },
  primaryBtn: {
    alignSelf: 'stretch', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 999,
    backgroundColor: t.primary[600],
  },
  primaryBtnPressed: { backgroundColor: t.primary[700] },
  primaryBtnText: { fontSize: 16, lineHeight: 20, ...font(600), color: '#fff' },
  linkBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 18 },
  linkBtnText: { fontSize: 15, lineHeight: 20, ...font(500), color: t.neutral[600] },
}));

