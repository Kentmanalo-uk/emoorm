import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Translate, Bell, SignOut, Check, BellSlash, WarningCircle } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { notificationHref } from '../../lib/notificationLink';
import { LANGUAGES, getCurrentLanguage, setLanguage } from '../../lib/googleTranslate';
import './AppRail.css';

const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/**
 * Slim right-hand rail for the Seller Center and the Admin panel: language,
 * notifications and sign out as icon-only buttons. Language and notifications
 * open on hover; sign out asks for confirmation.
 *
 * `notifications`: the newest notifications, when the shell already has them
 * (the admin shell keeps them between pages); without it the rail asks for
 * its own. `onRead` hears when a row opened here has been marked read.
 */
export default function AppRail({
  unreadCount = 0,
  notifications: given,
  onRead,
  onLogout,
  notificationsTo = '/seller/notifications',
  audience = 'SELLER',
  signOutMessage = 'You will need to sign in again to manage your shop.',
}) {
  const [current] = useState(() => getCurrentLanguage());
  const ownList = given === undefined;
  const [fetched, setNotifications] = useState(null);
  // Rows opened here, shown as read straight away whoever fetched the list.
  const [readHere, setReadHere] = useState(() => new Set());
  const notifications = (ownList ? fetched : given)
    ?.map((n) => (readHere.has(n.id) ? { ...n, isRead: true } : n)) ?? null;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const logoutRef = useRef(null);

  useEffect(() => {
    if (!confirmOpen) return undefined;
    const onDown = (event) => {
      if (logoutRef.current && !logoutRef.current.contains(event.target)) setConfirmOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setConfirmOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [confirmOpen]);

  const loadNotifications = useCallback(() => {
    axios.get('/notifications', { params: { audience, page: 1, pageSize: 6 } })
      .then((res) => setNotifications(res.data || []))
      .catch(() => setNotifications((prev) => prev || []));
  }, [audience]);

  useEffect(() => {
    if (!ownList) return;
    loadNotifications();
  }, [ownList, loadNotifications, unreadCount]);

  // A row in the rail is a shortcut to the thing it is about, not just to the
  // list. Marking it read locally keeps the badge honest without a refetch.
  const openNotification = (n) => {
    if (n.isRead) return;
    setReadHere((prev) => new Set(prev).add(n.id));
    axios.put(`/notifications/${n.id}/read`)
      .then(() => onRead?.(n))
      .catch(() => { /* the next load will correct it */ });
  };

  const pickLanguage = (code) => {
    if (code !== current) setLanguage(code);
  };

  return (
    <aside className="sr-rail notranslate" translate="no" aria-label="Quick actions">
      <div className="sr-item">
        <button type="button" className="sr-btn sr-btn--lang" aria-label="Change language" aria-haspopup="listbox">
          <Translate size={26} weight="fill" />
        </button>
        <div className="sr-flyout sr-flyout--lang" role="listbox" aria-label="Language">
          <p className="sr-flyout-title">Language</p>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="option"
              aria-selected={l.code === current}
              className={`sr-lang${l.code === current ? ' is-active' : ''}`}
              onClick={() => pickLanguage(l.code)}
            >
              <span>{l.label}</span>
              <small>{l.short}</small>
              {l.code === current && <Check size={14} weight="bold" />}
            </button>
          ))}
        </div>
      </div>

      <div className="sr-item">
        <Link to={notificationsTo} className="sr-btn sr-btn--notif" aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
          <Bell size={26} weight="fill" />
          {unreadCount > 0 && <span className="sr-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </Link>
        <div className="sr-flyout sr-flyout--notif">
          <div className="sr-flyout-head">
            <p className="sr-flyout-title">Notifications</p>
            {unreadCount > 0 && <span className="sr-pill">{unreadCount} new</span>}
          </div>
          {notifications === null ? (
            <p className="sr-note">Loading…</p>
          ) : notifications.length === 0 ? (
            <div className="sr-empty">
              <BellSlash size={48} weight="fill" />
              <p>No notifications yet</p>
            </div>
          ) : (
            <ul className="sr-notif-list">
              {notifications.map((n) => (
                <li key={n.id} className={n.isRead ? '' : 'is-unread'}>
                  <Link to={notificationHref(n) || notificationsTo} onClick={() => openNotification(n)}>
                    <strong>{n.title}</strong>
                    {n.message && <span>{n.message}</span>}
                    <small>{formatTime(n.createdAt)}</small>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link to={notificationsTo} className="sr-viewall">View all notifications</Link>
        </div>
      </div>

      <div className={`sr-item sr-item--end sr-item--click${confirmOpen ? ' is-open' : ''}`} ref={logoutRef}>
        <button
          type="button"
          className="sr-btn sr-btn--logout"
          onClick={() => setConfirmOpen((open) => !open)}
          aria-label="Sign out"
          aria-haspopup="dialog"
          aria-expanded={confirmOpen}
        >
          <SignOut size={26} weight="fill" />
        </button>
        <div
          className="sr-flyout sr-flyout--logout"
          role="dialog"
          aria-label="Confirm sign out"
          aria-hidden={!confirmOpen}
          inert={!confirmOpen}
        >
          <div className="sr-confirm-body">
            <span className="sr-confirm-icon"><WarningCircle size={20} weight="fill" /></span>
            <div>
              <strong>Sign out?</strong>
              <p>{signOutMessage}</p>
            </div>
          </div>
          <div className="sr-confirm-actions">
            <button type="button" className="sr-confirm-cancel" onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button
              type="button"
              className="sr-confirm-ok"
              onClick={() => { setConfirmOpen(false); onLogout?.(); }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
