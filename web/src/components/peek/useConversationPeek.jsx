import { useNavigate } from 'react-router-dom';
import { ArrowSquareOut, Checks, Storefront } from '../../lib/icons';
import { peekProps } from './peekCore';
import { ConversationPeekCard } from './PeekCards';

/*
 * A chat's long-press preview: who it is with and its latest messages, read
 * without opening the chat (so they stay unread), with Open chat, Mark as
 * read and the shop under it.
 *
 *   const peekChat = useConversationPeek();
 *   <button onClick={open} {...peekChat(conversation, { currentUserId, onOpen: open, onMarkRead })}>
 */

export default function useConversationPeek() {
  const navigate = useNavigate();
  return (item, { currentUserId, onOpen, onMarkRead } = {}) => peekProps(() => {
    if (!item?.id) return null;
    const sellerView = item.role === 'seller';
    const open = onOpen || (() => navigate(`/messages?c=${item.id}`));
    return {
      label: sellerView ? item.buyer?.fullName || 'Buyer' : item.store?.name || 'Store',
      content: <ConversationPeekCard item={item} currentUserId={currentUserId} />,
      onOpen: open,
      actions: [
        { key: 'open', label: 'Open chat', Icon: ArrowSquareOut, onClick: open },
        item.unreadCount > 0 && onMarkRead ? { key: 'read', label: 'Mark as read', Icon: Checks, onClick: onMarkRead } : null,
        !sellerView && item.store?.slug
          ? { key: 'shop', label: 'Visit shop', Icon: Storefront, onClick: () => navigate(`/store/${item.store.slug}`) }
          : null,
      ],
    };
  });
}
