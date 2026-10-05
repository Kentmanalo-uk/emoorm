import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StorefrontIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
import ChatAvatar from './ChatAvatar';
import { GradientFill } from './InboxGradient';
import { formatTime } from './inboxFormat';

/**
 * A chat in the Messages list on phones (web .msgr-convo-item): the shop's
 * logo (or the buyer's photo, seller side), its name, the last message, the
 * time at the top right and the unread count under it.
 *
 * Pass `item` (a conversation from GET /messages/conversations) with
 * `currentUserId`, or the parts directly (Ate Moormy's row: `moormy`,
 * `avatar`, `title`, `titleAfter`, `time`, `preview`).
 */
export default function ConversationRow({
  item, currentUserId, onPress, moormy = false, avatar, title: titleProp, titleAfter, time: timeProp, preview: previewProp,
}) {
  let title = titleProp;
  let preview = previewProp;
  let time = timeProp;
  let unread = 0;
  let pic = avatar;
  if (item) {
    const isSellerView = item.role === 'seller';
    title = isSellerView ? item.buyer?.fullName || 'Buyer' : item.store?.name || 'Store';
    preview = item.lastMessage
      ? item.lastMessage.senderId === currentUserId ? `You: ${item.lastMessage.body}` : item.lastMessage.body
      : 'Start the conversation';
    time = formatTime(item.lastMessageAt);
    unread = item.unreadCount || 0;
    pic = (
      <ChatAvatar
        src={isSellerView ? item.buyer?.profilePhoto : item.store?.logo}
        name={title}
        size={44}
        bg={t.success[100]}
        color={t.primary[600]}
        fallbackIcon={isSellerView ? null : StorefrontIcon}
      />
    );
  }
  const isUnread = unread > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${isUnread ? `, ${unread} unread` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {moormy ? <GradientFill diagonal={false} colors={['rgba(236, 72, 153, 0.05)', 'rgba(16, 185, 129, 0.05)']} /> : null}
      {pic}
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {titleAfter}
        </View>
        <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={1}>{preview}</Text>
      </View>
      {time ? <Text style={styles.time} numberOfLines={1}>{time}</Text> : null}
      {isUnread ? (
        <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View>
      ) : null}
    </Pressable>
  );
}


const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 69,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.neutral[100],
    backgroundColor: 'transparent',
  },
  pressed: { backgroundColor: t.neutral[100] },
  body: { flex: 1, minWidth: 0, paddingRight: 58, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  title: { flexShrink: 1, fontSize: 15, lineHeight: 18, color: t.neutral[900], ...font(500) },
  preview: { marginTop: 2, fontSize: 13, lineHeight: 15.6, color: t.neutral[500], ...font(400) },
  previewUnread: { color: t.neutral[900], ...font(500) },
  time: { position: 'absolute', right: 12, top: 14, maxWidth: 54, fontSize: 12, lineHeight: 14.4, color: t.neutral[500], textAlign: 'right', ...font(400) },
  badge: {
    position: 'absolute', right: 12, bottom: 12, minWidth: 18, height: 18, paddingHorizontal: 6,
    borderRadius: 9999, backgroundColor: t.primary[600], alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 10.5, lineHeight: 12.6, color: t.neutral[0], ...font(500) },
});
