import { View, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { PageLoader } from './BrandLoader';

export function ListSkeleton({ rows = 6, imageSize = 44 }) {
  return <PageLoader />;
}

export function ProductGridSkeleton({ count = 6 }) {
  return <PageLoader label="Loading products" />;
}

export function ProfileSkeleton() {
  return <PageLoader />;
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
