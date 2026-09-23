import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  X, Star, CheckCircle, Archive, ArrowCounterClockwise, DownloadSimple,
  MagnifyingGlass, ChatCircleDots,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import EmptyArt from '../components/ui/EmptyArt';
import UserAvatar from '../components/ui/UserAvatar';
import axios from '../lib/axios';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminFeedback.css';

/**
 * Platform feedback, super admin only.
 *
 * This is not the support inbox: nothing here is waiting on a reply. The page
 * is a triage queue — read it, note what you decided, and move it out of New.
 */

const STATUS_BADGE = {
  NEW: 'admin-badge-pending',
  REVIEWED: 'admin-badge-resolved',
  ARCHIVED: 'admin-badge-dismissed',
};

const CATEGORY_LABEL = {
  USABILITY: 'Hard to use',
  PERFORMANCE: 'Too slow',
  BUG: 'Something broken',
  FEATURE_REQUEST: 'Feature request',
  DESIGN: 'How it looks',
  PRAISE: 'Praise',
  OTHER: 'Other',
};

const ROLE_LABEL = {
  BUYER: 'Buyer',
  SELLER: 'Seller',
  MUNICIPAL_ADMIN: 'Municipal admin',
  SUPER_ADMIN: 'Super admin',
};

const STATUS_TABS = [
  { key: 'NEW', label: 'New' },
  { key: 'REVIEWED', label: 'Reviewed' },
  { key: 'ARCHIVED', label: 'Archived' },
  { key: '', label: 'All' },
];

const dateTime = (value) => (value ? new Date(value).toLocaleString('en-PH') : '—');

const Stars = ({ value }) => {
  if (!value) return <span className="afb-norating">No rating</span>;
  return (
    <span className="afb-stars" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={14} weight={n <= value ? 'fill' : 'regular'} className={n <= value ? 'is-on' : ''} />
      ))}
    </span>
  );
};

