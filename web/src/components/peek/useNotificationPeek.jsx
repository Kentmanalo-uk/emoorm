import { ArrowSquareOut, Checks, Trash } from '../../lib/icons';
import { peekProps } from './peekCore';
import { NotificationPeekCard } from './PeekCards';

/*
 * A notification's long-press preview: its picture, title, whole message and
 * time, with Open, Mark as read and Delete under it (the row's own handlers).
 *
 *   const peekNotif = useNotificationPeek();
 *   <div onClick={open} {...peekNotif(notif, { art, time, onOpen, onMarkRead, onDelete })}>
 *
 * `art`: the row's picture, drawn bigger by the caller; `onOpen` only when
 * the notification leads somewhere.
 */
export default function useNotificationPeek() {
  return (notif, {
    art, time, onOpen, onMarkRead, onDelete,
  } = {}) => peekProps(() => (notif ? {
    label: notif.title || 'Notification',
    content: <NotificationPeekCard notif={notif} art={art} time={time} />,
    onOpen,
    actions: [
      onOpen ? { key: 'open', label: 'Open', Icon: ArrowSquareOut, onClick: onOpen } : null,
      !notif.isRead && onMarkRead ? { key: 'read', label: 'Mark as read', Icon: Checks, onClick: onMarkRead } : null,
      onDelete ? {
        key: 'delete', label: 'Delete', Icon: Trash, danger: true, onClick: onDelete,
      } : null,
    ],
  } : null));
}
