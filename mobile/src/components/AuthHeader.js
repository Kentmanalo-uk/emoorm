import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export default function AuthHeader({ title, subtitle, showBrand = false }) {
  return (
    <View style={styles.container}>
      {showBrand ? <Image source={require('../../assets/brand-icon.png')} style={styles.logo} /> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', marginBottom: spacing.xxl },
  logo: { width: 56, height: 56, borderRadius: radius.lg, marginBottom: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs },
});
