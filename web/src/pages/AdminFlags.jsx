import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Info } from '../lib/icons';
import AdminLayout from '../components/admin/AdminLayout';
import ReasonDialog from '../components/admin/ReasonDialog';
import { AdminDate, AdminPager } from '../components/admin/AdminBits';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import EmptyArt from '../components/ui/EmptyArt';
import Select from '../components/ui/Select';
import axios from '../lib/axios';
import { pesoWhole } from '../lib/format';
import { useRefreshAdminShell } from '../hooks/useAdminShellData';
import '../components/admin/AdminLayout.css';
import './AdminModeration.css';
import './AdminFlags.css';

/*
 * Admin › To review › Unusual activity: the ML engine's flags (module 08,
 * GET /ml/fraud/alerts), orders and accounts that look out of the ordinary,
 * for a person to look at and mark. A municipal admin sees their own town's
 * (the server scopes it). A flag is a hint, never proof: marking one only
 * records a person's judgement (audit-logged); no account, order or payment
 * is touched from here.
 */

const PAGE_SIZE = 20;

const TYPES = {
  order_burst: 'Many orders at once',
  unusual_amount: 'Unusually large order',
  payment_failures: 'Failed payment proofs',
  repeat_no_shows: 'Repeated no-shows',
  new_account_large_order: 'New account, large order',
};

const STATUS = {
  PENDING_REVIEW: { label: 'Waiting', cls: 'admin-badge-pending' },
  CONFIRMED_SUSPICIOUS: { label: 'Suspicious', cls: 'admin-badge-rejected' },
  CLEARED: { label: 'Cleared', cls: 'admin-badge-resolved' },
  ESCALATED: { label: 'Escalated', cls: 'admin-badge-review' },
};

const TABS = [
  { key: 'PENDING_REVIEW', label: 'Waiting' },
  { key: 'CONFIRMED_SUSPICIOUS', label: 'Suspicious' },
  { key: 'CLEARED', label: 'Cleared' },
  { key: 'ESCALATED', label: 'Escalated' },
  { key: '', label: 'All' },
];

const SEVERITY = {
  HIGH: { label: 'High', cls: 'admin-badge-rejected' },
  MEDIUM: { label: 'Medium', cls: 'admin-badge-pending' },
  LOW: { label: 'Low', cls: 'admin-badge-neutral' },
};

/** What each mark does, and how its dialog asks. */
const ACTIONS = {
  CONFIRMED_SUSPICIOUS: {
    button: 'Looks suspicious',
    cls: 'admin-btn-red',
    title: 'Mark as suspicious?',
    confirm: 'Mark as suspicious',
    done: 'Marked as suspicious',
    danger: true,
  },
  CLEARED: {
    button: 'Clear',
    cls: 'admin-btn-green',
    title: 'Clear this flag?',
    confirm: 'Clear',
    done: 'Flag cleared',
  },
  ESCALATED: {
    button: 'Escalate',
    cls: 'admin-btn-gray',
    title: 'Escalate this flag?',
    confirm: 'Escalate',
    done: 'Flag escalated',
  },
  PENDING_REVIEW: {
    button: 'Back to waiting',
    cls: 'admin-btn-gray',
    title: 'Put this flag back to waiting?',
    confirm: 'Back to waiting',
    done: 'Flag is waiting again',
  },
};
// Back to waiting last: it undoes, the others decide.
const ACTION_ORDER = ['CONFIRMED_SUSPICIOUS', 'CLEARED', 'ESCALATED', 'PENDING_REVIEW'];

function Score({ value }) {
  const pct = Math.round(Math.min(1, Math.max(0, Number(value) || 0)) * 100);
  return (
    <span className="afl-score" title={`${pct}% unusual`}>
      <span className="afl-score-bar" aria-hidden="true"><i style={{ width: `${Math.max(4, pct)}%` }} /></span>
      <span className="afl-score-pct">{pct}%</span>
    </span>
  );
}

function Person({ person }) {
  if (!person) return <span className="am-muted">—</span>;
  return (
    <div>
      <Link to={`/admin/buyers?id=${encodeURIComponent(person.id)}`} className="admin-link admin-user-cell-name">
        {person.fullName || person.email || 'This account'}
      </Link>
      {person.fullName && person.email && <div className="admin-user-cell-email">{person.email}</div>}
    </div>
  );
}

const SHOWN_ORDERS = 3;

function Orders({ flag }) {
  const list = flag.order ? [flag.order] : (flag.orders || []);
  if (!list.length) return <span className="am-muted">—</span>;
  const extra = list.length - SHOWN_ORDERS;
  return (
    <ul className="afl-orders">
      {list.slice(0, SHOWN_ORDERS).map((o) => (
        <li key={o.id}>
          <Link to={`/admin/orders?id=${encodeURIComponent(o.id)}`} className="admin-link">{o.orderNumber}</Link>
          <span className="afl-order-meta">
            {[o.total != null ? pesoWhole(o.total) : null, o.store?.name].filter(Boolean).join(' · ')}
          </span>
        </li>
      ))}
      {extra > 0 && <li className="am-muted">and {extra} more</li>}
    </ul>
  );
}

