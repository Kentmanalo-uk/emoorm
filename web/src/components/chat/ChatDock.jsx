import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChatCircleDots, X, CaretLeft, PaperPlaneRight, ArrowSquareOut, ChatsCircle, CircleNotch, Storefront,
  Headset, EnvelopeOpen,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import './ChatDock.css';

const LIST_POLL_MS = 30000;
const THREAD_POLL_MS = 5000;

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'support', label: 'Support' },
];

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const supportName = (c) => (c.topic === 'DIRECT'
  ? `${c.municipality?.name || 'Municipal'} Admin`
  : `${c.municipality?.name || 'Municipal'} Support`);

/** Normalizes store and support conversations into one list-item shape. */
const toItem = (c, kind, userId) => {
  if (kind === 'support') {
    return {
      key: `support:${c.id}`,
      kind,
      id: c.id,
      name: supportName(c),
      avatar: c.municipality?.logo,
      subtitle: c.adminName ? `Municipal admin: ${c.adminName}` : 'Municipal support',
      preview: c.lastMessage
        ? `${c.lastMessage.senderId === userId ? 'You: ' : ''}${c.lastMessage.body}`
        : 'No messages yet',
      time: c.lastMessage?.createdAt || c.lastMessageAt || c.createdAt,
      unread: c.unreadCount || 0,
    };
  }
  const seller = c.role === 'seller';
  return {
    key: `store:${c.id}`,
    kind,
    id: c.id,
    name: seller ? c.buyer?.fullName || 'Buyer' : c.store?.name || 'Store',
    avatar: seller ? c.buyer?.profilePhoto : c.store?.logo,
    subtitle: seller ? 'Customer' : 'Store',
    preview: c.lastMessage
      ? `${c.lastMessage.senderId === userId ? 'You: ' : ''}${c.lastMessage.body || 'Order update'}`
      : 'Start the conversation',
    time: c.lastMessageAt,
    unread: c.unreadCount || 0,
  };
};

const byTimeDesc = (a, b) => new Date(b.time || 0) - new Date(a.time || 0);

