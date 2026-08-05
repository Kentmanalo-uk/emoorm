import React, { useState, useEffect } from 'react';
import {
  Users, Search, CheckCircle, XCircle, Eye, X,
  Phone, MapPin, Calendar, CreditCard
} from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';

const STATUS_BADGE = {
  PENDING: 'admin-badge-pending',
  APPROVED: 'admin-badge-approved',
  REJECTED: 'admin-badge-rejected',
};

const BACKEND_URL = 'http://localhost:3000';

export default function AdminSellers() {
  const [applicants, setApplicants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null); // detail panel
  const [processing, setProcessing] = useState(null); // id being processed
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  useEffect(() => {
    fetchApplicants();
  }, [statusFilter, search, page]);

  const fetchApplicants = async () => {
    setIsLoading(true);
    try {
      const params = { pageSize: 20, page };
      if (statusFilter) params.sellerApplicationStatus = statusFilter;
      if (search) params.search = search;

      const res = await axios.get('/auth/users', { params });
      // Filter to only users who have applied (have sellerApplicationStatus set)
      const data = (res.data || []).filter((u) => u.sellerApplicationStatus);
      setApplicants(data);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error('Failed to load applications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    if (!window.confirm('Approve this seller application?')) return;
    setProcessing(userId);
    try {
      await axios.post(`/auth/users/${userId}/approve-seller`);
      toast.success('Seller approved!');
      setSelected(null);
      fetchApplicants();
    } catch (err) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (userId) => {
    const reason = (rejectReason || '').trim();
    if (!reason) {
      setShowRejectInput(true);
      toast.error('Please provide a reason for rejection');
      return;
    }
    if (!window.confirm('Reject this seller application? The applicant will be notified.')) return;
    setProcessing(userId);
    try {
      await axios.post(`/auth/users/${userId}/reject-seller`, { reason });
      toast.success('Application rejected');
      setSelected(null);
      setShowRejectInput(false);
      setRejectReason('');
      fetchApplicants();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to reject');
    } finally {
      setProcessing(null);
    }
  };

  const imgUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return `${BACKEND_URL}${path}`;
  };

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Seller Applications</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Applications</h2>
          <div className="admin-toolbar">
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                className="admin-search-input"
                style={{ paddingLeft: 30 }}
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="">All</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={7} rows={6} />
        ) : applicants.length === 0 ? (
          <div className="admin-empty">
            <Users size={36} />
            <p>No {statusFilter.toLowerCase()} applications</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Shop Name</th>
                    <th>Location</th>
                    <th>ID Type</th>
                    <th>Applied</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-avatar">{u.fullName?.[0] || '?'}</div>
                          <div>
                            <p className="admin-user-cell-name">{u.fullName}</p>
                            <p className="admin-user-cell-email">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>{u.shopName || <span style={{ color: '#94a3b8' }}>—</span>}</td>
                      <td>{u.municipality?.name || '—'}</td>
                      <td>{u.idType || '—'}</td>
                      <td>
                        {u.sellerApplicationDate
                          ? new Date(u.sellerApplicationDate).toLocaleDateString('en-PH')
                          : '—'}
                      </td>
                      <td>
                        <span className={`admin-badge ${STATUS_BADGE[u.sellerApplicationStatus] || ''}`}>
                          {u.sellerApplicationStatus}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="admin-btn admin-btn-gray"
                            onClick={() => { setSelected(u); setShowRejectInput(false); setRejectReason(''); }}
                          >
                            <Eye size={13} /> View
                          </button>
                          {u.sellerApplicationStatus === 'PENDING' && (
                            <>
                              <button
                                className="admin-btn admin-btn-green"
                                disabled={processing === u.id}
                                onClick={() => handleApprove(u.id)}
                              >
                                <CheckCircle size={13} /> Approve
                              </button>
                              <button
                                className="admin-btn admin-btn-red"
                                disabled={processing === u.id}
                                onClick={() => { setSelected(u); setShowRejectInput(true); setRejectReason(''); }}
                              >
                                <XCircle size={13} /> Reject
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="admin-pagination">
                <button className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages} ({pagination.total} total)</span>
                <button className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="admin-detail-overlay" onClick={() => setSelected(null)}>
          <div className="admin-detail-panel" onClick={(e) => e.stopPropagation()}>
            <div className="admin-detail-header">
              <h3>Application Details</h3>
              <button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
            </div>

            <div className="admin-detail-body">
              {/* Applicant info */}
              <div className="admin-detail-section">
                <h4>Personal Information</h4>
                <div className="admin-detail-grid">
                  <div><label>Full Name</label><p>{selected.fullName}</p></div>
                  <div><label>Email</label><p>{selected.email}</p></div>
                  <div><label><Phone size={12} /> Contact</label><p>{selected.contactNumber || '—'}</p></div>
                  <div><label><MapPin size={12} /> Municipality</label><p>{selected.municipality?.name || '—'}</p></div>
                </div>
              </div>

              {/* Shop info */}
              <div className="admin-detail-section">
                <h4>Shop Information</h4>
                <div className="admin-detail-grid">
                  <div><label>Shop Name</label><p>{selected.shopName || '—'}</p></div>
                  <div><label>Shop Address</label><p>{selected.shopAddress || '—'}</p></div>
                  <div className="admin-detail-full">
                    <label>Description</label>
                    <p>{selected.shopDescription || '—'}</p>
                  </div>
                </div>
              </div>

              {/* ID Verification */}
              <div className="admin-detail-section">
                <h4><CreditCard size={14} /> ID Verification — {selected.idType || 'N/A'}</h4>
                <div className="admin-id-photos">
                  {[
                    { label: 'Front', url: imgUrl(selected.idFrontUrl) },
                    { label: 'Back', url: imgUrl(selected.idBackUrl) },
                    { label: 'Selfie with ID', url: imgUrl(selected.selfieUrl) },
                  ].map(({ label, url }) => (
                    <div key={label} className="admin-id-photo">
                      <span className="admin-id-label">{label}</span>
                      {url
                        ? <a href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={label} />
                        </a>
                        : <div className="admin-id-missing">No photo</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {selected.sellerApplicationStatus === 'PENDING' && (
              <div className="admin-detail-footer" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
                {showRejectInput && (
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (visible to the applicant)…"
                    rows={3}
                    className="admin-input"
                    autoFocus
                  />
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    className="admin-btn admin-btn-green"
                    disabled={processing === selected.id}
                    onClick={() => handleApprove(selected.id)}
                  >
                    <CheckCircle size={15} /> Approve Seller
                  </button>
                  {!showRejectInput ? (
                    <button
                      className="admin-btn admin-btn-red"
                      disabled={processing === selected.id}
                      onClick={() => setShowRejectInput(true)}
                    >
                      <XCircle size={15} /> Reject…
                    </button>
                  ) : (
                    <button
                      className="admin-btn admin-btn-red"
                      disabled={processing === selected.id || !rejectReason.trim()}
                      onClick={() => handleReject(selected.id)}
                    >
                      <XCircle size={15} /> Confirm Rejection
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
