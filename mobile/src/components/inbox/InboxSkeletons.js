import { StyleSheet, View } from 'react-native';
import { t, themed } from '../../theme';
import { PageLoader } from '../BrandLoader';

/** The chat list while it loads (web PageSkeletons ConversationListSkeleton). */
export function ConversationListSkeleton({ rows = 7 }) {
  return <PageLoader label="Loading chats" />;
}

/** The notification list while it loads (.notif-loading / .notif-skeleton). */
export function NotificationListSkeleton({ rows = 5 }) {
  return <PageLoader label="Loading notifications" />;
}

const styles = themed(() => StyleSheet.create({
  convos: { backgroundColor: t.neutral[0] },
  convo: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: t.neutral[150],
  },
  lines: { flex: 1, minWidth: 0, gap: 7 },
  notifs: { gap: 10 },
  notif: { backgroundColor: t.neutral[100] },
}));