function Avatar({ src, name, icon: Icon }) {
  return (
    <span className="cd-avatar">
      {src
        ? <img src={resolveImg(src)} alt="" />
        : Icon ? <Icon size={18} weight="fill" /> : (name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

/**
 * Floating bottom-right chat launcher (homepage). Opens a two-pane panel:
 * conversations on the left (All / Unread / Support), the thread on the right.
 */
export default function ChatDock() {
  const { isAuthenticated, user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('all');
  const [storeConvos, setStoreConvos] = useState(null);
  const [supportConvos, setSupportConvos] = useState(null);
  const [selected, setSelected] = useState(null); // { kind, id }
  const [thread, setThread] = useState(null); // { key, data }
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [startingSupport, setStartingSupport] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const loadStore = useCallback(() => axios.get('/messages/conversations')
    .then((res) => setStoreConvos(res.data || []))
    .catch(() => setStoreConvos((prev) => prev || [])), []);

  const loadSupport = useCallback(() => axios.get('/support/chat/my')
    .then((res) => setSupportConvos(res.data || []))
    .catch(() => setSupportConvos((prev) => prev || [])), []);

  const loadLists = useCallback(() => Promise.all([loadStore(), loadSupport()]), [loadStore, loadSupport]);

  // Keeps the unread badge fresh while closed.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    loadLists();
    const timer = setInterval(loadLists, LIST_POLL_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, loadLists]);

  useEffect(() => {
    if (open && isAuthenticated) loadLists();
  }, [open, isAuthenticated, loadLists]);

  const selectedKey = selected ? `${selected.kind}:${selected.id}` : null;

  useEffect(() => {
    if (!open || !selected) return undefined;
    let cancelled = false;
    const key = `${selected.kind}:${selected.id}`;
    const url = selected.kind === 'support'
      ? `/support/chat/${selected.id}`
      : `/messages/conversations/${selected.id}`;
    const fetchThread = () => axios.get(url)
      .then((res) => {
        if (cancelled) return;
        setThread({ key, data: res.data });
        setError('');
        if (selected.kind === 'store') {
          axios.post(`/messages/conversations/${selected.id}/read`).catch(() => {});
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load messages'); });
    fetchThread();
    const timer = setInterval(fetchThread, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, selected]);

  const active = thread && thread.key === selectedKey ? thread.data : null;
  const messageCount = active?.messages?.length || 0;

  useEffect(() => {
    if (messageCount) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messageCount, selectedKey]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const clearUnread = (kind, id) => {
    const reset = (list) => (list || []).map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c));
    if (kind === 'support') setSupportConvos(reset);
    else setStoreConvos(reset);
  };

  const select = (kind, id) => {
    setSelected({ kind, id });
    setDraft('');
    setError('');
    clearUnread(kind, id);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const startSupport = async () => {
    setStartingSupport(true);
    setError('');
    try {
      const res = await axios.post('/support/chat/municipal', {});
      await loadSupport();
      select('support', res.data.id);
    } catch (err) {
      setError(err.message || 'Could not start a support chat');
    } finally {
      setStartingSupport(false);
    }
  };

  const send = async (event) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    try {
      if (selected.kind === 'support') {
        await axios.post(`/support/chat/${selected.id}/messages`, { body });
      } else {
        await axios.post(`/messages/conversations/${selected.id}/messages`, { body });
      }
      setDraft('');
      const url = selected.kind === 'support'
        ? `/support/chat/${selected.id}`
        : `/messages/conversations/${selected.id}`;
      const res = await axios.get(url);
      setThread({ key: `${selected.kind}:${selected.id}`, data: res.data });
      loadLists();
    } catch (err) {
      setError(err.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  };

  const storeItems = (storeConvos || []).map((c) => toItem(c, 'store', user?.id));
  const supportItems = (supportConvos || []).map((c) => toItem(c, 'support', user?.id));
  const unreadItems = [...storeItems, ...supportItems].filter((i) => i.unread > 0).sort(byTimeDesc);
  const tabItems = { all: storeItems, unread: unreadItems, support: supportItems };
  const items = tabItems[tab];
  const listLoading = tab === 'support' ? supportConvos === null : storeConvos === null
    || (tab === 'unread' && supportConvos === null);
  const unreadTotal = unreadItems.reduce((sum, i) => sum + i.unread, 0);
  const selectedItem = [...storeItems, ...supportItems].find((i) => i.key === selectedKey);

  const fullLink = !selected
    ? '/messages'
    : selected.kind === 'support'
      ? `${user?.role === 'SELLER' ? '/seller/support' : '/profile/support'}?c=${selected.id}`
      : `/messages?c=${selected.id}`;

  const renderList = () => {
    if (listLoading) {
      return <p className="cd-note"><CircleNotch size={14} className="cd-spin" /> Loading…</p>;
    }
    if (items.length === 0) {
      if (tab === 'support') {
        return (
          <div className="cd-empty">
            <Headset size={56} weight="fill" />
            <strong>Need help?</strong>
            <span>Message your municipal admin about your account or orders.</span>
            <button type="button" className="cd-primary" onClick={startSupport} disabled={startingSupport}>
              {startingSupport ? <CircleNotch size={14} className="cd-spin" /> : <ChatCircleDots size={15} weight="fill" />}
              Contact support
            </button>
          </div>
        );
      }
      if (tab === 'unread') {
        return (
          <div className="cd-empty">
            <EnvelopeOpen size={56} weight="fill" />
            <strong>All caught up</strong>
            <span>No unread messages.</span>
          </div>
        );
      }
      return (
        <div className="cd-empty">
          <ChatsCircle size={56} weight="fill" />
          <strong>No conversations yet</strong>
          <span>Visit a store and tap Message to start chatting.</span>
          <Link to="/stores" className="cd-primary"><Storefront size={15} weight="fill" /> Browse stores</Link>
        </div>
      );
    }
    return (
      <ul className="cd-list">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className={`cd-list-item${item.key === selectedKey ? ' is-active' : ''}`}
              onClick={() => select(item.kind, item.id)}
            >
              <Avatar src={item.avatar} name={item.name} icon={item.kind === 'support' ? Headset : null} />
              <span className="cd-list-body">
                <span className="cd-list-top">
                  <strong>{item.name}</strong>
                  <small>{formatTime(item.time)}</small>
                </span>
                <span className={`cd-list-preview${item.unread ? ' is-unread' : ''}`}>{item.preview}</span>
              </span>
              {item.unread > 0 && <span className="cd-count">{item.unread > 9 ? '9+' : item.unread}</span>}
            </button>
          </li>
        ))}
      </ul>
    );
  };

  const renderThread = () => {
    if (!selected) {
      return (
        <div className="cd-empty">
          <ChatsCircle size={72} weight="fill" />
          <strong>Your messages</strong>
          <span>Pick a conversation on the left to start chatting.</span>
        </div>
      );
    }
    const isSupport = selected.kind === 'support';
    const closed = isSupport && active?.status === 'CLOSED';
    return (
      <>
        <div className="cd-thread-head">
          <button type="button" className="cd-icon cd-back" onClick={() => setSelected(null)} aria-label="Back to conversations">
            <CaretLeft size={16} weight="bold" />
          </button>
          <Avatar
            src={selectedItem?.avatar}
            name={selectedItem?.name}
            icon={isSupport ? Headset : null}
          />
          <span className="cd-thread-title">
            <strong>{selectedItem?.name || (isSupport ? 'Municipal Support' : 'Conversation')}</strong>
            <small>{closed ? 'Closed · send a message to reopen' : selectedItem?.subtitle}</small>
          </span>
        </div>
        <div className="cd-messages">
          {!active && !error && <p className="cd-note"><CircleNotch size={14} className="cd-spin" /> Loading…</p>}
          {active && active.messages.length === 0 && (
            <div className="cd-empty cd-empty--inline">
              <ChatsCircle size={56} weight="fill" />
              <span>{isSupport ? 'Tell us how we can help.' : 'Say hello to start the conversation.'}</span>
            </div>
          )}
          {active?.messages.map((m) => {
            const mine = m.senderId === user?.id;
            return (
              <div key={m.id} className={`cd-msg${mine ? ' is-mine' : ''}`}>
                {!mine && isSupport && m.sender?.fullName && <span className="cd-msg-name">{m.sender.fullName}</span>}
                {m.imageUrl && <img src={resolveImg(m.imageUrl)} alt="" className="cd-msg-img" />}
                {m.body && <p>{m.body}</p>}
                {!m.body && !m.imageUrl && m.order && <p>Order {m.order.orderNumber}</p>}
                <time>{formatTime(m.createdAt)}</time>
              </div>
            );
          })}
          {error && <p className="cd-error">{error}</p>}
          <div ref={bottomRef} />
        </div>
        <form className="cd-composer" onSubmit={send}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message…"
            maxLength={2000}
            aria-label="Message"
          />
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Send">
            <PaperPlaneRight size={17} weight="fill" />
          </button>
        </form>
      </>
    );
  };

  return (
    <div className={`cd-root${open ? ' is-open' : ''}`}>
      <section
        className={`cd-panel${selected ? ' has-thread' : ''}${isAuthenticated ? '' : ' is-guest'}`}
        role="dialog"
        aria-label="Messages"
        aria-hidden={!open}
        inert={!open}
      >
        <header className="cd-head">
          <strong className="cd-title">Messages</strong>
          {isAuthenticated && (
            <Link to={fullLink} className="cd-icon" title="Open full messages" aria-label="Open full messages">
              <ArrowSquareOut size={16} />
            </Link>
          )}
          <button type="button" className="cd-icon" onClick={() => setOpen(false)} aria-label="Close chat">
            <X size={16} weight="bold" />
          </button>
        </header>

        {!isAuthenticated ? (
          <div className="cd-empty">
            <ChatsCircle size={72} weight="fill" />
            <strong>Chat with local stores</strong>
            <span>Sign in to message sellers and your municipal support team.</span>
            <Link to="/login?redirect=/" className="cd-primary">Sign in</Link>
          </div>
        ) : (
          <div className="cd-panes">
            <aside className="cd-side">
              <div className="cd-tabs" role="tablist" aria-label="Filter conversations">
                {TABS.map((t) => {
                  const count = t.key === 'unread' ? unreadTotal
                    : t.key === 'support' ? supportItems.reduce((sum, i) => sum + i.unread, 0) : 0;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      className={`cd-tab${tab === t.key ? ' is-active' : ''}`}
                      onClick={() => setTab(t.key)}
                    >
                      {t.label}
                      {count > 0 && <span className="cd-tab-count">{count > 9 ? '9+' : count}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="cd-side-body">{renderList()}</div>
            </aside>
            <div className="cd-main">{renderThread()}</div>
          </div>
        )}
      </section>

      <button
        type="button"
        className="cd-bar"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unreadTotal ? `Messages, ${unreadTotal} unread` : 'Messages'}
      >
        <ChatCircleDots size={20} weight="fill" />
        <span>Messages</span>
        {unreadTotal > 0 && <span className="cd-count">{unreadTotal > 9 ? '9+' : unreadTotal}</span>}
      </button>
    </div>
  );
}
