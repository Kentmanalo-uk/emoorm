import { View, Text, StyleSheet } from 'react-native';
import { colors, fontFamily, radius, spacing, typography, themed } from '../theme';
import { statusLabel } from './orders/orderProgress';

// An order status as a badge: the words every order screen uses (orderProgress statusLabel).
const ORDER_STATUS_TONES = {
  PENDING: 'neutral',
  CONFIRMED: 'neutral',
  PREPARING: 'neutral',
  TO_SHIP: 'accent',
  READY: 'accent',
  OUT_FOR_DELIVERY: 'accent',
  SHIPPED: 'accent',
  DELIVERED: 'accent',
  READY_FOR_PICKUP: 'accent',
  PICKED_UP: 'accent',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};
export const ORDER_STATUS_BADGES = Object.fromEntries(Object.entries(ORDER_STATUS_TONES)
  .map(([status, tone]) => [status, { label: statusLabel(status), tone }]));

const TONE_COLORS = themed(() => ({
  neutral: { bg: colors.gray100, text: colors.gray700 },
  accent: { bg: '#fef3c7', text: '#92400e' },
  success: { bg: colors.primaryLighter, text: colors.secondaryDark },
  danger: { bg: '#fee2e2', text: '#991b1b' },
}));

export default function StatusBadge({ status, label, tone }) {
  const badge = status ? ORDER_STATUS_BADGES[status] || { label: status, tone: 'neutral' } : { label, tone: tone || 'neutral' };
  const toneColors = TONE_COLORS[badge.tone] || TONE_COLORS.neutral;

  return (
    <View style={[styles.badge, { backgroundColor: toneColors.bg }]}>
      <Text style={[styles.text, { color: toneColors.text }]}>{badge.label}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  text: { ...typography.caption, fontWeight: '600', fontFamily: fontFamily.semiBold },
}));
