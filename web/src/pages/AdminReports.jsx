import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Eye, X, CheckCircle, ChatText as MessageSquare, DotsThree, Prohibit, ChatCircleDots,
  DownloadSimple, UserCircle, Storefront, Paperclip, ShoppingBag, WarningCircle,
} from '../lib/icons';
import toast from 'react-hot-toast';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import ReasonDialog from '../components/admin/ReasonDialog';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import EmptyArt from '../components/ui/EmptyArt';
import useAuthStore from '../store/authStore';
import { useRefreshAdminShell } from '../hooks/useAdminShellData';
import { reportReason, reportStatus } from '../lib/labels';
import { timeAgo } from '../lib/format';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminModeration.css';
import Select from '../components/ui/Select';

const STATUS_BADGE = {
  PENDING: 'admin-badge-pending',
  UNDER_REVIEW: 'admin-badge-review',
  RESOLVED: 'admin-badge-resolved',
  DISMISSED: 'admin-badge-dismissed',
};

// "Open" is the queue (new + being checked), the same count as the badge.
const STATUS_FILTERS = [
  ['OPEN', 'Open (new and being checked)'],
  ['PENDING', reportStatus('PENDING')],
  ['UNDER_REVIEW', reportStatus('UNDER_REVIEW')],
  ['RESOLVED', reportStatus('RESOLVED')],
  ['DISMISSED', reportStatus('DISMISSED')],
  ['', 'All statuses'],
];

const isOpen = (r) => r.status === 'PENDING' || r.status === 'UNDER_REVIEW';
const dateTime = (value) => (value ? new Date(value).toLocaleString('en-PH') : '—');

/**
 * Why a deep-linked report would not open.
 *
 * This used to report every failure as "no longer available", so a permission
 * problem, a server error and a genuinely deleted report were indistinguishable
 * — and the only clue was a toast that vanished after a few seconds.
 */
const openFailure = (status) => {
  if (status === 404) return 'That report no longer exists — it may have been deleted.';
  if (status === 403) return 'That report belongs to another municipality, so you cannot open it.';
  if (status === 401) return 'Your session expired. Sign in again to open this report.';
  return 'Could not load that report. Check your connection and try again.';
};

/** Where the reporter lives — context only; routing follows the seller. */
const reporterPlace = (reporter) => [reporter?.barangay, reporter?.municipality?.name]
  .filter(Boolean).join(', ');

/** What the report is aimed at, in words rather than an enum. */
const TYPE_LABEL = { PRODUCT: 'Product', SELLER: 'Seller', BUYER: 'Buyer' };

/** Evidence is stored as a JSON array of URLs. */
const evidenceList = (report) => (Array.isArray(report?.evidence) ? report.evidence : []);

// What was reported: a listing, or the seller behind a store, or a buyer.
const targetName = (r) => r.product?.name
  || r.reportedSeller?.store?.name
  || r.reportedSeller?.fullName
  || r.reportedBuyer?.fullName
  || '—';

const targetLink = (r) => {
  if (r.product?.slug) return `/product/${r.product.slug}`;
  if (r.reportedSeller?.store?.slug) return `/store/${r.reportedSeller.store.slug}`;
  return null;
};

// The shop behind a report (a product's shop, or the reported seller's).
const storeOf = (r) => r.product?.store || r.reportedSeller?.store || null;
const sellerIdOf = (r) => r.product?.store?.ownerId || r.reportedSeller?.id || null;

/**
 * The chat between the two people a report is about, loaded on request (the
 * server logs each look). Messages the sender unsent are shown, marked: they
 * are kept hidden for 30 days so a report about the chat can be checked.
 */
