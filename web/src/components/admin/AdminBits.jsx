import { useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { timeAgo } from '../../lib/format';
import { shortDate, shortDateTime } from './adminFormat';
import './AdminBits.css';

/*
 * Small pieces the admin list pages share, so each page writes a date, a
 * pager, an on/off switch and a search box the same way (no inline styles):
 *
 *   <AdminDate value={u.createdAt} />            "Oct 21, 2026 · 3d ago"
 *   <AdminPager page={2} totalPages={5} total={93} onPage={setPage} />
 *   <StatusSwitch on={b.isActive} onToggle={…} label="Show on the homepage" />
 *   <AdminSearch value={q} onChange={setQ} placeholder="Search…" />
 */

/**
 * A date as every admin list shows it: the short date, and how long ago
 * while that is under a week; the full date and time on hover.
 */
export function AdminDate({ value, time = false, empty = '—' }) {
  // "Now" as of when the date was first drawn: a list does not tick.
  const [now] = useState(() => Date.now());
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return <span className="adb-date is-empty">{empty}</span>;
  const recent = now - d.getTime() < 7 * 24 * 3600e3 && d.getTime() <= now;
  return (
    <time className="adb-date" dateTime={d.toISOString()} title={d.toLocaleString('en-PH')}>
      <span>{time ? shortDateTime(d) : shortDate(d)}</span>
      {recent && <span className="adb-date-ago">{timeAgo(d)}</span>}
    </time>
  );
}

/** One pager for every list: ← Prev · Page 2 of 5 · 93 in all · Next →. */
export function AdminPager({ page, totalPages, total, onPage, disabled = false }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <nav className="admin-pagination" aria-label="Pages">
      <button type="button" className="admin-page-btn" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>← Prev</button>
      <span>
        Page {page} of {totalPages}
        {total ? ` · ${total.toLocaleString('en-PH')} in all` : ''}
      </span>
      <button type="button" className="admin-page-btn" disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>Next →</button>
    </nav>
  );
}

/**
 * An on/off switch that looks like one (not a solid "Active" button), with
 * its state for screen readers. `onToggle` decides whether to ask first.
 */
export function StatusSwitch({
  on, onToggle, label, onText = 'Shown', offText = 'Hidden', busy = false, disabled = false, tone,
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!on}
      aria-label={label}
      className={`adb-switch${on ? ' is-on' : ''}${tone ? ` is-${tone}` : ''}`}
      onClick={onToggle}
      disabled={disabled || busy}
    >
      <span className="adb-switch-track" aria-hidden="true"><span className="adb-switch-knob" /></span>
      <span className="adb-switch-text">{busy ? 'Saving…' : on ? onText : offText}</span>
    </button>
  );
}

/** The search box of a list's header, with its magnifier. */
export function AdminSearch({ value, onChange, placeholder, label, className = '' }) {
  return (
    <label className={`adb-search ${className}`}>
      <MagnifyingGlass size={14} aria-hidden="true" />
      <input
        type="search"
        className="admin-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label || placeholder}
      />
    </label>
  );
}

/** "(18)" after a card title. */
export function CountTag({ n }) {
  if (n == null) return null;
  return <span className="adb-count">({Number(n).toLocaleString('en-PH')})</span>;
}
