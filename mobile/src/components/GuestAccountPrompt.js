import { useRouter } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from './Button';
import { colors, radius, spacing, typography } from '../theme';

export default function GuestAccountPrompt({ Icon, title, message, redirect, embedded = false }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const prompt = (
    <>
      <View style={[styles.iconWrap, embedded && styles.embeddedIconWrap]}>
        <Icon size={embedded ? 26 : 34} color={colors.secondary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={[styles.actions, embedded && styles.embeddedActions]}>
        <Button title="Sign In" onPress={() => router.push({ pathname: '/login', params: { redirect } })} style={embedded ? styles.embeddedAction : undefined} />
        <Button title="Sign Up" variant="secondary" onPress={() => router.push({ pathname: '/register', params: { redirect } })} style={embedded ? styles.embeddedAction : undefined} />
      </View>
    </>
  );

  if (embedded) {
    return <View style={[styles.content, styles.embeddedContent]}>{prompt}</View>;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.content}>{prompt}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, backgroundColor: colors.bgSecondary },
  content: { width: '100%', maxWidth: 420, alignSelf: 'center', alignItems: 'center', padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.white },
  embeddedContent: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderLight },
  iconWrap: { width: 68, height: 68, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg, borderRadius: radius.full, backgroundColor: colors.bgGreenLight },
  embeddedIconWrap: { width: 54, height: 54, marginBottom: spacing.md },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  message: { ...typography.body, maxWidth: 300, marginTop: spacing.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  actions: { width: '100%', marginTop: spacing.xl, gap: spacing.sm },
  embeddedActions: { flexDirection: 'row', marginTop: spacing.lg },
  embeddedAction: { flex: 1 },
});