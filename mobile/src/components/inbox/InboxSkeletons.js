import { StyleSheet, View } from 'react-native';
import LoadingSkeleton from '../LoadingSkeleton';
import { t } from '../../theme';

/** The chat list while it loads (web PageSkeletons ConversationListSkeleton). */
export function ConversationListSkeleton({ rows = 7 }) {
  return (
    <View style={styles.convos} accessibilityLabel="Loading conversations">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.convo}>
          <LoadingSkeleton width={48} height={48} borderRadius={24} />
          <View style={styles.lines}>
            <LoadingSkeleton height={13} width={`${45 + ((i * 13) % 30)}%`} borderRadius={6} />
            <LoadingSkeleton height={11} width={`${60 + ((i * 17) % 30)}%`} borderRadius={6} />
          </View>
          <LoadingSkeleton height={10} width={34} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

/** The notification list while it loads (.notif-loading / .notif-skeleton). */
export function NotificationListSkeleton({ rows = 5 }) {
  return (
    <View style={styles.notifs} accessibilityLabel="Loading notifications">
      {Array.from({ length: rows }).map((_, i) => (
        <LoadingSkeleton key={i} height={72} borderRadius={8} style={styles.notif} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  convos: { backgroundColor: t.neutral[0] },
  convo: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: t.neutral[150],
  },
  lines: { flex: 1, minWidth: 0, gap: 7 },
  notifs: { gap: 10 },
  notif: { backgroundColor: t.neutral[100] },
});