export default function AdminFeedback() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Raised by whatever changes the query, lowered by the fetch itself. Keeping
  // it out of the fetch keeps that effect free of synchronous state updates.
  const startLoading = () => setIsLoading(true);
  const [statusFilter, setStatusFilter] = useState('NEW');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(null);
  const [exporting, setExporting] = useState(false);
  // Bumped when a triage decision moves a row out of the tab being viewed.
  const [reloadKey, setReloadKey] = useState(0);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = search.trim();
      // Only disturb the list when the term actually changed. Firing blind
      // re-raised the spinner after the first load had already finished, and
      // nothing lowered it again because the query deps had not moved.
      if (next === debounced) return;
      startLoading();
      setDebounced(next);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search, debounced]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const params = { pageSize: 20, page };
        if (statusFilter) params.status = statusFilter;
        if (categoryFilter) params.category = categoryFilter;
        if (debounced) params.search = debounced;

        const res = await axios.get('/feedback', { params });
        if (cancelled) return;
        setRows(res.data || []);
        if (res.pagination) setPagination(res.pagination);
      } catch {
        if (!cancelled) toast.error('Failed to load feedback');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [statusFilter, categoryFilter, debounced, page, reloadKey]);

  useEffect(() => {
    axios.get('/feedback/summary')
      .then((res) => setSummary(res.data))
      .catch(() => { /* the strip just stays hidden */ });
  }, [rows.length]);

  const [searchParams] = useSearchParams();
  // Deep link from the super admin's notification: /admin/feedback?id=<id>.
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || openedId.current === targetId) return;
    openedId.current = targetId;
    const listed = rows.find((r) => r.id === targetId);
    Promise.resolve(listed || axios.get(`/feedback/${targetId}`).then((res) => res.data))
      .then((item) => setSelected(item))
      .catch((err) => {
        toast.error(err?.status === 404
          ? 'That feedback no longer exists.'
          : 'Could not load that feedback. Please try again.');
        console.error('[AdminFeedback] deep link failed', err?.status, err?.message);
      });
  }, [rows, searchParams]);

  const setStatus = async (id, status) => {
    setProcessing(id);
    try {
      const body = { status };
      if (notes.trim()) body.adminNotes = notes.trim();
      const res = await axios.patch(`/feedback/${id}`, body);
      toast.success(`Marked as ${status.toLowerCase()}`);
      setRows((prev) => prev.map((r) => (r.id === id ? res.data : r)));
      if (selected?.id === id) setSelected(res.data);
      setNotes('');
      // A row that no longer matches the active tab should leave it.
      if (statusFilter && statusFilter !== status) {
        startLoading();
        setReloadKey((k) => k + 1);
      }
    } catch (err) {
      toast.error(err.message || 'Could not update this feedback');
    } finally {
      setProcessing(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (categoryFilter) params.category = categoryFilter;
      const all = await fetchAllPages('/feedback', params);
      downloadCsv('feedback', all, [
        { header: 'Submitted', value: (r) => csvDate(r.createdAt) },
        { header: 'Status', value: (r) => r.status },
        { header: 'Category', value: (r) => CATEGORY_LABEL[r.category] || r.category },
        { header: 'Rating', value: (r) => r.rating ?? '' },
        { header: 'From', value: (r) => r.user?.fullName || 'Deleted account' },
        { header: 'Email', value: (r) => r.user?.email || '' },
        { header: 'Role', value: (r) => ROLE_LABEL[r.role] || r.role || '' },
        { header: 'Municipality', value: (r) => r.municipality?.name || '' },
        { header: 'Page', value: (r) => r.page || '' },
        { header: 'Message', value: (r) => r.message || '' },
        { header: 'Admin notes', value: (r) => r.adminNotes || '' },
        { header: 'Reviewed by', value: (r) => r.reviewedBy?.fullName || '' },
      ]);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const avg = summary?.averageRating;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Feedback</h1>
          <p className="admin-page-subtitle">
            What people are telling us about E-MOORM itself. Order and account
            problems go to <Link to="/admin/support" className="admin-link">Buyer Support</Link> instead.
          </p>
        </div>
      </div>

      {summary && (
        <div className="afb-summary">
          <div className="afb-stat">
            <span className="afb-stat-value">{summary.byStatus?.NEW || 0}</span>
            <span className="afb-stat-label">Waiting to read</span>
          </div>
          <div className="afb-stat">
            <span className="afb-stat-value">{summary.total || 0}</span>
            <span className="afb-stat-label">Total received</span>
          </div>
          <div className="afb-stat">
            <span className="afb-stat-value">
              {avg ? avg.toFixed(1) : '—'}
              {avg ? <Star size={16} weight="fill" className="afb-stat-star" /> : null}
            </span>
            <span className="afb-stat-label">
              Average rating{summary.ratedCount ? ` · ${summary.ratedCount} rated` : ''}
            </span>
          </div>
          <div className="afb-stat">
            <span className="afb-stat-value">{summary.byCategory?.BUG || 0}</span>
            <span className="afb-stat-label">Reported as broken</span>
          </div>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="afb-tabs" role="tablist">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key || 'all'}
                type="button"
                role="tab"
                aria-selected={statusFilter === t.key}
                className={`afb-tab ${statusFilter === t.key ? 'is-active' : ''}`}
                onClick={() => { startLoading(); setStatusFilter(t.key); setPage(1); }}
              >
                {t.label}
                {t.key === 'NEW' && summary?.byStatus?.NEW ? (
                  <span className="afb-tab-count">{summary.byStatus.NEW}</span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="admin-toolbar">
            <div className="afb-search">
              <MagnifyingGlass size={14} />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search message or sender…"
                aria-label="Search feedback"
              />
            </div>
            <select
              className="admin-select"
              value={categoryFilter}
              onChange={(e) => { startLoading(); setCategoryFilter(e.target.value); setPage(1); }}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="button" className="admin-btn admin-btn-gray" disabled={exporting} onClick={handleExport}>
              <DownloadSimple size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={5} rows={6} />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="inbox" size={104} />
            <p>{debounced ? 'No feedback matches that search' : 'No feedback here yet'}</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>From</th>
                    <th>Feedback</th>
                    <th>Category</th>
                    <th>Rating</th>
                    <th>Received</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="admin-row-clickable"
                      onClick={rowOpen(() => setSelected(r))}
                      onKeyDown={rowKeyOpen(() => setSelected(r))}
                      tabIndex={0}
                    >
                      <td>
                        <div className="afb-person">
                          <UserAvatar
                            src={r.user?.profilePhoto}
                            name={r.user?.fullName || '?'}
                            alt=""
                            className="afb-avatar"
                            fallbackClassName="afb-avatar afb-avatar-fallback"
                          />
                          <div>
                            <strong>{r.user?.fullName || 'Deleted account'}</strong>
                            <span className="afb-person-meta">
                              {[ROLE_LABEL[r.role] || r.role, r.municipality?.name].filter(Boolean).join(' · ') || '—'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="afb-excerpt">{r.message}</td>
                      <td>{CATEGORY_LABEL[r.category] || r.category}</td>
                      <td><Stars value={r.rating} /></td>
                      <td className="afb-when">{dateTime(r.createdAt)}</td>
                      <td>
                        <span className={`admin-badge ${STATUS_BADGE[r.status] || ''}`}>{r.status}</span>
                      </td>
                      <td>
                        <button className="admin-btn admin-btn-gray" onClick={() => setSelected(r)}>
                          <ChatCircleDots size={13} /> Read
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button
                  className="admin-btn admin-btn-gray"
                  disabled={page <= 1}
                  onClick={() => { startLoading(); setPage((p) => p - 1); }}
                >
                  Previous
                </button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button
                  className="admin-btn admin-btn-gray"
                  disabled={page >= pagination.totalPages}
                  onClick={() => { startLoading(); setPage((p) => p + 1); }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <DetailDrawer item={selected} onClose={() => { setSelected(null); setNotes(''); }}>
        {(item) => (
          <>
            <div className="admin-detail-header">
              <h3>Feedback</h3>
              <button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div className="admin-detail-body">
              <div className="admin-detail-section">
                <h4>What they said</h4>
                <p className="afb-message">{item.message}</p>
              </div>

              <div className="admin-detail-section">
                <h4>Context</h4>
                <div className="admin-detail-grid">
                  <div><label>Category</label><p>{CATEGORY_LABEL[item.category] || item.category}</p></div>
                  <div><label>Rating</label><p><Stars value={item.rating} /></p></div>
                  <div><label>Received</label><p>{dateTime(item.createdAt)}</p></div>
                  <div>
                    <label>Status</label>
                    <p><span className={`admin-badge ${STATUS_BADGE[item.status] || ''}`}>{item.status}</span></p>
                  </div>
                  <div className="admin-detail-full">
                    <label>Sent from</label>
                    <p>{item.page || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="admin-detail-section">
                <h4>Who sent it</h4>
                <div className="admin-detail-grid">
                  <div><label>Name</label><p>{item.user?.fullName || 'Deleted account'}</p></div>
                  <div><label>Username</label><p>{item.user?.username ? `@${item.user.username}` : '—'}</p></div>
                  <div><label>Role</label><p>{ROLE_LABEL[item.role] || item.role || '—'}</p></div>
                  <div><label>Municipality</label><p>{item.municipality?.name || '—'}</p></div>
                  <div className="admin-detail-full">
                    <label>Email</label>
                    <p>
                      {item.user?.email
                        ? <a className="admin-link" href={`mailto:${item.user.email}`}>{item.user.email}</a>
                        : '—'}
                    </p>
                  </div>
                  {item.user?.id && (
                    <div className="admin-detail-full">
                      <label>Profile</label>
                      <p><Link to={`/u/${item.user.id}`} className="admin-link" target="_blank">View public profile</Link></p>
                    </div>
                  )}
                </div>
              </div>

              {(item.adminNotes || item.reviewedBy) && (
                <div className="admin-detail-section">
                  <h4>What we decided</h4>
                  <div className="admin-detail-grid">
                    {item.adminNotes && (
                      <div className="admin-detail-full">
                        <label>Notes</label>
                        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{item.adminNotes}</p>
                      </div>
                    )}
                    <div><label>Reviewed by</label><p>{item.reviewedBy?.fullName || '—'}</p></div>
                    <div><label>Reviewed</label><p>{dateTime(item.reviewedAt)}</p></div>
                  </div>
                </div>
              )}

              <div className="admin-detail-section">
                <h4>Triage</h4>
                <textarea
                  className="afb-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note — what you decided, or where this is tracked…"
                />
                <div className="afb-actions">
                  {item.status !== 'REVIEWED' && (
                    <button
                      type="button"
                      className="admin-btn admin-btn-green"
                      disabled={processing === item.id}
                      onClick={() => setStatus(item.id, 'REVIEWED')}
                    >
                      <CheckCircle size={14} /> Mark reviewed
                    </button>
                  )}
                  {item.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      className="admin-btn admin-btn-gray"
                      disabled={processing === item.id}
                      onClick={() => setStatus(item.id, 'ARCHIVED')}
                    >
                      <Archive size={14} /> Archive
                    </button>
                  )}
                  {item.status !== 'NEW' && (
                    <button
                      type="button"
                      className="admin-btn admin-btn-gray"
                      disabled={processing === item.id}
                      onClick={() => setStatus(item.id, 'NEW')}
                    >
                      <ArrowCounterClockwise size={14} /> Put back
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </DetailDrawer>
    </AdminLayout>
  );
}
