import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, control, spacing, typography } from '../theme';

export default function ScreenHeader({ title, subtitle, action }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return <View style={[styles.header, { paddingTop: insets.top, minHeight: 56 + insets.top }]}>
    <Pressable style={styles.back} onPress={() => router.back()}><ArrowLeft size={21} color={colors.textPrimary} /></Pressable>
    <View style={styles.text}><Text style={styles.title} numberOfLines={1}>{title}</Text>{subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}</View>
    <View style={styles.action}>{action}</View>
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, backgroundColor: colors.white },
  back: { width: control.iconSize, height: control.iconSize, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 }, title: { ...typography.h3, color: colors.textPrimary }, subtitle: { ...typography.caption, color: colors.textMuted },
  action: { minWidth: control.iconSize, minHeight: control.iconSize, alignItems: 'flex-end', justifyContent: 'center' },
});
