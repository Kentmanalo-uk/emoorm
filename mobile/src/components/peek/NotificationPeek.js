import { StyleSheet, Text, View } from 'react-native';
import { ArrowSquareOutIcon, ChecksIcon, TrashIcon } from '../../lib/icons';
import { t, themed } from '../../theme';
import { PeekBody, peekProps, peekText } from '../Peek';

/*
 * A notification's long-press preview: its picture, title, whole message and
 * time, with Open, Mark as read and Delete under it.
 *
 *   const peekNotif = useNotificationPeek();
 *   <Pressable {...peekNotif(notif, { art, time, onOpen, onMarkRead, onDelete })}>
 *
 * `art`: the row's picture, drawn bigger by the caller; `onOpen` only when
 * the notification leads somewhere.
 */
export function useNotificationPeek() {
  return (notif, {
    art, time, onOpen, onMarkRead, onDelete,
  } = {}) => peekProps(() => (notif ? {
    content: <NotificationPeekCard notif={notif} art={art} time={time} />,
    onOpen,
    actions: [
      onOpen ? { key: 'open', label: 'Open', Icon: ArrowSquareOutIcon, onPress: onOpen } : null,
      !notif.isRead && onMarkRead ? { key: 'read', label: 'Mark as read', Icon: ChecksIcon, onPress: onMarkRead } : null,
      onDelete ? { key: 'delete', label: 'Delete', Icon: TrashIcon, destructive: true, onPress: onDelete } : null,
    ],
  } : null));
}

export function NotificationPeekCard({ notif, art, time }) {
  return (
    <View>
      {art ? <View style={styles.art}>{art}</View> : null}
      <PeekBody style={styles.body}>
        {notif.title ? <Text style={peekText.title}>{notif.title}</Text> : null}
        {notif.message ? <Text style={peekText.body}>{notif.message}</Text> : null}
        {time ? <Text style={[peekText.sub, styles.time]}>{time}</Text> : null}
      </PeekBody>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  art: { alignItems: 'center', paddingTop: 22, paddingBottom: 4 },
  body: { paddingHorizontal: 18, paddingBottom: 18, gap: 6 },
  time: { marginTop: 2, color: t.neutral[500] },
}));