export default function AdminFlags() {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [result, setResult] = useState({
    key: null, rows: [], total: 0, pending: null, failed: false,
  });
  // { flag, to }: a mark waiting for its (optional) note.
  const [asking, setAsking] = useState(null);
  const [saving, setSaving] = useState(false);
  const refreshShell = useRefreshAdminShell();

  const queryKey = `${status}|${type}|${page}|${reloadTick}`;
  const isLoading = result.key !== queryKey;

  useEffect(() => {
    let cancelled = false;
    const params = { page, pageSize: PAGE_SIZE };
    if (status) params.status = status;
    if (type) params.type = type;
    axios.get('/ml/fraud/alerts', { params })
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        setResult({
          key: queryKey,
          rows: Array.isArray(data.rows) ? data.rows : [],
          total: Number(data.total) || 0,
          pending: data.pending ?? null,
          failed: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setResult((r) => ({ ...r, key: queryKey, rows: [], total: 0, failed: true }));
      });
    return () => { cancelled = true; };
  }, [queryKey, status, type, page]);

  const setTab = (key) => { setStatus(key); setPage(1); };

  const mark = async (note) => {
    if (!asking) return;
    const { flag, to } = asking;
    setSaving(true);
    try {
      await axios.patch(`/ml/fraud/alerts/${flag.id}`, { status: to, ...(note ? { note } : {}) });
      toast.success(ACTIONS[to].done);
      setAsking(null);
      refreshShell('flags');
      // The flag leaves a filtered list: step back from a page it emptied.
      if (status && result.rows.length === 1 && page > 1) setPage(page - 1);
      else setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err.message || 'Could not update the flag');
    } finally {
      setSaving(false);
    }
  };

  const { rows, total, pending, failed } = result;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const action = asking ? ACTIONS[asking.to] : null;
  const who = asking?.flag?.person?.fullName || asking?.flag?.person?.email;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Unusual activity</h1>
          <p className="admin-page-sub">Orders and accounts that look out of the ordinary, for you to look at</p>
        </div>
      </div>

      <p className="afl-note">
        <Info size={16} weight="fill" />
        <span>
          These flags are hints for a person, not proof. Nothing is suspended, cancelled or blocked by them:
          look at the orders and the account, then mark what you found. Your mark is kept in the audit log.
        </span>
      </p>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-status-tabs" role="tablist" aria-label="Flags by status">
            {TABS.map((t) => (
              <button
                key={t.key || 'all'}
                type="button"
                role="tab"
                aria-selected={status === t.key}
                className={`admin-status-tab${status === t.key ? ' is-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.key === 'PENDING_REVIEW' && pending > 0 && <b>{pending}</b>}
              </button>
            ))}
          </div>
          <div className="admin-toolbar">
            <Select
              aria-label="Filter by kind"
              className="admin-select"
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
            >
              <option value="">All kinds</option>
              {Object.entries(TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={6} rows={5} />
        ) : failed ? (
          <LoadFailed what="the flags" onRetry={() => setReloadTick((t) => t + 1)} compact />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="security" size={104} />
            <p>
              {type
                ? 'No flags of this kind here.'
                : status === 'PENDING_REVIEW'
                  ? 'Nothing waits on you. New flags show here after the daily check.'
                  : status
                    ? `No ${STATUS[status].label.toLowerCase()} flags.`
                    : 'No flags yet. The daily check raises one when something looks out of the ordinary.'}
            </p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table am-table afl-table">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>How unusual</th>
                    <th>Person</th>
                    <th>Orders</th>
                    <th>When</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((f) => {
                    const sev = SEVERITY[f.severity] || SEVERITY.LOW;
                    const st = STATUS[f.status] || { label: f.status, cls: 'admin-badge-neutral' };
                    return (
                      <tr key={f.id}>
                        <td data-label="What">
                          <div className="afl-what">
                            <span className="afl-type">{TYPES[f.alertType] || f.alertType}</span>
                            <span className={`admin-badge ${sev.cls}`}>{sev.label}</span>
                          </div>
                          {f.description && <span className="afl-desc">{f.description}</span>}
                          {f.details?.note && <span className="afl-note-text">Note: {f.details.note}</span>}
                        </td>
                        <td data-label="How unusual"><Score value={f.score} /></td>
                        <td data-label="Person"><Person person={f.person} /></td>
                        <td data-label="Orders"><Orders flag={f} /></td>
                        <td data-label="When"><AdminDate value={f.createdAt} time /></td>
                        <td data-label="Status"><span className={`admin-badge ${st.cls}`}>{st.label}</span></td>
                        <td className="am-actions">
                          <div className="am-row-actions">
                            {ACTION_ORDER.filter((to) => to !== f.status).map((to) => (
                              <button
                                key={to}
                                type="button"
                                className={`admin-btn ${ACTIONS[to].cls}`}
                                onClick={() => setAsking({ flag: f, to })}
                              >
                                {ACTIONS[to].button}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <AdminPager page={page} totalPages={totalPages} total={total} onPage={setPage} />
          </>
        )}
      </div>

      <ReasonDialog
        open={!!asking}
        title={action?.title || ''}
        message={asking
          ? `"${TYPES[asking.flag.alertType] || 'This flag'}"${who ? ` for ${who}` : ''}. Only your judgement is recorded: nothing happens to the account, its orders or payments.`
          : ''}
        confirmLabel={action?.confirm || 'Save'}
        placeholder="A note for the other admins (optional), e.g. what you checked"
        danger={Boolean(action?.danger)}
        loading={saving}
        onConfirm={mark}
        onCancel={() => !saving && setAsking(null)}
      />
    </AdminLayout>
  );
}