function ReportChat({ reportId }) {
  const [state, setState] = useState({ status: 'idle', data: null, error: '' });
  const load = async () => {
    setState({ status: 'loading', data: null, error: '' });
    try {
      const res = await axios.get(`/reports/${reportId}/conversation`);
      setState({ status: 'done', data: res.data, error: '' });
    } catch (err) {
      setState({ status: 'error', data: null, error: err.message || 'Could not load the chat' });
    }
  };
  const data = state.data;
  return (
    <div className="admin-detail-section">
      <h4><MessageSquare size={13} /> Chat between them</h4>
      {state.status === 'idle' && (
        <button type="button" className="admin-btn admin-btn-outline" onClick={load}>
          Show the chat
        </button>
      )}
      {state.status === 'loading' && <p className="admin-report-chat-note">Loading the chat…</p>}
      {state.status === 'error' && (
        <p className="admin-report-chat-note" role="alert">
          {state.error} <button type="button" className="admin-link" onClick={load}>Try again</button>
        </p>
      )}
      {state.status === 'done' && (!data?.conversationId ? (
        <p className="admin-report-chat-note">They have no chat on E-MOORM.</p>
      ) : (
        <>
          <p className="admin-report-chat-note">
            {data.buyer?.fullName || 'Buyer'} and {data.store?.name || 'the shop'}, newest {data.messages.length} messages.
            Your look at this chat is recorded in the audit log.
          </p>
          <ol className="admin-report-chat">
            {data.messages.map((m) => (
              <li key={m.id} className={`is-${m.from}${m.unsentAt ? ' is-unsent' : ''}`}>
                <span className="admin-report-chat-who">
                  {m.from === 'buyer' ? (data.buyer?.fullName || 'Buyer') : (data.store?.name || 'Shop')}
                  {' · '}
                  {dateTime(m.createdAt)}
                  {m.unsentAt && <b> · Unsent {dateTime(m.unsentAt)}</b>}
                </span>
                {m.body && <span className="admin-report-chat-text">{m.body}</span>}
                {m.imageUrl && (
                  <a href={resolveImg(m.imageUrl)} target="_blank" rel="noopener noreferrer" className="admin-report-chat-photo">
                    <img src={resolveImg(m.imageUrl)} alt="Photo in the chat" />
                  </a>
                )}
              </li>
            ))}
          </ol>
        </>
      ))}
    </div>
  );
}

/** A row's other actions behind one "⋯" button. */
function RowMenu({ report, busy, onPick }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  if (!isOpen(report)) return null;
  const pick = (what) => { setOpen(false); onPick(what); };
  return (
    <div className="am-menu" ref={wrapRef}>
      <button
        type="button"
        className="admin-btn admin-btn-gray"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <DotsThree size={16} weight="bold" />
      </button>
      {open && (
        <div className="am-menu-list" role="menu">
          {report.status === 'PENDING' && (
            <button type="button" role="menuitem" onClick={() => pick('UNDER_REVIEW')}>Mark as being checked</button>
          )}
          <button type="button" role="menuitem" onClick={() => pick('RESOLVED')}>Resolve…</button>
          <button type="button" role="menuitem" onClick={() => pick('DISMISSED')}>Dismiss…</button>
        </div>
      )}
    </div>
  );
}

