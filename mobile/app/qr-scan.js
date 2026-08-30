import { useState } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useRouter } from 'expo-router';
import { ArrowLeftIcon as ArrowLeft, QrCodeIcon as QrCode } from 'phosphor-react-native';
import { colors, spacing, typography } from '../src/theme';
import { toast } from '../src/lib/toast';

// Must match the prefix the backend encodes into the QR image
// (backend/src/services/qrLogin.service.js).
const QR_PREFIX = 'EMOORM-QR-LOGIN:';

export default function QrScan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarcodeScanned = ({ data }) => {
    if (scanned) return;
    const value = String(data || '');
    if (!value.startsWith(QR_PREFIX)) {
      toast.error('This is not an Emoorm login QR code');
      return;
    }
    setScanned(true);
    router.replace({ pathname: '/qr-approve', params: { token: value } });
  };

  if (!permission) {
    return <View style={styles.center} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <QrCode size={48} color={colors.gray400} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permText}>
          Allow camera access to scan a QR code and log in on your computer.
        </Text>
        <Pressable style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant permission</Text>
        </Pressable>
        <Pressable
          style={styles.backLink}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <Text style={styles.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />
      <View style={styles.overlay}>
        <Pressable
          style={styles.iconButton}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        >
          <ArrowLeft size={21} color={colors.white} />
        </Pressable>
        <Text style={styles.overlayTitle}>Scan QR to log in</Text>
        <View style={styles.frame} />
        <Text style={styles.overlayHint}>
          Point your camera at the QR code shown on the Emoorm web login page.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl, backgroundColor: colors.white, gap: spacing.sm,
  },
  permTitle: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.md },
  permText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
  permButton: {
    marginTop: spacing.lg, backgroundColor: colors.primary,
    paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8,
  },
  permButtonText: { ...typography.body, color: colors.white, fontWeight: '600' },
  backLink: { marginTop: spacing.md },
  backLinkText: { ...typography.body, color: colors.textMuted },
  overlay: { flex: 1, alignItems: 'center', paddingTop: 60, paddingHorizontal: spacing.xl },
  iconButton: {
    position: 'absolute', top: 60, left: spacing.lg, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 20,
  },
  overlayTitle: { ...typography.h3, color: colors.white, marginBottom: spacing.xxl },
  frame: { width: 240, height: 240, borderWidth: 2, borderColor: colors.white, borderRadius: 16, marginBottom: spacing.xl },
  overlayHint: { ...typography.body, color: colors.white, textAlign: 'center', opacity: 0.85 },
});
