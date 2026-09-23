import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Eye, X, CheckCircle, ChatText as MessageSquare,
  DownloadSimple, UserCircle, Storefront, Paperclip, ShoppingBag, WarningCircle,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import EmptyArt from '../components/ui/EmptyArt';
import useAuthStore from '../store/authStore';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';

const STATUS_BADGE = {
  PENDING: 'admin-badge-pending',
  UNDER_REVIEW: 'admin-badge-review',
  RESOLVED: 'admin-badge-resolved',
  DISMISSED: 'admin-badge-dismissed',
};

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

export default function AdminReports() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [reports, setReports] = useState([]);
  // Only the super admin sees this: a municipal admin is scoped server-side
  // and the control would be a lie.
  const [municipalityFilter, setMunicipalityFilter] = useState('');
  const [municipalities, setMunicipalities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [exporting, setExporting] = useState(false);
  // Optional note saved with the decision, so "why" survives the drawer.
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchReports();
  }, [typeFilter, statusFilter, municipalityFilter, page]);

  // The municipality list only exists to populate the super admin's filter.
  useEffect(() => {
    if (!isSuperAdmin) return;
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
  // The report is usually on the pending page already; one that is filtered
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

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const params = { pageSize: 20, page };
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      // Ignored by the API for a municipal admin, who is always scoped to
      // their own municipality regardless of what they send.
      if (isSuperAdmin && municipalityFilter) params.municipalityId = municipalityFilter;

      const res = await axios.get('/reports', { params });
      setReports(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId, newStatus, resolutionNotes) => {
    setProcessing(reportId);
    try {
      const body = { status: newStatus };
      if (resolutionNotes?.trim()) body.resolutionNotes = resolutionNotes.trim();
      await axios.put(`/reports/${reportId}/status`, body);
      toast.success(`Report marked as ${newStatus.replace('_', ' ').toLowerCase()}`);
      if (selected?.id === reportId) {
        setSelected((prev) => ({
          ...prev,
          status: newStatus,
          ...(body.resolutionNotes ? { resolutionNotes: body.resolutionNotes } : {}),
        }));
      }
      setNotes('');
      fetchReports();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setProcessing(null);
    }
  };

  // What was reported: a listing, or the seller behind a store.
  const targetName = (r) => r.product?.name
    || r.reportedSeller?.store?.name
    || r.reportedSeller?.fullName
    || '—';

  const targetLink = (r) => {
    if (r.product?.slug) return `/product/${r.product.slug}`;
    if (r.reportedSeller?.store?.slug) return `/store/${r.reportedSeller.store.slug}`;
    return null;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const rows = await fetchAllPages('/reports', params);
      downloadCsv(`reports-${new Date().toISOString().slice(0, 10)}.csv`, [
        { header: 'Date', value: (r) => csvDate(r.createdAt) },
        { header: 'Type', value: (r) => r.type },
        { header: 'Reason', value: (r) => r.reason },
        { header: 'Status', value: (r) => r.status },
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

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Reports</h1>
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
            {pagination.total > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--t-neutral-500, #64748b)', fontSize: 14, marginLeft: 8 }}>
                ({pagination.total})
              </span>
            )}
          </h2>
          <div className="admin-toolbar">
            <select
              className="admin-select"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Types</option>
              <option value="PRODUCT">Product</option>
              <option value="SELLER">Seller</option>
              <option value="BUYER">Buyer</option>
            </select>
            {isSuperAdmin && (
              <select
                className="admin-select"
                value={municipalityFilter}
                onChange={(e) => { setMunicipalityFilter(e.target.value); setPage(1); }}
                aria-label="Filter by municipality"
              >
                <option value="">All Municipalities</option>
                {municipalities.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            )}
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="PENDING">Pending</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
              <option value="">All Status</option>
            </select>
            <button type="button" className="admin-btn admin-btn-gray" disabled={exporting} onClick={handleExport}>
              <DownloadSimple size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={6} rows={6} />
        ) : reports.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="inbox" size={104} />
            <p>No {statusFilter.toLowerCase().replace('_', ' ')} reports</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Target</th>
                    <th>Reporter</th>
                    <th>Reason</th>
                    <th>Date</th>
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
                        <td><span className="admin-badge admin-badge-pending">{r.type}</span></td>
                        <td>
                          {link
                            ? <Link to={link} className="admin-link" target="_blank">{targetName(r)}</Link>
                            : targetName(r)}
                        </td>
                        <td>
                          <div className="admin-user-cell-name">{r.reporter?.fullName || '—'}</div>
                          <div className="admin-user-cell-email">
                            {[r.reporter?.username ? `@${r.reporter.username}` : null, r.reporter?.municipality?.name]
                              .filter(Boolean).join(' · ') || '—'}
                          </div>
                        </td>
                        <td><span className="admin-report-description">{r.reason}</span></td>
                        <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                          {new Date(r.createdAt).toLocaleDateString('en-PH')}
                        </td>
                        <td>
                          <span className={`admin-badge ${STATUS_BADGE[r.status] || ''}`}>
                            {r.status?.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button className="admin-btn admin-btn-gray" onClick={() => setSelected(r)}>
                              <Eye size={13} /> View
                            </button>
                            {r.status === 'PENDING' && (
                              <button
                                className="admin-btn admin-btn-blue"
                                disabled={processing === r.id}
                                onClick={() => handleUpdateStatus(r.id, 'UNDER_REVIEW')}
                              >
                                Review
                              </button>
                            )}
                            {(r.status === 'PENDING' || r.status === 'UNDER_REVIEW') && (
                              <>
                                <button
                                  className="admin-btn admin-btn-green"
                                  disabled={processing === r.id}
                                  onClick={() => handleUpdateStatus(r.id, 'RESOLVED')}
                                >
                                  Resolve
                                </button>
                                <button
                                  className="admin-btn admin-btn-gray"
                                  disabled={processing === r.id}
                                  onClick={() => handleUpdateStatus(r.id, 'DISMISSED')}
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
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
                <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
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
          const resolver = selected.resolvedBy?.fullName
            || selected.resolvedBy?.username
            || selected.resolvedById;

          return (
            <>
              <div className="admin-detail-header">
                <h3>Report Details</h3>
                <button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
              </div>

              <div className="admin-detail-body">
                <div className="admin-detail-section">
                  <h4>Report Info</h4>
                  <div className="admin-detail-grid">
                    <div><label>Type</label><p>{TYPE_LABEL[selected.type] || selected.type}</p></div>
                    <div>
                      <label>Status</label>
                      <p><span className={`admin-badge ${STATUS_BADGE[selected.status] || ''}`}>{selected.status?.replace('_', ' ')}</span></p>
                    </div>
                    <div>
                      <label>Category</label>
                      <p>{selected.reason || '—'}</p>
                    </div>
                    <div>
                      <label>Submitted</label>
                      <p>{dateTime(selected.createdAt)}</p>
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
                  <h4><MessageSquare size={13} /> Report Content</h4>
                  <div className="admin-detail-grid">
                    <div className="admin-detail-full">
                      <label>Reason</label>
                      <p style={{ fontWeight: 600 }}>{selected.reason}</p>
                    </div>
                    {selected.description && (
                      <div className="admin-detail-full">
                        <label>Description</label>
                        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{selected.description}</p>
                      </div>
                    )}
                  </div>
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

                {(settled || selected.resolutionNotes) && (
                  <div className="admin-detail-section">
                    <h4><CheckCircle size={13} /> Resolution</h4>
                    <div className="admin-detail-grid">
                      <div><label>Decided</label><p>{dateTime(selected.resolvedAt)}</p></div>
                      <div><label>Decided by</label><p>{resolver || '—'}</p></div>
                      <div className="admin-detail-full">
                        <label>Notes</label>
                        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {selected.resolutionNotes || 'No notes were written.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status actions */}
                {(selected.status === 'PENDING' || selected.status === 'UNDER_REVIEW') && (
                  <div className="admin-detail-section">
                    <h4>Update Status</h4>
                    <div className="admin-detail-grid">
                      <div className="admin-detail-full">
                        <label>Resolution notes (optional)</label>
                        <textarea
                          className="admin-input"
                          rows={3}
                          maxLength={1000}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="What you checked and what you decided. The buyer sees this on their report."
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                      {selected.status === 'PENDING' && (
                        <button
                          className="admin-btn admin-btn-blue"
                          disabled={processing === selected.id}
                          onClick={() => handleUpdateStatus(selected.id, 'UNDER_REVIEW', notes)}
                        >
                          Mark Under Review
                        </button>
                      )}
                      <button
                        className="admin-btn admin-btn-green"
                        disabled={processing === selected.id}
                        onClick={() => handleUpdateStatus(selected.id, 'RESOLVED', notes)}
                      >
                        <CheckCircle size={14} /> Mark Resolved
                      </button>
                      <button
                        className="admin-btn admin-btn-gray"
                        disabled={processing === selected.id}
                        onClick={() => handleUpdateStatus(selected.id, 'DISMISSED', notes)}
                      >
                        Dismiss Report
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          );
        }}
      </DetailDrawer>
    </AdminLayout>
  );
}
