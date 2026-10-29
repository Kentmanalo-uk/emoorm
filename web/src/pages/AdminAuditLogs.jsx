import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DownloadSimple, X } from '../lib/icons';
import toast from 'react-hot-toast';
import EmptyArt from '../components/ui/EmptyArt';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { ACTION_LABELS, actionLabel } from '../lib/auditActions';
import { downloadCsv, fetchAllPages } from '../lib/csv';
import { roleLabel } from '../lib/labels';
import { timeAgo } from '../lib/format';
import '../components/admin/AdminLayout.css';
import './AdminModeration.css';
import { useMunicipalities } from '../hooks/useReferenceData';
import Select from '../components/ui/Select';

const ACTIONS = Object.keys(ACTION_LABELS);
const PAGE_SIZE = 25;

// The kinds of record the log holds, in words.
const ENTITY_LABELS = {
  User: 'People',
  Store: 'Shops',
  Product: 'Products',
  Order: 'Orders',
  ReturnRequest: 'Returns',
  Report: 'Reports',
  Review: 'Reviews',
  IdentityVerification: 'ID checks',
  SupportConversation: 'Support cases',
  Announcement: 'Announcements',
  EmailBroadcast: 'Emails',
  Municipality: 'Municipality',
  Courier: 'Couriers',
  Feedback: 'Feedback',
};
const ENTITY_ONE = {
  User: 'Person', Store: 'Shop', Product: 'Product', Order: 'Order', ReturnRequest: 'Return', Report: 'Report',
  Review: 'Review', IdentityVerification: 'ID check', SupportConversation: 'Support case', Announcement: 'Announcement',
  EmailBroadcast: 'Email', Municipality: 'Municipality', Courier: 'Courier', Feedback: 'Feedback',
};

const enc = encodeURIComponent;
// Where a record opens in the admin panel, when it has a page.
const recordHref = (log) => {
  const { entity, entityId: id, record } = log;
  if (!id) return null;
  switch (entity) {
    case 'User':
    case 'IdentityVerification':
      if (record?.role === 'SELLER') return `/admin/all-sellers?search=${enc(record.name || '')}`;
      if (record?.role === 'BUYER') return `/admin/buyers?search=${enc(record.name || '')}`;
      return null;
    case 'Product': return `/admin/products?id=${enc(id)}`;
    case 'Store': return record?.slug ? `/store/${enc(record.slug)}` : null;
    case 'Order': return `/admin/orders?id=${enc(id)}`;
    case 'ReturnRequest': return `/admin/returns?id=${enc(id)}`;
    case 'Report': return `/admin/reports?id=${enc(id)}`;
    case 'SupportConversation': return `/admin/support?c=${enc(id)}`;
    case 'Feedback': return `/admin/feedback?id=${enc(id)}`;
    default: return null;
  }
};