export default function AdminReports() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [reports, setReports] = useState([]);
  // Only the super admin sees this: a municipal admin is scoped server-side
  // and the control would be a lie.
  const [municipalityFilter, setMunicipalityFilter] = useState('');
  const [municipalities, setMunicipalities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [exporting, setExporting] = useState(false);
  // Optional note saved with the decision, so "why" survives the drawer.
  const [notes, setNotes] = useState('');
  // A decision from a row, or an action on the reported account, waiting
  // for its note: { report, kind: 'RESOLVED' | 'DISMISSED' | 'SUSPEND_PRODUCT' | 'SUSPEND_STORE' }.
  const [asking, setAsking] = useState(null);
  // A decision changes the waiting count beside Reports.
  const refreshShell = useRefreshAdminShell();

  // The municipality list only exists to populate the super admin's filter.
  useEffect(() => {
    if (!isSuperAdmin) return undefined;
    let cancelled = false;
    axios.get('/municipalities')
      .then((res) => { if (!cancelled) setMunicipalities(res.data || []); })
      .catch(() => { /* the filter just stays empty */ });
    return () => { cancelled = true; };
  }, [isSuperAdmin]);

  const [searchParams, setSearchParams] = useSearchParams();
  // Shown in place when a deep link fails, rather than only as a toast.
  const [deepLinkError, setDeepLinkError] = useState(null);
  // Deep link from an admin notification: /admin/reports?id=<reportId>.
  // The report is usually on the open page already; one that is filtered
  // out is fetched on its own so the link never dead-ends.
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || openedId.current === targetId) return;
    openedId.current = targetId;

    const listed = reports.find((r) => r.id === targetId);
    // Resolve through a promise either way, so the drawer never opens during
    // this effect's own render pass.
    Promise.resolve(listed || axios.get(`/reports/${targetId}`).then((res) => res.data))
      .then((report) => {
        setDeepLinkError(null);
        setSelected(report);
      })
      .catch((err) => {
        const reason = openFailure(err?.status);
        setDeepLinkError({ id: targetId, reason });
        toast.error(reason);
        // Keep the real cause available; the banner deliberately does not
        // show a status code to the admin.
        console.error('[AdminReports] deep link failed', err?.status, err?.message);
      });
  }, [reports, searchParams]);

  /** Drop the ?id= so a refresh does not replay a link that already failed. */
  const dismissDeepLinkError = () => {
    setDeepLinkError(null);
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
  };

  const listParams = () => {
    const params = {};
    if (typeFilter) params.type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    // Ignored by the API for a municipal admin, who is always scoped to
    // their own municipality regardless of what they send.
    if (isSuperAdmin && municipalityFilter) params.municipalityId = municipalityFilter;
    return params;
  };

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/reports', { params: { pageSize: 20, page, ...listParams() } });
      setReports(res.data || []);
      setLoadFailed(false);
      if (res.pagination) setPagination(res.pagination);
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [typeFilter, statusFilter, municipalityFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const handleUpdateStatus = async (reportId, newStatus, resolutionNotes) => {
    setProcessing(reportId);
    try {
      const body = { status: newStatus };
      if (resolutionNotes?.trim()) body.resolutionNotes = resolutionNotes.trim();
      const res = await axios.put(`/reports/${reportId}/status`, body);
      toast.success(`Report: ${reportStatus(newStatus).toLowerCase()}`);
      if (selected?.id === reportId) {
        setSelected((prev) => ({
          ...prev,
          ...(res.data || {}),
          status: newStatus,
          ...(body.resolutionNotes ? { resolutionNotes: body.resolutionNotes } : {}),
        }));
      }
      setNotes('');
      fetchReports();
      refreshShell('attention');
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
      return false;
    } finally {
      setProcessing(null);
    }
  };

  // Act on what was reported, then close the report with what was done, so
  // the reporter hears it and the next admin does not act twice.
  const actOnReport = async (report, kind, reason) => {
    const store = storeOf(report);
    setProcessing(report.id);
    try {
      if (kind === 'SUSPEND_PRODUCT') {
        await axios.post(`/products/${report.product.id}/suspend`, { reason });
      } else {
        await axios.post(`/stores/${store.id}/suspend`, { reason });
      }
    } catch (err) {
      setProcessing(null);
      toast.error(err.message || 'That could not be done');
      return;
    }
    setProcessing(null);
    const what = kind === 'SUSPEND_PRODUCT'
      ? `Product "${report.product.name}" suspended`
      : `Shop "${store.name}" suspended`;
    await handleUpdateStatus(report.id, 'RESOLVED', `${what}: ${reason}`);
  };

  const confirmAsking = async (note) => {
    if (!asking) return;
    const { report, kind } = asking;
    if (kind === 'RESOLVED' || kind === 'DISMISSED') {
      if (await handleUpdateStatus(report.id, kind, note)) setAsking(null);
      return;
    }
    await actOnReport(report, kind, note);
    setAsking(null);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages('/reports', listParams());
      downloadCsv(`reports-${new Date().toISOString().slice(0, 10)}.csv`, [
        { header: 'Date', value: (r) => csvDate(r.createdAt) },
        { header: 'Type', value: (r) => TYPE_LABEL[r.type] || r.type },
        { header: 'Reason', value: (r) => reportReason(r.reason, r.type) },
        { header: 'Status', value: (r) => reportStatus(r.status) },
        { header: 'Target', value: (r) => targetName(r) },
        { header: 'Reporter', value: (r) => r.reporter?.fullName || '' },
        { header: 'Reporter Municipality', value: (r) => r.reporter?.municipality?.name || '' },
        { header: 'Reported Seller', value: (r) => r.reportedSeller?.fullName || '' },
        { header: 'Description', value: (r) => r.description },
        { header: 'Resolution Notes', value: (r) => r.resolutionNotes || '' },
      ], rows);
      toast.success(`Exported ${rows.length} rows`);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const askingCopy = (() => {
    if (!asking) return {};
    const { report, kind } = asking;
    const target = targetName(report);
    if (kind === 'SUSPEND_PRODUCT') {
      return {
        title: `Suspend "${report.product?.name}"?`,
        message: 'Buyers stop seeing it at once and the seller is told this reason. The report is then marked resolved with what you did.',
        confirmLabel: 'Suspend and resolve',
        placeholder: 'Reason the seller sees, e.g. counterfeit brand items',
        required: true,
        danger: true,
      };
    }
    if (kind === 'SUSPEND_STORE') {
      return {
        title: `Suspend the shop "${storeOf(report)?.name}"?`,
        message: 'The whole shop is hidden from buyers until you lift it, and the seller is told this reason. The report is then marked resolved with what you did.',
        confirmLabel: 'Suspend shop and resolve',
        placeholder: 'Reason the seller sees',
        required: true,
        danger: true,
      };
    }
    const resolving = kind === 'RESOLVED';
    return {
      title: resolving ? `Resolve the report on ${target}?` : `Dismiss the report on ${target}?`,
      message: `${report.reporter?.fullName || 'The reporter'} sees this note on their report.`,
      confirmLabel: resolving ? 'Resolve' : 'Dismiss',
      placeholder: resolving ? 'What you checked and did' : 'Why there is nothing to act on',
      required: true,
      danger: !resolving,
    };
  })();

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Reports</h1>
          <p className="admin-page-sub">What buyers and sellers reported, oldest waiting first to act on</p>
        </div>
        <button type="button" className="admin-btn admin-btn-gray" disabled={exporting} onClick={handleExport}>
          <DownloadSimple size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {deepLinkError && (
        <div className="admin-card ar-deeplink-error" role="alert">
          <WarningCircle size={18} weight="fill" />
          <div>
            <strong>Could not open that report</strong>
            <p>{deepLinkError.reason}</p>
          </div>
          <button type="button" className="admin-btn admin-btn-gray" onClick={dismissDeepLinkError}>
            Dismiss
          </button>
        </div>
      )}

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Reports
            {pagination.total > 0 && <span className="am-count">({pagination.total.toLocaleString('en-PH')})</span>}
          </h2>
          <div className="admin-toolbar">
            <Select
              aria-label="Filter by status"
              className="admin-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              {STATUS_FILTERS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}
            </Select>
            <Select
              aria-label="Filter by type"
              className="admin-select"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            >
              <option value="">All types</option>
              <option value="PRODUCT">Products</option>
              <option value="SELLER">Sellers</option>
              <option value="BUYER">Buyers</option>
            </Select>
            {isSuperAdmin && (
              <Select
                className="admin-select"
                value={municipalityFilter}
                onChange={(e) => { setMunicipalityFilter(e.target.value); setPage(1); }}
                aria-label="Filter by municipality"
              >
                <option value="">All municipalities</option>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </Select>
            )}
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={6} rows={6} />
        ) : loadFailed ? (
          <LoadFailed what="the reports" onRetry={fetchReports} compact />
        ) : reports.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="reports" size={104} />
            <p>{statusFilter === 'OPEN' ? 'No open reports. Nothing waits on you.' : 'No reports match these filters'}</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Reported</th>
                    <th>Type</th>
                    <th>Reporter</th>
                    <th>Reason</th>
                    <th>Waiting</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const link = targetLink(r);
                    return (
                      <tr
                        key={r.id}
                        className="admin-row-clickable"
                        tabIndex={0}
                        onClick={rowOpen(() => setSelected(r))}
                        onKeyDown={rowKeyOpen(() => setSelected(r))}
                      >
                        <td>
                          {link
                            ? <Link to={link} className="admin-link" target="_blank">{targetName(r)}</Link>
                            : targetName(r)}
                        </td>
                        <td className="am-phone-hide"><span className="admin-badge admin-badge-neutral">{TYPE_LABEL[r.type] || r.type}</span></td>
                        <td>
                          <div className="admin-user-cell-name">{r.reporter?.fullName || '—'}</div>
                          <div className="admin-user-cell-email am-phone-hide">
                            {[r.reporter?.username ? `@${r.reporter.username}` : null, r.reporter?.municipality?.name]
                              .filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td><span className="admin-report-description">{reportReason(r.reason, r.type)}</span></td>
                        <td>
                          <time className="am-time" dateTime={r.createdAt} title={`Reported ${dateTime(r.createdAt)}`}>
                            {isOpen(r) ? timeAgo(r.createdAt) : '—'}
                          </time>
                        </td>
                        <td>
                          <span className={`admin-badge ${STATUS_BADGE[r.status] || ''}`}>{reportStatus(r.status)}</span>
                        </td>
                        <td>
                          <div className="am-row-actions">
                            <button type="button" className="admin-btn admin-btn-gray" onClick={() => setSelected(r)}>
                              <Eye size={13} /> View
                            </button>
                            <RowMenu
                              report={r}
                              busy={processing === r.id}
                              onPick={(what) => (what === 'UNDER_REVIEW'
                                ? handleUpdateStatus(r.id, 'UNDER_REVIEW')
                                : setAsking({ report: r, kind: what }))}
                            />
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

      {/* Detail panel */}
      <DetailDrawer item={selected} onClose={() => { setSelected(null); setNotes(''); }}>
        {(selected) => {
          const seller = selected.reportedSeller;
          const buyer = selected.reportedBuyer;
          const evidence = evidenceList(selected);
          const settled = selected.status === 'RESOLVED' || selected.status === 'DISMISSED';
          const resolver = selected.resolvedBy?.fullName || selected.resolvedBy?.username;
          const store = storeOf(selected);
          const sellerId = sellerIdOf(selected);
          const busy = processing === selected.id;

          return (
            <>
              <div className="admin-detail-header">
                <h3>Report details</h3>
                <button type="button" className="admin-detail-close" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button>
              </div>

              <div className="admin-detail-body">
                <div className="admin-detail-section">
                  <h4>Report info</h4>
                  <div className="admin-detail-grid">
                    <div><label>Type</label><p>{TYPE_LABEL[selected.type] || selected.type}</p></div>
                    <div>
                      <label>Status</label>
                      <p><span className={`admin-badge ${STATUS_BADGE[selected.status] || ''}`}>{reportStatus(selected.status)}</span></p>
                    </div>
                    <div>
                      <label>Reason</label>
                      <p>{reportReason(selected.reason, selected.type)}</p>
                    </div>
                    <div>
                      <label>Submitted</label>
                      <p>{dateTime(selected.createdAt)}{isOpen(selected) ? ` (${timeAgo(selected.createdAt)})` : ''}</p>
                    </div>
                    <div className="admin-detail-full">
                      <label>Handled by</label>
                      <p>{selected.municipality?.name ? `${selected.municipality.name} municipal admins` : '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="admin-detail-section">
                  <h4><UserCircle size={13} /> Reporter</h4>
                  <div className="admin-detail-grid">
                    <div><label>Name</label><p>{selected.reporter?.fullName || '—'}</p></div>
                    <div>
                      <label>Username</label>
                      <p>{selected.reporter?.username ? `@${selected.reporter.username}` : '—'}</p>
                    </div>
                    <div className="admin-detail-full">
                      <label>Where they are</label>
                      <p>{reporterPlace(selected.reporter) || '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="admin-detail-section">
                  <h4>
                    {buyer ? <ShoppingBag size={13} /> : <Storefront size={13} />}{' '}
                    {selected.product ? 'Reported product' : buyer ? 'Reported buyer' : 'Reported seller'}
                  </h4>
                  {selected.product ? (
                    <div className="admin-detail-grid">
                      <div className="admin-detail-full">
                        <label>Product</label>
                        <p>
                          {selected.product.slug
                            ? <Link to={`/product/${selected.product.slug}`} className="admin-link" target="_blank">{selected.product.name}</Link>
                            : selected.product.name}
                        </p>
                      </div>
                      <div className="admin-detail-full">
                        <label>Store</label>
                        <p>
                          {selected.product.store?.slug
                            ? <Link to={`/store/${selected.product.store.slug}`} className="admin-link" target="_blank">{selected.product.store.name}</Link>
                            : selected.product.store?.name || '—'}
                        </p>
                      </div>
                    </div>
                  ) : seller ? (
                    <div className="admin-detail-grid">
                      <div><label>Name</label><p>{seller.fullName || '—'}</p></div>
                      <div><label>Username</label><p>{seller.username ? `@${seller.username}` : '—'}</p></div>
                      <div>
                        <label>Store</label>
                        <p>
                          {seller.store?.slug
                            ? <Link to={`/store/${seller.store.slug}`} className="admin-link" target="_blank">{seller.store.name}</Link>
                            : seller.store?.name || '—'}
                        </p>
                      </div>
                      <div>
                        <label>Store municipality</label>
                        <p>{seller.store?.municipality?.name || '—'}</p>
                      </div>
                    </div>
                  ) : buyer ? (
                    <div className="admin-detail-grid">
                      <div><label>Name</label><p>{buyer.fullName || '—'}</p></div>
                      <div><label>Username</label><p>{buyer.username ? `@${buyer.username}` : '—'}</p></div>
                      <div className="admin-detail-full">
                        <label>Where they are</label>
                        <p>{reporterPlace(buyer) || '—'}</p>
                      </div>
                      <div className="admin-detail-full">
                        <label>Profile</label>
                        <p><Link to={`/u/${buyer.id}`} className="admin-link" target="_blank">View public profile</Link></p>
                      </div>
                    </div>
                  ) : (
                    <div className="admin-detail-grid">
                      <div className="admin-detail-full"><p>No target recorded on this report.</p></div>
                    </div>
                  )}
                </div>

                <div className="admin-detail-section">
                  <h4><MessageSquare size={13} /> What they wrote</h4>
                  <p className="am-desc">{selected.description || 'No description, only the reason above.'}</p>
                </div>

                <div className="admin-detail-section">
                  <h4><Paperclip size={13} /> Evidence</h4>
                  {evidence.length === 0 ? (
                    <div className="admin-id-photos">
                      <div className="admin-id-missing">The reporter attached no evidence.</div>
                    </div>
                  ) : (
                    <div className="admin-id-photos">
                      {evidence.map((url, index) => (
                        <a
                          key={`${url}-${index}`}
                          className="admin-id-photo"
                          href={resolveImg(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <span className="admin-id-label">Attachment {index + 1}</span>
                          <img src={resolveImg(url)} alt={`Evidence ${index + 1}`} />
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <ReportChat key={selected.id} reportId={selected.id} />

                {/* Act from the report: on what was reported, or talk to the
                    people involved. Suspending also resolves the report. */}
                <div className="admin-detail-section">
                  <h4>Act on it</h4>
                  <div className="am-detail-actions">
                    {isOpen(selected) && selected.product?.id && (
                      <button type="button" className="admin-btn admin-btn-red" disabled={busy} onClick={() => setAsking({ report: selected, kind: 'SUSPEND_PRODUCT' })}>
                        <Prohibit size={14} /> Suspend product
                      </button>
                    )}
                    {isOpen(selected) && store?.id && (
                      <button type="button" className="admin-btn admin-btn-red" disabled={busy} onClick={() => setAsking({ report: selected, kind: 'SUSPEND_STORE' })}>
                        <Prohibit size={14} /> Suspend shop
                      </button>
                    )}
                    {sellerId && (
                      <Link className="admin-btn admin-btn-gray" to={`/admin/support?to=${encodeURIComponent(sellerId)}`}>
                        <ChatCircleDots size={14} /> Message seller
                      </Link>
                    )}
                    {buyer?.id && (
                      <Link className="admin-btn admin-btn-gray" to={`/admin/support?to=${encodeURIComponent(buyer.id)}`}>
                        <ChatCircleDots size={14} /> Message buyer
                      </Link>
                    )}
                    {selected.reporter?.id && (
                      <Link className="admin-btn admin-btn-gray" to={`/admin/support?to=${encodeURIComponent(selected.reporter.id)}`}>
                        <ChatCircleDots size={14} /> Message reporter
                      </Link>
                    )}
                  </div>
                </div>

                {(settled || selected.resolutionNotes) && (
                  <div className="admin-detail-section">
                    <h4><CheckCircle size={13} /> Resolution</h4>
                    <div className="admin-detail-grid">
                      <div><label>Decided</label><p>{dateTime(selected.resolvedAt)}</p></div>
                      <div><label>Decided by</label><p>{resolver || '—'}</p></div>
                      <div className="admin-detail-full">
                        <label>Notes</label>
                        <p className="am-desc">{selected.resolutionNotes || 'No notes were written.'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status actions */}
                {isOpen(selected) && (
                  <div className="admin-detail-section">
                    <h4>Decide</h4>
                    <div className="admin-detail-grid">
                      <div className="admin-detail-full">
                        <label htmlFor="report-notes">Resolution notes (the reporter sees them)</label>
                        <textarea
                          id="report-notes"
                          className="admin-input"
                          rows={3}
                          maxLength={1000}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="What you checked and what you decided."
                        />
                      </div>
                    </div>
                    <div className="am-detail-actions">
                      {selected.status === 'PENDING' && (
                        <button
                          type="button"
                          className="admin-btn admin-btn-blue"
                          disabled={busy}
                          onClick={() => handleUpdateStatus(selected.id, 'UNDER_REVIEW', notes)}
                        >
                          Mark as being checked
                        </button>
                      )}
                      <button
                        type="button"
                        className="admin-btn admin-btn-green"
                        disabled={busy || notes.trim().length < 3}
                        title={notes.trim().length < 3 ? 'Write a short note first' : undefined}
                        onClick={() => handleUpdateStatus(selected.id, 'RESOLVED', notes)}
                      >
                        <CheckCircle size={14} /> Resolve
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn-gray"
                        disabled={busy || notes.trim().length < 3}
                        title={notes.trim().length < 3 ? 'Write a short note first' : undefined}
                        onClick={() => handleUpdateStatus(selected.id, 'DISMISSED', notes)}
                      >
                        Dismiss report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          );
        }}
      </DetailDrawer>

      <ReasonDialog
        open={Boolean(asking)}
        title={askingCopy.title}
        message={askingCopy.message}
        confirmLabel={askingCopy.confirmLabel}
        placeholder={askingCopy.placeholder}
        required={askingCopy.required}
        danger={askingCopy.danger}
        loading={Boolean(asking) && processing === asking.report.id}
        onConfirm={confirmAsking}
        onCancel={() => setAsking(null)}
      />
    </AdminLayout>
  );
}
