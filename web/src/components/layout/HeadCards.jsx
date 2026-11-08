import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChatCircleDots, Lifebuoy, GraduationCap, Headset, Question, Storefront,
} from '../../lib/icons';
import axios from '../../lib/axios';
import { useHeadCard } from '../../hooks/useHeadCard';
import UserAvatar from '../ui/UserAvatar';
import WithActiveDot from '../ui/ActiveDot';
import './HeadCards.css';

/*
 * Header cards: a button whose card opens under it when the mouse rests on
 * it (or on a click), growing out of the button and shrinking back into it
 * (HeadCards.css, .hc-pop). The Seller Center's Chat and Help are here;
 * "+ Create" in the Seller and Admin Centers and the buyer topbar's Help
 * use the same pieces.
 */

/**
 * A list of links in a card, each with a filled gradient icon and a note.
 * `items`: [{ label, note, to, icon, tone, external }].
 */
export function CardLinks({ items, onPick }) {
  return items.map(({ label, note, to, icon: Icon, tone, external }) => {
    const inner = (
      <>
        <span className={`hc-icon is-${tone}`}><Icon size={22} weight="fill" /></span>
        <span>
          <strong>{label}</strong>
          {note && <small>{note}</small>}
        </span>
      </>
    );
    return external ? (
      <a key={label} href={to} target="_blank" rel="noopener noreferrer" role="menuitem" className="hc-item" onClick={onPick}>{inner}</a>
    ) : (
      <Link key={label} to={to} role="menuitem" className="hc-item" onClick={onPick}>{inner}</Link>
    );
  });
}

const ago = (iso) => {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso)) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const preview = (c, me) => {
  const body = c.lastMessage?.body?.trim();
  if (!body) return 'No messages yet';
  return c.lastMessage.senderId === me ? `You: ${body}` : body;
};

const CHATS_SHOWN = 4;

/** Seller Center Chat: the latest chats with buyers, the unread ones marked. */
export function ChatCard({ unread = 0, userId }) {
  const { open, ref, hoverProps, dismiss } = useHeadCard();
  const [chats, setChats] = useState(null);
  const loadedAt = useRef(0);

  // Fetched when the card first opens, then again once it is a while old.
  useEffect(() => {
    if (!open || Date.now() - loadedAt.current < 30000) return;
    loadedAt.current = Date.now();
    axios.get('/messages/conversations', { quiet: true })
      .then((res) => setChats((res.data || []).filter((c) => c.role === 'seller')))
      .catch(() => setChats((prev) => prev || []));
  }, [open]);

  const shown = (chats || []).slice(0, CHATS_SHOWN);

  return (
    <div className={`hc${open ? ' is-open' : ''}`} ref={ref} {...hoverProps}>
      <Link
        to="/seller/messages"
        className="sc-head-btn is-chat"
        aria-label={unread > 0 ? `Chat, ${unread} unread` : 'Chat'}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={dismiss}
      >
        <ChatCircleDots size={25} weight="fill" />
        {unread > 0 && <span className="sc-head-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </Link>

      <div className="hc-pop hc-pop--chat" aria-hidden={!open} inert={!open}>
        <div className="hc-head">
          <p className="hc-title">Chat with buyers</p>
          {unread > 0 && <span className="hc-pill">{unread} unread</span>}
        </div>
        {chats === null ? (
          <ul className="hc-chat-list" aria-busy="true">
            {[0, 1, 2].map((i) => <li key={i} className="hc-chat-ghost" />)}
          </ul>
        ) : shown.length === 0 ? (
          <div className="hc-empty">
            <ChatCircleDots size={40} weight="fill" />
            <p>No chats with buyers yet</p>
          </div>
        ) : (
          <ul className="hc-chat-list">
            {shown.map((c) => {
              const name = c.buyer?.fullName || 'Buyer';
              return (
                <li key={c.id}>
                  <Link
                    to={`/seller/messages?c=${c.id}`}
                    className={`hc-chat-row${c.unreadCount > 0 ? ' is-unread' : ''}`}
                    onClick={dismiss}
                  >
                    {/* The dot: this buyer is on E-MOORM now. */}
                    <WithActiveDot who={c.buyer} size={11}>
                      <span className="hc-chat-avatar">
                        <UserAvatar
                          src={c.buyer?.profilePhoto}
                          person={c.buyer}
                          name={name}
                          alt=""
                          fallbackClassName="hc-chat-initial"
                        />
                      </span>
                    </WithActiveDot>
                    <span className="hc-chat-text">
                      <span className="hc-chat-top">
                        <strong>{name}</strong>
                        <small>{ago(c.lastMessageAt)}</small>
                      </span>
                      <span className="hc-chat-line notranslate" translate="no">{preview(c, userId)}</span>
                    </span>
                    {c.unreadCount > 0 && <b className="hc-chat-count">{c.unreadCount > 9 ? '9+' : c.unreadCount}</b>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Link to="/seller/messages" className="hc-foot" onClick={dismiss}>Open Chat</Link>
      </div>
    </div>
  );
}

const SELLER_HELP = [
  { label: 'Seller Academy', note: 'Guides to selling on E-MOORM', to: '/sell/academy', icon: GraduationCap, tone: 'violet' },
  { label: 'Seller support', note: 'Ask the E-MOORM team', to: '/seller/support', icon: Headset, tone: 'blue' },
  { label: 'Help Center', note: 'Answers to common questions', to: '/help', icon: Question, tone: 'teal' },
];

/** Seller Center Help: where a seller finds answers. */
export function HelpCard() {
  const { open, ref, hoverProps, dismiss } = useHeadCard();
  return (
    <div className={`hc${open ? ' is-open' : ''}`} ref={ref} {...hoverProps}>
      <Link
        to="/sell/academy"
        className="sc-head-btn is-help"
        aria-label="Help"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={dismiss}
      >
        <Lifebuoy size={25} weight="fill" />
      </Link>
      <div className="hc-pop hc-pop--links" role="menu" aria-label="Help" aria-hidden={!open} inert={!open}>
        <p className="hc-title hc-title--solo">Help</p>
        <CardLinks items={SELLER_HELP} onPick={dismiss} />
      </div>
    </div>
  );
}

/** The buyer topbar's HELP & SUPPORT: answers, the support team, selling. */
export function TopbarHelpCard({ signedIn }) {
  const { open, ref, hoverProps, dismiss } = useHeadCard();
  const items = [
    { label: 'Help Center', note: 'Answers to common questions', to: '/help', icon: Question, tone: 'teal' },
    {
      label: 'Contact support',
      note: 'Ask the E-MOORM team',
      to: signedIn ? '/profile/support' : '/login?redirect=%2Fprofile%2Fsupport',
      icon: Headset,
      tone: 'blue',
    },
    { label: 'Sell on E-MOORM', note: 'Open a shop for free', to: '/sell', icon: Storefront, tone: 'green' },
  ];
  return (
    <div className={`hc hc--topbar${open ? ' is-open' : ''}`} ref={ref} {...hoverProps}>
      <Link to="/help" className="topbar-link" aria-haspopup="menu" aria-expanded={open} onClick={dismiss}>
        HELP &amp; SUPPORT
      </Link>
      <div className="hc-pop hc-pop--links is-left" role="menu" aria-label="Help and support" aria-hidden={!open} inert={!open}>
        <p className="hc-title hc-title--solo">Help &amp; support</p>
        <CardLinks items={items} onPick={dismiss} />
      </div>
    </div>
  );
}