// "paymentStatus" → "Payment status"; "PAID" → "Paid".
const keyLabel = (key) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  .replace(/^./, (c) => c.toUpperCase()).replace(/\b(Id)\b/g, 'ID');
const valueText = (v) => {
  if (Array.isArray(v)) return v.length ? v.map(valueText).join(', ') : 'none';
  if (v && typeof v === 'object') {
    const parts = Object.entries(v).filter(([, x]) => x !== null && x !== undefined && x !== '').map(([k, x]) => `${keyLabel(k).toLowerCase()} ${valueText(x)}`);
    return parts.length ? parts.join(', ') : 'none';
  }
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const str = String(v);
  return /^[A-Z][A-Z_]+$/.test(str) ? keyLabel(str.toLowerCase()) : str;
};
// A log's details as readable pairs, without the reason/note shown above them.
const detailPairs = (details) => {
  if (!details || typeof details !== 'object') return details ? [String(details)] : [];
  return Object.entries(details)
    .filter(([k, v]) => !['reason', 'note'].includes(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${keyLabel(k)}: ${valueText(v)}`);
};

const actorOf = (l) => l.actorName || l.userEmail || (l.userId ? 'Deleted account' : 'System');
const recordName = (l) => {
  if (!l.entityId) return ENTITY_ONE[l.entity] || l.entity;
  return l.record?.name || `${ENTITY_ONE[l.entity] || l.entity} (no longer exists)`;
};
const fullDate = (v) => new Date(v).toLocaleString('en-PH');

export default function AdminAuditLogs() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();
  // ?userId= (an admin's activity, from the team page) and ?entityId= (one
  // record's history, from Recent activity) live in the URL, so the view can
  // be shared and survives a refresh.
  const userId = searchParams.get('userId') || '';
  const entityId = searchParams.get('entityId') || '';
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '', municipalityId: '' });
  const [people, setPeople] = useState([]);
  // Only a super admin uses the municipality filter, so the list is only
  // requested for them.
  const { municipalities } = useMunicipalities({ enabled: isSuperAdmin });
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = () => {
    const p = {};
    if (filters.action) p.action = filters.action;
    if (filters.entity) p.entity = filters.entity;
    if (filters.from) p.from = filters.from;
    if (filters.to) p.to = filters.to;
    if (userId) p.userId = userId;
    if (entityId) p.entityId = entityId;
    if (isSuperAdmin && filters.municipalityId) p.municipalityId = filters.municipalityId;
    return p;
  };

  // Only the newest request fills the table.
  const latest = useRef(0);
  const load = async () => {
    const request = ++latest.current;
    setIsLoading(true);
    try {
      const res = await axios.get('/audit-logs', { params: { page, pageSize: PAGE_SIZE, ...params() } });
      if (request !== latest.current) return;
      setLogs(res.data || []);
      setPagination(res.pagination || { total: 0, totalPages: 0 });
      setFailed(false);
    } catch {
      // Otherwise a failed load looks like an empty log.
      if (request === latest.current) setFailed(true);
    } finally {
      if (request === latest.current) setIsLoading(false);
    }
  };

  // Filters apply as soon as they change.
  useEffect(() => { load(); }, [page, filters, userId, entityId]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  // The people in the log, for "By" (a municipal admin: their town's).
  useEffect(() => {
    let cancelled = false;
    axios.get('/audit-logs/actors', { quiet: true })
      .then((res) => { if (!cancelled) setPeople(res.data || []); })
      .catch(() => { /* the filter just lists nobody */ });
    return () => { cancelled = true; };
  }, []);

  const setFilter = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(1); };
  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages('/audit-logs', params());
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, [
        { header: 'When', value: (l) => fullDate(l.createdAt) },
        { header: 'By', value: actorOf },
        { header: 'Action', value: (l) => actionLabel(l.action) },
        { header: 'Record type', value: (l) => ENTITY_ONE[l.entity] || l.entity },
        { header: 'Record', value: recordName },
        { header: 'Reason or note', value: (l) => l.details?.reason || l.details?.note || '' },
        { header: 'Details', value: (l) => detailPairs(l.details).join('; ') },
      ], rows);
      toast.success(`Exported ${rows.length} rows`);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const person = people.find((p) => p.id === userId);
  const personName = person?.fullName || logs.find((l) => l.userId === userId)?.actorName || 'one person';
  const recordLabel = logs.find((l) => l.entityId === entityId);
  const total = pagination.total || 0;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Audit logs</h1>
          <p className="admin-page-sub">
            {isSuperAdmin ? 'Every admin action, who did it and to what' : 'Actions recorded for your municipality'}
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn-gray" disabled={exporting || total === 0} onClick={handleExport}>
          <DownloadSimple size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      <div className="admin-card">
        <div className="am-filters">
          <Select aria-label="Filter by person" value={userId} onChange={(e) => setParam('userId', e.target.value)} className="admin-input">
            <option value="">Anyone</option>
            {userId && !person && <option value={userId}>{personName}</option>}
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.fullName}{p.role ? ` (${roleLabel(p.role)})` : ''}</option>
            ))}
          </Select>
          <Select aria-label="Filter by action" value={filters.action} onChange={setFilter('action')} className="admin-input">
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
          </Select>
          <Select aria-label="Filter by record type" value={filters.entity} onChange={setFilter('entity')} className="admin-input">
            <option value="">All record types</option>
            {Object.entries(ENTITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          {isSuperAdmin && (
            <Select aria-label="Filter by municipality" value={filters.municipalityId} onChange={setFilter('municipalityId')} className="admin-input">
              <option value="">All municipalities</option>
              {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          )}
          <label className="admin-date-field">
            <span>From</span>
            <input aria-label="From date" type="date" value={filters.from} max={filters.to || undefined} onChange={setFilter('from')} className="admin-input" />
          </label>
          <label className="admin-date-field">
            <span>To</span>
            <input aria-label="To date" type="date" value={filters.to} min={filters.from || undefined} onChange={setFilter('to')} className="admin-input" />
          </label>
        </div>
        {(userId || entityId) && (
          <div className="am-chips">
            {userId && (
              <span className="am-chip">
                By: {personName}
                <button type="button" onClick={() => setParam('userId', '')} aria-label="Show everyone's actions"><X size={12} /></button>
              </span>
            )}
            {entityId && (
              <span className="am-chip">
                Record: {recordLabel ? recordName(recordLabel) : 'one record'}
                <button type="button" onClick={() => setParam('entityId', '')} aria-label="Show every record"><X size={12} /></button>
              </span>
            )}
          </div>
        )}
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            {total.toLocaleString('en-PH')} {total === 1 ? 'entry' : 'entries'}
          </h2>
        </div>
        {isLoading ? (
          <Skeleton.Table cols={5} rows={8} />
        ) : failed ? (
          <LoadFailed what="the audit log" onRetry={load} compact />
        ) : logs.length === 0 ? (
          <div className="admin-empty"><EmptyArt name="activity" size={104} /><p>No entries match these filters.</p></div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>By</th>
                    <th>When</th>
                    <th>Record</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => {
                    const d = l.details && typeof l.details === 'object' ? l.details : null;
                    const note = d?.reason || d?.note;
                    const pairs = detailPairs(l.details);
                    const href = recordHref(l);
                    const external = href?.startsWith('/store/');
                    return (
                      <tr key={l.id}>
                        <td>
                          <span className="admin-badge admin-badge-neutral" title={l.action}>{actionLabel(l.action)}</span>
                        </td>
                        <td>
                          {l.userId ? (
                            <button type="button" className="admin-link" title="Show only this person's actions" onClick={() => setParam('userId', l.userId)}>
                              {actorOf(l)}
                            </button>
                          ) : actorOf(l)}
                        </td>
                        <td>
                          <time className="am-time" dateTime={l.createdAt} title={fullDate(l.createdAt)}>{timeAgo(l.createdAt)}</time>
                        </td>
                        <td>
                          <div className="am-record">
                            {href ? (
                              <Link className="admin-link" to={href} {...(external ? { target: '_blank' } : {})}>{recordName(l)}</Link>
                            ) : <span>{recordName(l)}</span>}
                            {l.entityId && <small className="am-sub am-phone-hide">{ENTITY_ONE[l.entity] || l.entity}</small>}
                          </div>
                        </td>
                        <td>
                          <div className="am-details">
                            {note && <div><strong>{d.reason ? 'Reason' : 'Note'}:</strong> {String(note)}</div>}
                            {pairs.map((p) => <div key={p} className="am-phone-hide">{p}</div>)}
                            {!note && pairs.length === 0 && '—'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button type="button" className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
