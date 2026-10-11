import { useId } from 'react';
import {
  BellRinging, ChatCircleDots, ClipboardText, Megaphone,
} from '@phosphor-icons/react';
import { NOTIFICATION_CATEGORIES } from '../../lib/notificationCategories';
import './NotificationCategories.css';

/*
 * The notifications' groups, in one bar above the list (shopping apps'
 * Chats · Orders · Alerts · Promos): a gradient icon and a name each, thin
 * rules between, a count when a group has unread ones. Choosing a group shows
 * only it; choosing it again shows them all. The app's
 * mobile/src/components/inbox/NotificationCategories.js.
 *
 *   <NotificationCategories value={category} onChange={setCategory} unread={unreadByCategory} />
 */

const ICONS = {
  chats: ChatCircleDots,
  orders: ClipboardText,
  alerts: BellRinging,
  promos: Megaphone,
};

export default function NotificationCategories({ value, onChange, unread = {}, className = '' }) {
  // Gradient ids unique to this bar (the icons point at them: fill: url(#…)).
  const uid = useId().replace(/:/g, '');
  const gradId = (key) => `ncat-${uid}-${key}`;

  return (
    <div className={`ncat${className ? ` ${className}` : ''}`} role="tablist" aria-label="Notification groups">
      <svg className="ncat-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          {NOTIFICATION_CATEGORIES.map((c) => (
            <linearGradient key={c.key} id={gradId(c.key)} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor={c.colors[0]} />
              <stop offset="1" stopColor={c.colors[1]} />
            </linearGradient>
          ))}
        </defs>
      </svg>
      {NOTIFICATION_CATEGORIES.map((c) => {
        const on = value === c.key;
        const count = unread?.[c.key] || 0;
        const Icon = ICONS[c.key];
        return (
          <div key={c.key} className="ncat-cell">
            <button
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={`${c.label}${count ? `, ${count} unread` : ''}`}
              className={`ncat-item${on ? ' is-on' : ''}`}
              onClick={() => onChange(on ? null : c.key)}
            >
              <span className="ncat-icon">
                <Icon size={20} weight="fill" color={c.colors[1]} style={{ fill: `url(#${gradId(c.key)}) ${c.colors[1]}` }} />
                {count > 0 && <span className="ncat-badge">{count > 99 ? '99+' : count}</span>}
              </span>
              <span className="ncat-label">{c.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
