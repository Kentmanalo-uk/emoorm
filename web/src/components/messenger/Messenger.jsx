import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  PaperPlaneTilt as Send, ChatText as MessageSquare, Storefront as StoreIcon, User as UserIcon,
  Package, PushPin as Pin, ArrowsClockwise as RefreshCw, CircleNotch as Loader2,
  MagnifyingGlass, CaretLeft, Tag as TagIcon, Image as ImageIcon,
  Check, Checks, X, Flag, EnvelopeOpen, Funnel,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axiosInstance from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import SafetyNotice from '../common/SafetyNotice';
import UserAvatar from '../ui/UserAvatar';
import ProductImage from '../ProductImage';
import MoreMenu from '../MoreMenu';
import ReportModal from '../ReportModal';
import './Messenger.css';

const POLL_INTERVAL_MS = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const QUICK_QUESTIONS = [
  'Hi! Is this still available?',
  'How much is delivery to my area?',
  'Can I pick up my order?',
];

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

const formatClock = (iso) => (iso
  ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  : '');

// "Today", "Yesterday", or the date: the separators between days in a chat.
const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};

const formatMoney = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const firstImageOf = (product) => {
  const imgs = product?.images;
  if (Array.isArray(imgs)) return imgs[0] || null;
  if (typeof imgs === 'string') {
    try { const parsed = JSON.parse(imgs); return Array.isArray(parsed) ? parsed[0] : imgs; } catch { return imgs; }
  }
  return product?.image || null;
};

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
      className={`msgr-convo-item ${active ? 'is-active' : ''} ${item.unreadCount > 0 ? 'is-unread' : ''}`}
      onClick={onClick}
    >
      <div className="msgr-avatar">
        <UserAvatar
          src={avatar}
          name={title}
          alt={title}
          fallbackIcon={isSellerView ? null : StoreIcon}
        />
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
        <ProductImage src={thumb} alt="" />
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

function MessageBubble({ message, isSelf, seen, onOpenImage }) {
  const product = message.product;
  const hasMedia = Boolean(message.imageUrl);
  return (
    <div className={`msgr-bubble-row ${isSelf ? 'is-self' : ''}`}>
      {!isSelf && (
        <div className="msgr-bubble-avatar">
          <UserAvatar
            src={message.sender?.profilePhoto}
            name={message.sender?.fullName}
            alt=""
            fallbackIcon={UserIcon}
            iconSize={14}
          />
        </div>
      )}
      <div className={`msgr-bubble${hasMedia && !message.body && !product && !message.order ? ' is-media-only' : ''}`}>
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
        {product && (
          <Link to={`/product/${product.slug}`} className="msgr-bubble-product">
            <span className="msgr-bubble-product-img">
              <ProductImage src={product.image} alt="" />
            </span>
            <span className="msgr-bubble-product-text">
              <span className="msgr-bubble-product-name">{product.name}</span>
              <span className="msgr-bubble-product-price">{formatMoney(product.price)}</span>
            </span>
          </Link>
        )}
        {hasMedia && (
          <button type="button" className="msgr-bubble-image" onClick={() => onOpenImage(message.imageUrl)} aria-label="Open photo">
            <img src={resolveImg(message.imageUrl) || message.imageUrl} alt="Sent photo" loading="lazy" />
          </button>
        )}
        {message.body && <p className="msgr-bubble-text">{message.body}</p>}
        <span className="msgr-bubble-time">
          {formatClock(message.createdAt)}
          {isSelf && (seen
            ? <Checks size={13} weight="bold" className="msgr-bubble-check is-seen" aria-label="Seen" />
            : <Check size={12} weight="bold" className="msgr-bubble-check" aria-label="Sent" />)}
        </span>
      </div>
    </div>
  );
}

