import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CaretLeft, ChatsCircle, PaperPlaneRight, UsersThree,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { pollWhileVisible } from '../../lib/visiblePoll';
import UserAvatar from '../ui/UserAvatar';

/*
 * The admin team's chats, on the Admin team page: one for everyone on the
 * team and one with each other admin. The list shows the last message and
 * what is unread; a chat shows its messages (newest at the bottom), keeps
 * itself fresh while open, and sends with Enter (Shift+Enter for a new line).
 */

const TEAM = 'team';

const time = (d) => {
  const at = new Date(d);
  const today = new Date().toDateString() === at.toDateString();
  return today
    ? at.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
    : at.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
};

function ChatAvatar({ chat }) {
  if (chat.thread === TEAM) {
    return <span className="tc-avatar tc-avatar--team"><UsersThree size={20} weight="fill" /></span>;
  }
  return <UserAvatar src={chat.profilePhoto} name={chat.title?.[0]} imgClassName="tc-avatar" fallbackClassName="tc-avatar tc-avatar--fallback" />;
}

function Thread({ chat, meId, onBack, onRead }) {
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef(null);
  const stick = useRef(true);
  const thread = chat.thread;
  const onReadRef = useRef(onRead);
  useEffect(() => { onReadRef.current = onRead; }, [onRead]);

  const fetchLatest = useCallback(() => axios.get(`/admin-team/chats/${thread}`, { quiet: true })
    .then((res) => {
      setMessages((prev) => {
        const latest = res.data.messages;
        if (!prev) return latest;
        // Keep older pages already loaded; replace the tail with the latest.
        const firstLatest = latest[0]?.createdAt;
        const older = firstLatest ? prev.filter((m) => new Date(m.createdAt) < new Date(firstLatest)) : prev;
        return [...older, ...latest];
      });
      setHasMore((h) => h || res.data.hasMore);
      // The server marks the chat read when it hands over the latest messages.
      onReadRef.current?.(thread);
    })
    .catch(() => {}), [thread]);

  useEffect(() => {
    setMessages(null);
    setHasMore(false);
    stick.current = true;
    fetchLatest();
    const stop = pollWhileVisible(fetchLatest, 5000);
    return stop;
  }, [fetchLatest]);

  // Stay at the bottom unless the reader scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadEarlier = async () => {
    if (!messages?.length) return;
    const el = scroller.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const res = await axios.get(`/admin-team/chats/${thread}`, { params: { before: messages[0].createdAt } });
      stick.current = false;
      setMessages((prev) => [...res.data.messages, ...(prev || [])]);
      setHasMore(res.data.hasMore);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - fromBottom; });
    } catch {
      toast.error('Could not load earlier messages');
    }
  };

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await axios.post(`/admin-team/chats/${thread}`, { body });
      setText('');
      const box = e?.target?.closest?.('form')?.querySelector('textarea');
      if (box) box.style.height = '';
      stick.current = true;
      setMessages((prev) => [...(prev || []), res.data]);
    } catch (err) {
      toast.error(err.message || 'Could not send the message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tc-thread">
      <div className="tc-thread-head">
        <button type="button" className="tc-icon-btn" onClick={onBack} aria-label="All chats"><CaretLeft size={18} weight="bold" /></button>
        <ChatAvatar chat={chat} />
        <div className="tc-thread-title">
          <strong>{chat.title}</strong>
          <span>{chat.thread === TEAM ? `${chat.size} admins` : 'Admin'}</span>
        </div>
      </div>

      <div className="tc-messages" ref={scroller} onScroll={onScroll}>
        {hasMore && <button type="button" className="tc-earlier" onClick={loadEarlier}>Earlier messages</button>}
        {messages === null && <p className="tc-quiet">Loading…</p>}
        {messages?.length === 0 && (
          <p className="tc-quiet">{chat.thread === TEAM ? 'No messages yet. Say hello to the team.' : `No messages yet. Write to ${chat.title}.`}</p>
        )}
        {messages?.map((m, i) => {
          const mine = m.sender?.id === meId;
          const prev = messages[i - 1];
          const firstOfRun = !prev || prev.sender?.id !== m.sender?.id
            || new Date(m.createdAt) - new Date(prev.createdAt) > 10 * 60 * 1000;
          return (
            <div key={m.id} className={`tc-msg${mine ? ' is-mine' : ''}${firstOfRun ? ' is-first' : ''}`}>
              {!mine && chat.thread === TEAM && (
                firstOfRun
                  ? <UserAvatar src={m.sender?.profilePhoto} name={m.sender?.fullName?.[0]} imgClassName="tc-msg-avatar" fallbackClassName="tc-msg-avatar tc-avatar--fallback" />
                  : <span className="tc-msg-avatar is-blank" />
              )}
              <div className="tc-bubble-wrap">
                {!mine && chat.thread === TEAM && firstOfRun && <span className="tc-msg-name">{m.sender?.fullName}</span>}
                <div className="tc-bubble">{m.body}</div>
                {firstOfRun && <span className="tc-msg-time">{time(m.createdAt)}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <form className="tc-compose" onSubmit={send}>
        <textarea
          rows={1}
          value={text}
          maxLength={2000}
          onChange={(e) => {
            setText(e.target.value);
            // Grows with what is typed, up to a few lines.
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
          placeholder={chat.thread === TEAM ? 'Message the team' : `Message ${chat.title}`}
          aria-label="Message"
        />
        <button type="submit" className="tc-send" disabled={!text.trim() || sending} aria-label="Send">
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}

/**
 * @param {String|null} open - the chat open now ('team' or an admin's id)
 * @param {Function} onOpen - open a chat (null: back to the list)
 * @param {Function} onUnread - reports the total unread, for the page
 */
export default function TeamChat({ meId, open, onOpen, onUnread }) {
  const [data, setData] = useState(null);
  const onUnreadRef = useRef(onUnread);
  useEffect(() => { onUnreadRef.current = onUnread; }, [onUnread]);
  // The page's badges follow whatever this list knows, loaded or read here.
  useEffect(() => { if (data) onUnreadRef.current?.(data); }, [data]);

  // The list loads once on opening, then every 20 s while the page is in
  // view, and again on coming back from a chat (for its last message).
  const load = useCallback(() => axios.get('/admin-team/chats', { quiet: true })
    .then((res) => setData(res.data))
    .catch(() => {}), []);
  useEffect(() => {
    load();
    return pollWhileVisible(load, 20000);
  }, [load]);

  // Opening a chat reads it: once the server has marked it read, its count
  // here clears without asking for the whole list again.
  const markRead = useCallback((thread) => setData((prev) => {
    const read = prev?.chats.find((c) => c.thread === thread);
    if (!read?.unread) return prev;
    return {
      ...prev,
      unread: Math.max(0, (prev.unread || 0) - read.unread),
      chats: prev.chats.map((c) => (c.thread === thread ? { ...c, unread: 0 } : c)),
    };
  }), []);

  const chat = data?.chats.find((c) => c.thread === open)
    || (open === TEAM ? { thread: TEAM, title: 'Everyone on the team', size: 0 } : null);

  if (open && chat) {
    return <Thread chat={chat} meId={meId} onBack={() => { onOpen(null); load(); }} onRead={markRead} />;
  }

  return (
    <div className="tc-list">
      <div className="tc-list-head">
        <ChatsCircle size={20} weight="fill" />
        <strong>Team chat</strong>
      </div>
      {data === null ? (
        <p className="tc-quiet">Loading…</p>
      ) : (
        <ul>
          {data.chats.map((c) => (
            <li key={c.thread}>
              <button type="button" className={`tc-chat${c.unread ? ' is-unread' : ''}`} onClick={() => onOpen(c.thread)}>
                <ChatAvatar chat={c} />
                <span className="tc-chat-text">
                  <span className="tc-chat-top">
                    <strong>{c.title}</strong>
                    {c.last && <small>{time(c.last.createdAt)}</small>}
                  </span>
                  <span className="tc-chat-last">
                    {c.last
                      ? `${c.last.sender?.id === meId ? 'You: ' : c.thread === TEAM ? `${c.last.sender?.fullName?.split(' ')[0]}: ` : ''}${c.last.body}`
                      : c.thread === TEAM ? 'Talk to everyone on the team' : 'No messages yet'}
                  </span>
                </span>
                {c.unread > 0 && <b className="tc-unread">{c.unread > 99 ? '99+' : c.unread}</b>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
