import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowSquareOutIcon, ChecksIcon, StorefrontIcon,
} from 'phosphor-react-native';
import apiClient from '../../api/client';
import { font, t } from '../../theme';
import ChatAvatar from '../inbox/ChatAvatar';
import InboxSpinner from '../inbox/InboxSpinner';
import { formatTime } from '../inbox/inboxFormat';
import { peekProps, peekText } from '../Peek';

/*
 * A chat's long-press preview: who it is with and its latest messages, read
 * without opening the chat (so they stay unread), with Open chat, Mark as
 * read and the shop under it.
 *
 *   const peekChat = useConversationPeek();
 *   <Pressable onPress={open} {...peekChat(conversation, { currentUserId, onOpen: open, onMarkRead })}>
 */

const SHOWN = 6;

export function useConversationPeek() {
  const router = useRouter();
  return (item, { currentUserId, onOpen, onMarkRead } = {}) => peekProps(() => {
    if (!item?.id) return null;
    const sellerView = item.role === 'seller';
    const open = onOpen || (() => router.push({ pathname: '/conversation/[id]', params: { id: item.id } }));
    return {
      content: <ConversationPeekCard item={item} currentUserId={currentUserId} />,
      onOpen: open,
      actions: [
        { key: 'open', label: 'Open chat', Icon: ArrowSquareOutIcon, onPress: open },
        item.unreadCount > 0 && onMarkRead ? { key: 'read', label: 'Mark as read', Icon: ChecksIcon, onPress: onMarkRead } : null,
        !sellerView && item.store?.slug
          ? { key: 'shop', label: 'Visit shop', Icon: StorefrontIcon, onPress: () => router.push(`/store/${item.store.slug}`) }
          : null,
      ],
    };
  });
}

/** What the last message was, in a line (photos, products and orders have no text of their own). */
const lineOf = (m) => {
  if (m.unsentAt) return 'Message unsent';
  if (m.body) return m.body;
  if (m.imageUrl) return 'Photo';
  if (m.product?.name) return `Product: ${m.product.name}`;
  if (m.order?.orderNumber) return `Order #${m.order.orderNumber}`;
  return '';
};

/** The preview itself: loads the chat's newest messages when it opens. */
export function ConversationPeekCard({ item, currentUserId }) {
  const sellerView = item.role === 'seller';
  const title = sellerView ? item.buyer?.fullName || 'Buyer' : item.store?.name || 'Store';
  const [messages, setMessages] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    apiClient.get(`/messages/conversations/${item.id}`)
      .then((res) => { if (live) setMessages((res.data?.messages || []).filter((m) => lineOf(m)).slice(-SHOWN)); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [item.id]);

  return (
    <View>
      <View style={styles.head}>
        <ChatAvatar
          src={sellerView ? item.buyer?.profilePhoto : item.store?.logo}
          name={title}
          size={44}
          bg={t.success[100]}
          color={t.primary[600]}
          fallbackIcon={sellerView ? null : StorefrontIcon}
        />
        <View style={styles.headText}>
          <Text style={peekText.title} numberOfLines={1}>{title}</Text>
          {item.lastMessageAt ? <Text style={peekText.sub}>{formatTime(item.lastMessageAt)}</Text> : null}
        </View>
      </View>
      <View style={styles.thread}>
        {messages === null && !failed ? (
          <View style={styles.center}><InboxSpinner size={22} color={t.primary[600]} /></View>
        ) : null}
        {failed ? <Text style={[peekText.sub, styles.note]}>{'Couldn’t load the messages. Open the chat to see them.'}</Text> : null}
        {messages && messages.length === 0 ? <Text style={[peekText.sub, styles.note]}>No messages yet.</Text> : null}
        {(messages || []).map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={[styles.bubbleText, mine && styles.mineText]} numberOfLines={4}>{lineOf(m)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: t.neutral[100],
  },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  thread: { minHeight: 120, gap: 6, padding: 12, backgroundColor: t.neutral[50] },
  center: { flex: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center' },
  note: { textAlign: 'center', paddingVertical: 36 },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16 },
  theirs: { alignSelf: 'flex-start', backgroundColor: t.neutral[0], borderWidth: 1, borderColor: t.neutral[150] || t.neutral[200] },
  mine: { alignSelf: 'flex-end', backgroundColor: t.primary[600] },
  bubbleText: { fontSize: 14, lineHeight: 19, ...font(400), color: t.neutral[800] },
  mineText: { color: t.neutral[0] },
});
