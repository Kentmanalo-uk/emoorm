import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Flag, MagnifyingGlass as Search, Eye, X, CheckCircle, ChatText as MessageSquare, DownloadSimple } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import EmptyArt from '../components/ui/EmptyArt';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';

const STATUS_BADGE = {
  PENDING: 'admin-badge-pending',
  UNDER_REVIEW: 'admin-badge-review',
  RESOLVED: 'admin-badge-resolved',
  DISMISSED: 'admin-badge-dismissed',
};

const STATUS_OPTIONS = ['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'];

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetchReports();
  }, [typeFilter, statusFilter, page]);

  const [searchParams] = useSearchParams();
  // Deep link from an admin notification: /admin/reports?id=<reportId>.
  // The report is usually on the pending page already; one that is filtered
  // out is fetched on its own so the link never dead-ends.
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || openedId.current === targetId) return;
    openedId.current = targetId;
    const listed = reports.find((r) => r.id === targetId);
    if (listed) {
      setSelected(listed);
      return;
    }
    axios.get(`/reports/${targetId}`)
      .then((res) => setSelected(res.data))
      .catch(() => toast.error('That report is no longer available'));
  }, [reports, searchParams]);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const params = { pageSize: 20, page };
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await axios.get('/reports', { params });
      setReports(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateStatus = async (reportId, newStatus) => {
    setProcessing(reportId);
    try {
      await axios.put(`/reports/${reportId}/status`, { status: newStatus });
      toast.success(`Report marked as ${newStatus.replace('_', ' ').toLowerCase()}`);
      if (selected?.id === reportId) {
        setSelected((prev) => ({ ...prev, status: newStatus }));
      }
      fetchReports();
    } catch (err) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setProcessing(null);
    }
  };

  const targetName = (r) => r.product?.name || r.store?.name || '—';
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
        { header: 'Target', value: (r) => r.product?.name || r.store?.name || '' },
        { header: 'Description', value: (r) => r.description },
      ], rows);
      toast.success(`Exported ${rows.length} rows`);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const targetLink = (r) => {
    if (r.product?.slug) return `/product/${r.product.slug}`;
    if (r.store?.slug) return `/store/${r.store.slug}`;
    return null;
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Reports</h1>
      </div>

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
            </select>
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
                        <td style={{ fontSize: 13 }}>{r.reporter?.fullName || '—'}</td>
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
      <DetailDrawer item={selected} onClose={() => setSelected(null)}>
        {(selected) => (
          <>
            <div className="admin-detail-header">
              <h3>Report Details</h3>
              <button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div className="admin-detail-body">
              <div className="admin-detail-section">
                <h4>Report Info</h4>
                <div className="admin-detail-grid">
                  <div><label>Type</label><p>{selected.type}</p></div>
                  <div>
                    <label>Status</label>
                    <p><span className={`admin-badge ${STATUS_BADGE[selected.status] || ''}`}>{selected.status?.replace('_', ' ')}</span></p>
                  </div>
                  <div>
                    <label>Target</label>
                    <p>
                      {targetLink(selected)
                        ? <Link to={targetLink(selected)} className="admin-link" target="_blank">{targetName(selected)}</Link>
                        : targetName(selected)}
                    </p>
                  </div>
                  <div>
                    <label>Submitted</label>
                    <p>{new Date(selected.createdAt).toLocaleString('en-PH')}</p>
                  </div>
                </div>
              </div>

              <div className="admin-detail-section">
                <h4>Reporter</h4>
                <div className="admin-detail-grid">
                  <div><label>Name</label><p>{selected.reporter?.fullName || '—'}</p></div>
                  <div><label>Email</label><p>{selected.reporter?.email || '—'}</p></div>
                </div>
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

              {/* Status actions */}
              {(selected.status === 'PENDING' || selected.status === 'UNDER_REVIEW') && (
                <div className="admin-detail-section">
                  <h4>Update Status</h4>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {selected.status === 'PENDING' && (
                      <button
                        className="admin-btn admin-btn-blue"
                        disabled={processing === selected.id}
                        onClick={() => handleUpdateStatus(selected.id, 'UNDER_REVIEW')}
                      >
                        Mark Under Review
                      </button>
                    )}
                    <button
                      className="admin-btn admin-btn-green"
                      disabled={processing === selected.id}
                      onClick={() => handleUpdateStatus(selected.id, 'RESOLVED')}
                    >
                      <CheckCircle size={14} /> Mark Resolved
                    </button>
                    <button
                      className="admin-btn admin-btn-gray"
                      disabled={processing === selected.id}
                      onClick={() => handleUpdateStatus(selected.id, 'DISMISSED')}
                    >
                      Dismiss Report
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </DetailDrawer>
    </AdminLayout>
  );
}
