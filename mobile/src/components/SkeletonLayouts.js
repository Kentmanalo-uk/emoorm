import { View, StyleSheet } from 'react-native';
import LoadingSkeleton from './LoadingSkeleton';
import { colors, radius, spacing } from '../theme';

export function ListSkeleton({ rows = 6, imageSize = 44 }) {
  return (
    <View style={styles.list} accessibilityLabel="Loading content">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.listRow}>
          <LoadingSkeleton width={imageSize} height={imageSize} borderRadius={radius.full} />
          <View style={styles.listBody}>
            <LoadingSkeleton width="58%" height={15} />
            <LoadingSkeleton width="88%" height={12} />
            <LoadingSkeleton width="34%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ProductGridSkeleton({ count = 6 }) {
  return (
    <View style={styles.grid} accessibilityLabel="Loading products">
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={styles.product}>
          <LoadingSkeleton width="100%" height={150} borderRadius={radius.lg} />
          <LoadingSkeleton width="82%" height={14} />
          <LoadingSkeleton width="48%" height={16} />
        </View>
      ))}
    </View>
  );
}

export function ProfileSkeleton() {
  return (
    <View style={styles.profile} accessibilityLabel="Loading profile">
      <View style={styles.profileHeader}>
        <LoadingSkeleton width={64} height={64} borderRadius={radius.full} />
        <View style={styles.listBody}>
          <LoadingSkeleton width="62%" height={18} />
          <LoadingSkeleton width="78%" height={12} />
          <LoadingSkeleton width="92%" height={28} />
        </View>
      </View>
      <LoadingSkeleton width="100%" height={138} borderRadius={radius.lg} />
      <LoadingSkeleton width="100%" height={220} borderRadius={radius.lg} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  listRow: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  listBody: { flex: 1, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, padding: spacing.lg },
  product: { width: '47.5%', gap: spacing.sm },
  profile: { flex: 1, gap: spacing.lg, padding: spacing.lg },
  profileHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
