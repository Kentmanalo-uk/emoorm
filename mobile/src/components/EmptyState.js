import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../theme';
import Button from './Button';

export default function EmptyState({ icon, title, message, actionLabel, onAction }) {
  return (
    <View style={styles.container}>
      {icon}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...typography.h3, color: colors.textPrimary, textAlign: 'center' },
  message: { ...typography.body, maxWidth: 300, color: colors.textSecondary, textAlign: 'center' },
  action: { marginTop: spacing.md, minWidth: 168 },
});
