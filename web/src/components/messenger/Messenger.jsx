import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  PaperPlaneTilt as Send, ChatText as MessageSquare, Storefront as StoreIcon, User as UserIcon,
  Package, PushPin as Pin, ArrowsClockwise as RefreshCw, CircleNotch as Loader2,
  MagnifyingGlass, CaretLeft, DotsThreeVertical, Tag as TagIcon, Image as ImageIcon,
  Check,
} from '@phosphor-icons/react';
import axiosInstance from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import './Messenger.css';

const POLL_INTERVAL_MS = 5000;

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString();
};

const formatFullTime = (iso) => {
  if (!iso) return '';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatMoney = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const ORDER_STATUS_STYLES = {
  PENDING: { label: 'Pending', tone: 'amber' },
  CONFIRMED: { label: 'Confirmed', tone: 'blue' },
  PREPARING: { label: 'Preparing', tone: 'blue' },
  READY: { label: 'Ready for pickup', tone: 'teal' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'red' },
};

function ConversationListItem({ item, active, currentUserId, onClick }) {
  const isSellerView = item.role === 'seller';
  const title = isSellerView
    ? item.buyer?.fullName || 'Buyer'
    : item.store?.name || 'Store';
  const subtitle = isSellerView ? 'Buyer' : 'Store';

  const lastPreview = item.lastMessage
    ? item.lastMessage.senderId === currentUserId
      ? `You: ${item.lastMessage.body}`
      : item.lastMessage.body
    : 'Start the conversation';

  const avatar = isSellerView ? item.buyer?.profilePhoto : item.store?.logo;

  return (
    <button
      type="button"
      className={`msgr-convo-item ${active ? 'is-active' : ''}`}
      onClick={onClick}
    >
      <div className="msgr-avatar">
        {avatar ? (
          <img src={avatar} alt={title} />
        ) : isSellerView ? (
          <span>{title.slice(0, 1).toUpperCase()}</span>
        ) : (
          <StoreIcon size={18} weight="regular" />
        )}
      </div>
      <div className="msgr-convo-body">
        <div className="msgr-convo-row">
          <span className="msgr-convo-title">{title}</span>
          <span className="msgr-convo-time">{formatTime(item.lastMessageAt)}</span>
        </div>
        <div className="msgr-convo-row">
          <span className="msgr-convo-preview">{lastPreview}</span>
          {item.unreadCount > 0 && (
            <span className="msgr-badge">{item.unreadCount}</span>
          )}
        </div>
        <div className="msgr-convo-role">{subtitle}</div>
      </div>
    </button>
  );
}

function PinnedOrderCard({ order, onAttach }) {
  const style = ORDER_STATUS_STYLES[order.status] || { label: order.status, tone: 'gray' };
  const firstItem = order.items?.[0];
  const thumb = firstItem?.image;
  const extra = Math.max(0, (order.itemCount || 0) - (firstItem?.quantity || 0));
  const dateLabel = new Date(order.createdAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="msgr-pin-card">
      <div className="msgr-pin-thumb">
        {thumb ? (
          <img src={thumb} alt="" />
        ) : (
          <Package size={18} strokeWidth={1.6} />
        )}
      </div>
      <div className="msgr-pin-body">
        <div className="msgr-pin-row-top">
          <span className="msgr-pin-num">#{order.orderNumber}</span>
          <span className={`msgr-pin-status is-${style.tone}`}>{style.label}</span>
        </div>
        <div className="msgr-pin-name" title={firstItem?.productName}>
          {firstItem?.productName || 'Order items'}
          {extra > 0 && <span className="msgr-pin-more"> +{extra} more</span>}
        </div>
        <div className="msgr-pin-row-bottom">
          <span className="msgr-pin-total">{formatMoney(order.total)}</span>
          <span className="msgr-pin-date">{dateLabel}</span>
          {onAttach && (
            <button
              type="button"
              className="msgr-pin-attach"
              onClick={() => onAttach(order)}
              title="Reference this order in your next message"
            >
              Reference
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, isSelf }) {
  return (
    <div className={`msgr-bubble-row ${isSelf ? 'is-self' : ''}`}>
      {!isSelf && (
        <div className="msgr-bubble-avatar">
          {message.sender?.profilePhoto ? (
            <img src={message.sender.profilePhoto} alt="" />
          ) : (
            <UserIcon size={14} />
          )}
        </div>
      )}
      <div className="msgr-bubble">
        {message.order && (
          <div className="msgr-bubble-order">
            <Pin size={11} />
            <div>
              <div className="msgr-bubble-order-num">
                Order #{message.order.orderNumber}
              </div>
              <div className="msgr-bubble-order-meta">
                {ORDER_STATUS_STYLES[message.order.status]?.label || message.order.status}
                {' · '}
                {formatMoney(message.order.total)}
              </div>
            </div>
          </div>
        )}
        {message.body && <p className="msgr-bubble-text">{message.body}</p>}
        <span className="msgr-bubble-time">
          {formatFullTime(message.createdAt)}
          {isSelf && <Check size={12} weight="bold" className="msgr-bubble-check" />}
        </span>
      </div>
    </div>
  );
}

export default function Messenger({ role = 'buyer', className = '' }) {
  const currentUser = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStoreId = searchParams.get('store');
  const initialConversationId = searchParams.get('c');

  const [conversations, setConversations] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState(initialConversationId || null);
  const [activeConvo, setActiveConvo] = useState(null);
  const [loadingConvo, setLoadingConvo] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachedOrderId, setAttachedOrderId] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef(null);
  const activeIdRef = useRef(activeId);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    });
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/messages/conversations');
      setConversations(res.data || []);
    } catch (err) {
      // Silent — main error surface is per-conversation
      console.error('Failed to load conversations', err);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const fetchConversation = useCallback(
    async (id, { silent = false } = {}) => {
      if (!id) return null;
      if (!silent) setLoadingConvo(true);
      try {
        const res = await axiosInstance.get(`/messages/conversations/${id}`);
        setActiveConvo(res.data);
        setError('');
        return res.data;
      } catch (err) {
        setError(err?.message || 'Could not load this conversation');
        return null;
      } finally {
        if (!silent) setLoadingConvo(false);
      }
    },
    [],
  );

  const openConversationWithStore = useCallback(
    async (storeId) => {
      try {
        const res = await axiosInstance.post('/messages/conversations', { storeId });
        const convo = res.data;
        setActiveId(convo.id);
        setActiveConvo(convo);
        setSearchParams({ c: convo.id }, { replace: true });
        await fetchConversations();
      } catch (err) {
        setError(err?.message || 'Could not open conversation');
      }
    },
    [fetchConversations, setSearchParams],
  );

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // If ?store=... provided, open/create that conversation
  useEffect(() => {
    if (initialStoreId) {
      openConversationWithStore(initialStoreId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStoreId]);

  // Load active conversation whenever activeId changes
  useEffect(() => {
    if (!activeId) return;
    fetchConversation(activeId).then((convo) => {
      if (convo) scrollToBottom();
      // mark read
      axiosInstance.post(`/messages/conversations/${activeId}/read`).catch(() => { });
    });
  }, [activeId, fetchConversation, scrollToBottom]);

  // Poll for new messages every few seconds
  useEffect(() => {
    if (!activeId) return undefined;
    const interval = setInterval(async () => {
      if (activeIdRef.current !== activeId) return;
      const prevCount = activeConvo?.messages?.length || 0;
      const next = await fetchConversation(activeId, { silent: true });
      if (next && (next.messages?.length || 0) > prevCount) {
        scrollToBottom();
        axiosInstance.post(`/messages/conversations/${activeId}/read`).catch(() => { });
        fetchConversations();
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeId, activeConvo, fetchConversation, fetchConversations, scrollToBottom]);

  const filteredConversations = useMemo(() => {
    const roleScoped =
      role === 'seller'
        ? conversations.filter((c) => c.role === 'seller')
        : role === 'buyer'
          ? conversations.filter((c) => c.role === 'buyer')
          : conversations;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return roleScoped;
    return roleScoped.filter((c) => {
      const name = c.role === 'seller'
        ? (c.buyer?.fullName || '')
        : (c.store?.name || '');
      return name.toLowerCase().includes(q);
    });
  }, [conversations, role, searchQuery]);

  const handleSelect = (id) => {
    setActiveId(id);
    setDraft('');
    setAttachedOrderId(null);
    setSearchParams({ c: id }, { replace: true });
  };

  const handleBackToList = () => {
    setActiveId(null);
    setActiveConvo(null);
    setDraft('');
    setAttachedOrderId(null);
    // Keep other params if any but drop the active conversation.
    const next = new URLSearchParams(searchParams);
    next.delete('c');
    setSearchParams(next, { replace: true });
  };

  // Hide the app's mobile bottom nav while an active chat is open (matches reference).
  useEffect(() => {
    if (!activeId) return undefined;
    document.body.classList.add('messenger-chat-open');
    return () => document.body.classList.remove('messenger-chat-open');
  }, [activeId]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || !activeId || sending) return;
    setSending(true);
    try {
      await axiosInstance.post(`/messages/conversations/${activeId}/messages`, {
        body,
        orderId: attachedOrderId || undefined,
      });
      setDraft('');
      setAttachedOrderId(null);
      await fetchConversation(activeId, { silent: true });
      scrollToBottom();
      fetchConversations();
    } catch (err) {
      setError(err?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const attachedOrder = useMemo(() => {
    if (!attachedOrderId || !activeConvo?.pinnedOrders) return null;
    return activeConvo.pinnedOrders.find((o) => o.id === attachedOrderId) || null;
  }, [attachedOrderId, activeConvo]);

  const activeHeader = useMemo(() => {
    if (!activeConvo) return null;
    if (activeConvo.role === 'seller') {
      return {
        title: activeConvo.buyer?.fullName || 'Buyer',
        subtitle: 'Customer',
        avatar: activeConvo.buyer?.profilePhoto,
        icon: <UserIcon size={16} />,
        link: null,
      };
    }
    return {
      title: activeConvo.store?.name || 'Store',
      subtitle: 'Store',
      avatar: activeConvo.store?.logo,
      icon: <StoreIcon size={16} />,
      link: activeConvo.store?.slug ? `/store/${activeConvo.store.slug}` : null,
    };
  }, [activeConvo]);

  return (
    <div className={`msgr-shell ${activeId ? 'has-active' : ''} ${className}`}>
      <aside className="msgr-list">
        <header className="msgr-list-head">
          <h2>
            <MessageSquare size={16} />
            Messages
          </h2>
          <button
            type="button"
            className="msgr-icon-btn"
            title="Refresh"
            onClick={fetchConversations}
          >
            <RefreshCw size={14} />
          </button>
        </header>
        <div className="msgr-list-search">
          <MagnifyingGlass size={16} />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={role === 'seller' ? 'Search buyers' : 'Search stores'}
            aria-label="Search conversations"
          />
        </div>
        <div className="msgr-list-scroll">
          {loadingList ? (
            <div className="msgr-list-empty">
              <Loader2 size={16} className="msgr-spin" weight="fill" />
              <span>Loading conversations…</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="msgr-list-empty">
              <MessageSquare size={26} strokeWidth={1.4} weight="fill" />
              <p>No conversations yet.</p>
              {role === 'buyer' ? (
                <Link to="/stores" className="msgr-empty-link">
                  Browse stores
                </Link>
              ) : (
                <span>Buyers will appear here when they message you.</span>
              )}
            </div>
          ) : (
            filteredConversations.map((c) => (
              <ConversationListItem
                key={c.id}
                item={c}
                active={c.id === activeId}
                currentUserId={currentUser?.id}
                onClick={() => handleSelect(c.id)}
              />
            ))
          )}
        </div>
      </aside>

      <section className="msgr-thread">
        {!activeId ? (
          <div className="msgr-thread-empty">
            <MessageSquare size={40} strokeWidth={1.3} weight="fill" />
            <p>Select a conversation to start chatting.</p>
          </div>
        ) : loadingConvo && !activeConvo ? (
          <div className="msgr-thread-empty">
            <Loader2 size={22} className="msgr-spin" weight="fill" />
            <p>Loading conversation…</p>
          </div>
        ) : activeConvo ? (
          <>
            <header className="msgr-thread-head">
              <button
                type="button"
                className="msgr-thread-back"
                onClick={handleBackToList}
                aria-label="Back to conversations"
              >
                <CaretLeft size={22} />
              </button>
              <div className="msgr-avatar msgr-avatar-lg">
                {activeHeader?.avatar ? (
                  <img src={activeHeader.avatar} alt={activeHeader.title} />
                ) : (
                  activeHeader?.icon
                )}
              </div>
              <div className="msgr-thread-title">
                <div className="msgr-thread-name">
                  {activeHeader?.link ? (
                    <Link to={activeHeader.link}>{activeHeader?.title}</Link>
                  ) : (
                    activeHeader?.title
                  )}
                </div>
                <div className="msgr-thread-sub">{activeHeader?.subtitle}</div>
              </div>
              <button
                type="button"
                className="msgr-thread-menu"
                aria-label="Conversation options"
              >
                <DotsThreeVertical size={22} />
              </button>
            </header>

            {activeConvo.pinnedOrders?.length > 0 && (
              <div className="msgr-pins">
                <div className="msgr-pins-head">
                  <Pin size={11} />
                  <span>
                    {activeConvo.role === 'seller' ? 'Buyer orders' : 'Your orders'}
                    <span className="msgr-pins-count"> · {activeConvo.pinnedOrders.length}</span>
                  </span>
                </div>
                <div className="msgr-pins-track">
                  {activeConvo.pinnedOrders.map((o) => (
                    <PinnedOrderCard
                      key={o.id}
                      order={o}
                      onAttach={activeConvo.role === 'buyer' ? (order) => {
                        setAttachedOrderId(order.id);
                      } : undefined}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="msgr-messages">
              {(activeConvo.messages || []).length === 0 ? (
                <div className="msgr-messages-empty">
                  <MessageSquare size={22} strokeWidth={1.4} weight="fill" />
                  <p>Say hello to start the conversation.</p>
                </div>
              ) : (
                (activeConvo.messages || []).map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    isSelf={m.senderId === currentUser?.id}
                  />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && <div className="msgr-error">{error}</div>}

            <form className="msgr-composer" onSubmit={handleSend}>
              {attachedOrder && (
                <div className="msgr-composer-attach">
                  <Pin size={12} />
                  <span>
                    Attaching Order #{attachedOrder.orderNumber}
                  </span>
                  <button
                    type="button"
                    className="msgr-composer-attach-clear"
                    onClick={() => setAttachedOrderId(null)}
                  >
                    Remove
                  </button>
                </div>
              )}
              <div className="msgr-composer-row">
                <button
                  type="button"
                  className="msgr-composer-icon"
                  aria-label="Attach product"
                  title="Attach product"
                >
                  <TagIcon size={20} />
                </button>
                <button
                  type="button"
                  className="msgr-composer-icon"
                  aria-label="Attach image"
                  title="Attach image"
                >
                  <ImageIcon size={20} />
                </button>
                <textarea
                  rows={1}
                  className="msgr-composer-input"
                  placeholder="Type a message..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="msgr-composer-send"
                  disabled={!draft.trim() || sending}
                  aria-label="Send message"
                >
                  {sending ? (
                    <Loader2 size={18} className="msgr-spin" />
                  ) : (
                    <Send size={20} weight="fill" />
                  )}
                  <span className="msgr-composer-send-label">Send</span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="msgr-thread-empty">
            <Package size={32} strokeWidth={1.3} weight="fill" />
            <p>{error || 'Conversation not available.'}</p>
          </div>
        )}
      </section>
    </div>
  );
}