/** Bottom sheet listing the shop's products to attach to the next message. */
function ProductPicker({ storeId, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await axiosInstance.get('/products', {
          params: { storeId, pageSize: 30, ...(query.trim() ? { search: query.trim() } : {}) },
        });
        if (live) setItems(res.data || []);
      } catch {
        if (live) setItems([]);
      } finally {
        if (live) setLoading(false);
      }
    }, query ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [storeId, query]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="msgr-sheet-backdrop" onClick={onClose} role="presentation">
      <div className="msgr-sheet" role="dialog" aria-modal="true" aria-label="Attach a product" onClick={(e) => e.stopPropagation()}>
        <div className="msgr-sheet-head">
          <span className="msgr-sheet-grabber" aria-hidden="true" />
          <h3>Attach a product</h3>
          <button type="button" className="msgr-sheet-close" onClick={onClose} aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </div>
        <label className="msgr-sheet-search">
          <MagnifyingGlass size={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => { setLoading(true); setQuery(e.target.value); }}
            placeholder="Search this shop's products"
            aria-label="Search products"
          />
        </label>
        <div className="msgr-sheet-list">
          {loading ? (
            <div className="msgr-sheet-empty"><Loader2 size={18} className="msgr-spin" /> Loading products…</div>
          ) : items.length === 0 ? (
            <div className="msgr-sheet-empty">{query ? `No products match “${query}”.` : 'This shop has no products yet.'}</div>
          ) : items.map((p) => {
            const img = firstImageOf(p);
            return (
              <button type="button" key={p.id} className="msgr-sheet-item" onClick={() => onPick({ id: p.id, name: p.name, price: Number(p.price), image: img, slug: p.slug })}>
                <span className="msgr-sheet-item-img">
                  <ProductImage src={img} alt="" />
                </span>
                <span className="msgr-sheet-item-text">
                  <span className="msgr-sheet-item-name">{p.name}</span>
                  <span className="msgr-sheet-item-price">{formatMoney(p.price)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * title: when given (the Messages page), the component renders the page
 * header itself: the title, a search button and a ⋯ menu that act on the
 * conversation list it owns.
 */
export default function Messenger({ role = 'buyer', className = '', title = '' }) {
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
  const [pendingImage, setPendingImage] = useState(null); // { file, preview }
  const [pendingProduct, setPendingProduct] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewerImage, setViewerImage] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
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
        if (!silent) setError('');
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
    const scoped = unreadOnly ? roleScoped.filter((c) => c.unreadCount > 0) : roleScoped;
    if (!q) return scoped;
    return scoped.filter((c) => {
      const name = c.role === 'seller'
        ? (c.buyer?.fullName || '')
        : (c.store?.name || '');
      return name.toLowerCase().includes(q);
    });
  }, [conversations, role, searchQuery, unreadOnly]);

  const unreadChats = conversations.filter((c) => c.unreadCount > 0 && (role === 'buyer' || role === 'seller' ? c.role === role : true));

  const markAllRead = async () => {
    const ids = unreadChats.map((c) => c.id);
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => axiosInstance.post(`/messages/conversations/${id}/read`)));
    await fetchConversations();
    toast.success(ids.length === 1 ? 'Chat marked as read' : `${ids.length} chats marked as read`);
  };

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      setSearchQuery('');
    } else {
      setSearchOpen(true);
    }
  };

  const clearPendingImage = useCallback(() => {
    setPendingImage((cur) => {
      if (cur?.preview) URL.revokeObjectURL(cur.preview);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetComposer = () => {
    setDraft('');
    setAttachedOrderId(null);
    setPendingProduct(null);
    clearPendingImage();
  };

  const handleSelect = (id) => {
    setActiveId(id);
    resetComposer();
    setSearchParams({ c: id }, { replace: true });
  };

  const handleBackToList = () => {
    setActiveId(null);
    setActiveConvo(null);
    resetComposer();
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

  // Escape closes the full-screen photo.
  useEffect(() => {
    if (!viewerImage) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setViewerImage(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [viewerImage]);

  // The input grows with the text, up to about five lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const handlePickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setError('Send a JPG, PNG, WebP or GIF photo.');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That photo is over 5 MB. Choose a smaller one.');
      e.target.value = '';
      return;
    }
    setError('');
    setPendingImage((cur) => {
      if (cur?.preview) URL.revokeObjectURL(cur.preview);
      return { file, preview: URL.createObjectURL(file) };
    });
  };

  const sendMessage = async (bodyText) => {
    const body = (bodyText ?? draft).trim();
    if ((!body && !pendingImage && !pendingProduct && !attachedOrderId) || !activeId || sending) return;
    setSending(true);
    setError('');
    try {
      let imageUrl;
      if (pendingImage) {
        const form = new FormData();
        form.append('file', pendingImage.file);
        const up = await axiosInstance.post('/upload/image', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        imageUrl = up.data?.url;
        if (!imageUrl) throw new Error('Could not upload the photo');
      }
      await axiosInstance.post(`/messages/conversations/${activeId}/messages`, {
        body,
        imageUrl: imageUrl || undefined,
        orderId: attachedOrderId || undefined,
        productId: pendingProduct?.id || undefined,
      });
      resetComposer();
      await fetchConversation(activeId, { silent: true });
      scrollToBottom();
      fetchConversations();
    } catch (err) {
      setError(err?.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    sendMessage();
  };

  const attachedOrder = useMemo(() => {
    if (!attachedOrderId || !activeConvo?.pinnedOrders) return null;
    return activeConvo.pinnedOrders.find((o) => o.id === attachedOrderId) || null;
  }, [attachedOrderId, activeConvo]);

  const isSellerSide = activeConvo?.role === 'seller';

  const activeHeader = useMemo(() => {
    if (!activeConvo) return null;
    if (activeConvo.role === 'seller') {
      return {
        title: activeConvo.buyer?.fullName || 'Buyer',
        subtitle: 'Customer',
        avatar: activeConvo.buyer?.profilePhoto,
        icon: <UserIcon size={16} />,
        link: activeConvo.buyer?.id ? `/u/${activeConvo.buyer.id}` : null,
      };
    }
    return {
      title: activeConvo.store?.name || 'Store',
      subtitle: 'Store · Tap to view shop',
      avatar: activeConvo.store?.logo,
      icon: <StoreIcon size={16} />,
      link: activeConvo.store?.slug ? `/store/${activeConvo.store.slug}` : null,
    };
  }, [activeConvo]);

  // When the other side last read the chat: marks my messages up to then as seen.
  const otherReadAt = activeConvo
    ? (isSellerSide ? activeConvo.buyerLastReadAt : activeConvo.sellerLastReadAt)
    : null;

  // Messages with a separator before the first message of each day.
  const timeline = useMemo(() => {
    const out = [];
    let lastDay = null;
    (activeConvo?.messages || []).forEach((m) => {
      const day = new Date(m.createdAt).toDateString();
      if (day !== lastDay) {
        out.push({ kind: 'day', key: `day-${day}`, label: dayLabel(m.createdAt) });
        lastDay = day;
      }
      out.push({ kind: 'msg', key: m.id, message: m });
    });
    return out;
  }, [activeConvo]);

  const canSend = !sending && Boolean(draft.trim() || pendingImage || pendingProduct || attachedOrderId);

  const menuItems = activeConvo ? [
    activeHeader?.link && {
      key: 'view',
      icon: isSellerSide ? <UserIcon size={17} /> : <StoreIcon size={17} />,
      label: isSellerSide ? 'View buyer profile' : 'View shop',
      to: activeHeader.link,
    },
    { key: 'refresh', icon: <RefreshCw size={17} />, label: 'Refresh', onClick: () => fetchConversation(activeId) },
    {
      key: 'report',
      icon: <Flag size={17} />,
      label: isSellerSide ? 'Report buyer' : 'Report shop',
      danger: true,
      onClick: () => setReportOpen(true),
    },
  ] : [];

  const pageHead = title && (
    <div className="msgr-page-head">
      <h1 className="messages-page-title">{title}</h1>
      <div className="msgr-page-tools">
        <button
          type="button"
          className={`msgr-page-tool${searchOpen ? ' is-active' : ''}`}
          onClick={toggleSearch}
          aria-label={searchOpen ? 'Close search' : 'Search chats'}
          aria-expanded={searchOpen}
        >
          {searchOpen ? <X size={19} weight="bold" /> : <MagnifyingGlass size={19} />}
        </button>
        <MoreMenu
          className="msgr-page-more"
          buttonClassName="msgr-page-tool"
          label="Chat options"
          iconSize={22}
          items={[
            unreadChats.length > 0 && { key: 'read', icon: <EnvelopeOpen size={17} />, label: 'Mark all as read', onClick: markAllRead },
            {
              key: 'unread',
              icon: <Funnel size={17} />,
              label: unreadOnly ? 'Show all chats' : 'Show unread only',
              onClick: () => setUnreadOnly((v) => !v),
            },
            { key: 'refresh', icon: <RefreshCw size={17} />, label: 'Refresh', onClick: fetchConversations },
          ]}
        />
      </div>
    </div>
  );

  return (
    <>
    {pageHead}
    <div className={`msgr-shell ${activeId ? 'has-active' : ''}${title ? ' has-page-head' : ''}${searchOpen || searchQuery ? ' is-searching' : ''} ${className}`}>
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
            autoFocus={searchOpen}
          />
          {searchQuery && (
            <button type="button" className="msgr-list-search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
              <X size={12} weight="bold" />
            </button>
          )}
        </div>
        {unreadOnly && (
          <div className="msgr-filter-pill">
            <button type="button" onClick={() => setUnreadOnly(false)}>
              Unread only <X size={12} weight="bold" />
            </button>
          </div>
        )}
        <div className="msgr-list-scroll">
          {loadingList ? (
            <div className="msgr-list-empty">
              <Loader2 size={16} className="msgr-spin" weight="fill" />
              <span>Loading conversations…</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="msgr-list-empty">
              <span className="msgr-empty-icon"><MessageSquare size={26} weight="fill" /></span>
              <p>
                {searchQuery
                  ? `No chats match “${searchQuery}”.`
                  : unreadOnly ? 'No unread chats. You’re all caught up.' : 'No conversations yet.'}
              </p>
              {unreadOnly && !searchQuery && (
                <button type="button" className="msgr-empty-link" onClick={() => setUnreadOnly(false)}>
                  Show all chats
                </button>
              )}
              {!searchQuery && !unreadOnly && (role === 'buyer' ? (
                <>
                  <span>Tap Chat on a product or shop to ask the seller anything.</span>
                  <Link to="/stores" className="msgr-empty-link">
                    Browse stores
                  </Link>
                </>
              ) : (
                <span>Buyers will appear here when they message you.</span>
              ))}
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
                {activeHeader?.avatar
                  ? <UserAvatar src={activeHeader.avatar} name={activeHeader.title} alt={activeHeader.title} />
                  : activeHeader?.icon}
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
              <MoreMenu
                className="msgr-thread-more"
                buttonClassName="msgr-thread-menu"
                label="Conversation options"
                iconSize={22}
                items={menuItems}
              />
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
              {timeline.length === 0 ? (
                <div className="msgr-messages-empty">
                  <div className="msgr-intro-avatar">
                    {activeHeader?.avatar
                      ? <UserAvatar src={activeHeader.avatar} name={activeHeader.title} alt="" />
                      : activeHeader?.icon}
                  </div>
                  <h3>{activeHeader?.title}</h3>
                  <p>
                    {isSellerSide
                      ? 'Say hello and let your customer know how you can help.'
                      : 'Ask about a product, delivery or pickup. You can also send a photo or attach a product.'}
                  </p>
                  {!isSellerSide && (
                    <div className="msgr-quick">
                      {QUICK_QUESTIONS.map((q) => (
                        <button type="button" key={q} className="msgr-quick-chip" onClick={() => sendMessage(q)} disabled={sending}>
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                timeline.map((entry) => (entry.kind === 'day' ? (
                  <div key={entry.key} className="msgr-day"><span>{entry.label}</span></div>
                ) : (
                  <MessageBubble
                    key={entry.key}
                    message={entry.message}
                    isSelf={entry.message.senderId === currentUser?.id}
                    seen={Boolean(otherReadAt) && new Date(otherReadAt) >= new Date(entry.message.createdAt)}
                    onOpenImage={setViewerImage}
                  />
                )))
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <div className="msgr-error" role="alert">
                <span>{error}</span>
                <button type="button" onClick={() => setError('')} aria-label="Dismiss">
                  <X size={14} weight="bold" />
                </button>
              </div>
            )}

            <SafetyNotice />

            <form className="msgr-composer" onSubmit={handleSend}>
              {(attachedOrder || pendingImage || pendingProduct) && (
                <div className="msgr-composer-attachments">
                  {pendingImage && (
                    <div className="msgr-attach-image">
                      <img src={pendingImage.preview} alt="Photo to send" />
                      {sending && <span className="msgr-attach-busy"><Loader2 size={18} className="msgr-spin" /></span>}
                      {!sending && (
                        <button type="button" onClick={clearPendingImage} aria-label="Remove photo">
                          <X size={12} weight="bold" />
                        </button>
                      )}
                    </div>
                  )}
                  {pendingProduct && (
                    <div className="msgr-attach-chip">
                      <TagIcon size={13} />
                      <span>{pendingProduct.name}</span>
                      <button type="button" onClick={() => setPendingProduct(null)} aria-label="Remove product" disabled={sending}>
                        <X size={12} weight="bold" />
                      </button>
                    </div>
                  )}
                  {attachedOrder && (
                    <div className="msgr-attach-chip">
                      <Pin size={13} />
                      <span>Order #{attachedOrder.orderNumber}</span>
                      <button type="button" onClick={() => setAttachedOrderId(null)} aria-label="Remove order" disabled={sending}>
                        <X size={12} weight="bold" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="msgr-composer-row">
                <button
                  type="button"
                  className="msgr-composer-icon"
                  aria-label="Attach product"
                  title="Attach product"
                  onClick={() => setPickerOpen(true)}
                  disabled={sending || !activeConvo.store?.id}
                >
                  <TagIcon size={20} />
                </button>
                <button
                  type="button"
                  className="msgr-composer-icon"
                  aria-label="Send a photo"
                  title="Send a photo"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                >
                  <ImageIcon size={20} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_TYPES.join(',')}
                  className="msgr-file-input"
                  onChange={handlePickImage}
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <textarea
                  ref={textareaRef}
                  rows={1}
                  className="msgr-composer-input"
                  placeholder={pendingImage ? 'Add a caption…' : 'Type a message...'}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  maxLength={2000}
                  disabled={sending}
                />
                <button
                  type="submit"
                  className="msgr-composer-send"
                  disabled={!canSend}
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

      {pickerOpen && activeConvo?.store?.id && (
        <ProductPicker
          storeId={activeConvo.store.id}
          onClose={() => setPickerOpen(false)}
          onPick={(p) => { setPendingProduct(p); setPickerOpen(false); textareaRef.current?.focus(); }}
        />
      )}

      {viewerImage && (
        <div className="msgr-viewer" role="dialog" aria-modal="true" aria-label="Photo" onClick={() => setViewerImage(null)}>
          <button type="button" className="msgr-viewer-close" onClick={() => setViewerImage(null)} aria-label="Close photo">
            <X size={20} weight="bold" />
          </button>
          <img src={resolveImg(viewerImage) || viewerImage} alt="Sent photo" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {reportOpen && activeConvo && (
        <ReportModal
          type={isSellerSide ? 'BUYER' : 'SELLER'}
          storeId={isSellerSide ? undefined : activeConvo.store?.id}
          reportedBuyerId={isSellerSide ? activeConvo.buyer?.id : undefined}
          targetName={activeHeader?.title}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
    </>
  );
}
