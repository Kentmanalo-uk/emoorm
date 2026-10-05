import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon, XIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import { clearSetupReturn, useSetupReturn } from '../../lib/setupReturn';

/**
 * Seller Center pages reached from the guided setup show this pill, so the
 * seller can go back to the setup where they left it, or close it and stay
 * (web/src/components/seller/SetupReturnPill.jsx + .css). It floats above the
 * tab bar. Mounted once by app/seller/_layout.js; the guided setup calls
 * setSetupReturn(step) (src/lib/setupReturn.js) before sending the seller off.
 */
export default function SetupReturnPill() {
  const step = useSetupReturn();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (!step || pathname.startsWith('/seller/welcome')) return null;
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={[styles.pill, { marginBottom: 76 + insets.bottom }]} accessibilityLabel="Guided setup">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.navigate({ pathname: '/seller/welcome', params: { step } })}
          style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
        >
          <ArrowLeftIcon size={16} weight="bold" color="#fff" />
          <Text style={styles.backText}>Back to setup</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Close and stay here" onPress={clearSetupReturn} style={styles.close}>
          <XIcon size={14} weight="bold" color="rgba(255, 255, 255, 0.8)" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-end', zIndex: 250 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 4,
    borderRadius: 999,
    backgroundColor: t.neutral[900],
    boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(15, 23, 42, 0.25)' }],
  },
  back: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.primary[600],
  },
  backPressed: { backgroundColor: t.primary[700] },
  backText: { fontSize: 14, lineHeight: 20, color: '#fff', ...font(500) },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
