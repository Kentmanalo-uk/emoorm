import { Link } from 'react-router-dom';
import {
  Bell, EnvelopeSimple, CaretRight, CheckCircle, WarningCircle, ClockCounterClockwise,
} from '@phosphor-icons/react';
import AppLogo from '../AppLogo';
import Skeleton from '../ui/Skeleton';
import { resolveImg } from '../../lib/media';
import { formatRelativeTime } from '../../lib/time';
import { actionLabel } from '../../lib/auditActions';
import { useAdminShell } from './adminShell';
import { QuickToolsCard } from './AdminToolCards';
import '../../pages/SellerApp.css';

/*
 * Admin Home on a phone: the seller app's Home, in the admin's words, kept to
 * what matters: who you are (municipality or platform), the one thing to do
 * first, the queues that need you, the quick tools (every tool is on the
 * Tools tab), the last 30 days, and recent activity.
 */

// Sales as a change, not an amount: admins don't see the money.
const growth = (d) => (d == null ? '—' : `${d > 0 ? '▲' : d < 0 ? '▼' : ''}${Math.abs(d)}%`);
const count = (v) => new Intl.NumberFormat('en-PH').format(Number(v || 0));

/** Waiting queues shown as numbers, by the route they live at. */
const QUEUES = [
  { link: '/admin/sellers', label: 'Applications' },
  { link: '/admin/products', label: 'Products' },
  { link: '/admin/reports', label: 'Reports' },
  { link: '/admin/support', label: 'Support' },
];

const SEVERITY = { high: 3, medium: 2, low: 1, none: 0 };

/**
 * @param {Object} props
 * @param {Array|null} props.attention - /moderation/attention items
 * @param {Object|null} props.analytics - last-30-days analytics (null while loading)
 * @param {Array|null} props.activity - recent audit log rows
 */
export default function AdminPhoneHome({ attention, analytics, activity }) {
  const {
    isSuperAdmin, municipalityName, municipalityLogo, unreadCount = 0, messageUnread = 0,
  } = useAdminShell();
  const items = Array.isArray(attention) ? attention : [];
  const byLink = Object.fromEntries(items.map((it) => [it.link, it]));

  // The one thing to do first: the most pressing queue with anything in it.
  const top = items
    .filter((it) => Number(it.count) > 0)
    .sort((a, b) => (SEVERITY[b.severity] || 0) - (SEVERITY[a.severity] || 0) || Number(b.count) - Number(a.count))[0];

  const kpis = analytics?.kpis || {};
  const trend = (analytics?.salesByDay || []).slice(-14).map((d) => Number(d.index || 0));
  const maxTrend = Math.max(1, ...trend);
  const place = isSuperAdmin ? 'All municipalities' : municipalityName || 'Your municipality';

  return (
    <div className="sh ah">
      <header className="sh-head">
        <Link to="/admin/menu" className="sh-shop" aria-label="Your admin account">
          {/* The Emoorm mark; a municipal admin's carries the municipality's seal. */}
          <span className="sh-avatar ah-brand">
            <AppLogo />
            {!isSuperAdmin && (municipalityLogo
              ? <img className="ah-brand-badge" src={resolveImg(municipalityLogo)} alt="" />
              : <span className="ah-brand-badge ah-brand-initial">{(municipalityName || 'M').charAt(0).toUpperCase()}</span>)}
          </span>
          <span className="sh-shop-text">
            <strong>Emoorm</strong>
            <small>{isSuperAdmin ? 'Super Admin' : municipalityName || 'Municipal Admin'}</small>
          </span>
        </Link>
        <div className="sh-actions">
          <Link to="/admin/messages" className="sh-icon" aria-label="Messages">
            <EnvelopeSimple size={20} />
            {messageUnread > 0 && <b className="sh-badge">{messageUnread > 9 ? '9+' : messageUnread}</b>}
          </Link>
          <Link to="/admin/notifications" className="sh-icon" aria-label="Notifications">
            <Bell size={20} />
            {unreadCount > 0 && <b className="sh-badge">{unreadCount > 9 ? '9+' : unreadCount}</b>}
          </Link>
        </div>
      </header>

      <div className="sh-body">
        {attention && (top ? (
          <Link to={top.link} className={`sh-notice is-${top.severity === 'high' ? 'red' : 'amber'}`}>
            <span className="sh-notice-icon"><WarningCircle size={22} weight="fill" /></span>
            <span className="sh-notice-text">
              <b>{top.label}</b>
              <span>{count(top.count)} waiting{top.oldestAt ? ` · oldest ${formatRelativeTime(top.oldestAt)}` : ''}</span>
            </span>
            <span className="sh-notice-cta">Open</span>
          </Link>
        ) : (
          <div className="sh-notice is-green" role="status">
            <span className="sh-notice-icon"><CheckCircle size={22} weight="fill" /></span>
            <span className="sh-notice-text">
              <b>All caught up</b>
              <span>Nothing is waiting on you right now.</span>
            </span>
          </div>
        ))}

        <section className="sh-card sh-numbers" aria-label="Waiting on you">
          {QUEUES.map(({ link, label }) => {
            const value = attention ? Number(byLink[link]?.count || 0) : null;
            return (
              <Link key={link} to={link} className={value > 0 ? 'is-due' : undefined}>
                <strong>{value == null ? '–' : value}</strong>
                <span>{label}</span>
              </Link>
            );
          })}
        </section>

        <QuickToolsCard />

        <section className="sh-card sh-sales ah-summary">
          <div className="sh-card-head">
            <h2>Last 30 days · {place}</h2>
            <Link to="/admin/analytics">Details <CaretRight size={13} weight="bold" /></Link>
          </div>
          <div className="sh-sales-row">
            <div>
              {analytics
                ? <strong className="sh-sales-total">{growth(kpis.revenue?.delta)}</strong>
                : <Skeleton width={120} height={28} radius={6} />}
              <span className="sh-sales-sub">Sales vs the 30 days before</span>
            </div>
            {trend.length > 0 && (
              <span className="sh-spark" aria-hidden="true">
                {trend.map((amount, i) => <span key={i} style={{ height: `${Math.max(10, (amount / maxTrend) * 100)}%` }} />)}
              </span>
            )}
          </div>
          <div className="sh-sales-stats">
            <span><strong>{analytics ? count(kpis.orders?.value) : '–'}</strong> orders done</span>
            <span><strong>{analytics ? count(kpis.activeStores?.value) : '–'}</strong> active stores</span>
          </div>
        </section>

        <section className="sh-card sh-list ah-activity">
          <div className="sh-card-head">
            <h2>Recent activity</h2>
            <Link to="/admin/audit-logs">See all <CaretRight size={13} weight="bold" /></Link>
          </div>
          {!activity ? (
            <Skeleton.Text lines={3} height={14} />
          ) : activity.length === 0 ? (
            <p className="sdm-empty">Approvals and other admin actions will be listed here.</p>
          ) : activity.slice(0, 4).map((log) => (
            <Link key={log.id} to="/admin/audit-logs" className="sh-row">
              <span className="sh-row-icon"><ClockCounterClockwise size={19} weight="fill" /></span>
              <span className="sh-row-label">{actionLabel(log.action)}</span>
              <span className="sh-row-hint">{formatRelativeTime(log.createdAt)}</span>
              <CaretRight size={16} className="sh-chev" />
            </Link>
          ))}
        </section>
      </div>
    </div>
  );
}
