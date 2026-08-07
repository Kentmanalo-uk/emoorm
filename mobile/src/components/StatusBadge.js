import { View, Text, StyleSheet } from 'react-native';
import { colors, fontFamily, radius, spacing, typography } from '../theme';

// Mirrors getStatusBadge() in web/src/pages/Orders.jsx — keep labels/tones in sync.
export const ORDER_STATUS_BADGES = {
  PENDING: { label: 'Pending Payment', tone: 'neutral' },
  CONFIRMED: { label: 'Confirmed', tone: 'neutral' },
  PREPARING: { label: 'Preparing', tone: 'neutral' },
  TO_SHIP: { label: 'To Ship', tone: 'accent' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', tone: 'accent' },
  DELIVERED: { label: 'Delivered', tone: 'accent' },
  READY: { label: 'Ready for Pickup', tone: 'accent' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', tone: 'accent' },
  PICKED_UP: { label: 'Picked Up', tone: 'accent' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

const TONE_COLORS = {
  neutral: { bg: colors.gray100, text: colors.gray700 },
  accent: { bg: '#fef3c7', text: '#92400e' },
  success: { bg: colors.primaryLighter, text: colors.secondaryDark },
  danger: { bg: '#fee2e2', text: '#991b1b' },
};

export default function StatusBadge({ status, label, tone }) {
  const badge = status ? ORDER_STATUS_BADGES[status] || { label: status, tone: 'neutral' } : { label, tone: tone || 'neutral' };
  const toneColors = TONE_COLORS[badge.tone] || TONE_COLORS.neutral;

  return (
    <View style={[styles.badge, { backgroundColor: toneColors.bg }]}>
      <Text style={[styles.text, { color: toneColors.text }]}>{badge.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  text: { ...typography.caption, fontWeight: '600', fontFamily: fontFamily.semiBold },
});
