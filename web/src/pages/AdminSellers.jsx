import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MagnifyingGlass as Search, CheckCircle, XCircle, Eye, X, Phone, MapPin, Calendar, CreditCard, Warning } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import MessageUserButton from '../components/admin/MessageUserButton';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';
import EmptyArt from '../components/ui/EmptyArt';

const STATUS_BADGE = {
  PENDING: 'admin-badge-pending',
  APPROVED: 'admin-badge-approved',
  REJECTED: 'admin-badge-rejected',
};

// Fetches a KYC document (ID front/back, selfie) through the authenticated
// endpoint and renders it as an object URL. These files are no longer public
// under /uploads, so a plain <img src> can't reach them — the request must
// carry the admin's Bearer token, which only axios (not <img>) can attach.
function KycPhoto({ userId, field, label }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setStatus('loading');
    setImgSrc(null);

    axios.get(`/auth/users/${userId}/kyc-photo/${field}`, { responseType: 'blob' })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImgSrc(objectUrl);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, field]);

  if (status === 'loading') return <div className="admin-id-missing">Loading…</div>;
  if (status === 'error' || !imgSrc) return <div className="admin-id-missing">No photo</div>;

  return (
    <a href={imgSrc} target="_blank" rel="noopener noreferrer">
      <img src={imgSrc} alt={label} />
    </a>
  );
}

export default function AdminSellers() {
  const [applicants, setApplicants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null); // detail panel
  // The OCR identity result for the open applicant (from the user detail).
  const [identity, setIdentity] = useState(null);
  useEffect(() => {
    if (!selected?.id) { setIdentity(null); return undefined; }
    let cancelled = false;
    setIdentity(null);
    axios.get(`/auth/users/${selected.id}`)
      .then((res) => { if (!cancelled) setIdentity(res.data?.identity || { status: 'NOT_VERIFIED' }); })
      .catch(() => { if (!cancelled) setIdentity({ status: 'UNKNOWN' }); });
    return () => { cancelled = true; };
  }, [selected?.id]);
  const [processing, setProcessing] = useState(null); // id being processed
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const { municipalities: municipalityList } = useMunicipalities();
  const { categories: categoryList } = useCategories();

  // Applications store the shop's municipality and categories as IDs.
  const lookups = useMemo(() => {
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x.name]));
    return { municipalities: byId(municipalityList), categories: byId(categoryList) };
  }, [municipalityList, categoryList]);

  useEffect(() => {
    fetchApplicants();
  }, [statusFilter, search, page]);

  // Deep link from the "new seller application" notification:
  // /admin/sellers?id=<userId> opens that application.
  const [searchParams] = useSearchParams();
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || applicants.length === 0 || openedId.current === targetId) return;
    openedId.current = targetId;
    const match = applicants.find((u) => u.id === targetId);
    if (match) setSelected(match);
  }, [applicants, searchParams]);

  const shopMunicipality = (u) =>
    lookups.municipalities[u.shopMunicipalityId] || u.municipality?.name || '—';

  const fetchApplicants = async () => {
    setIsLoading(true);
    setSelectedIds([]);
    try {
      // No role filter: applicants stay BUYER until they are approved, so
      // filtering by SELLER would hide every pending application.
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
    if (!window.confirm('Approve this seller application? Their shop will be created and go live.')) return;
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
    if (!window.confirm('Reject this seller application? The applicant will be notified and can fix it and re-apply.')) return;
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

  const pendingApplicants = applicants.filter((u) => u.sellerApplicationStatus === 'PENDING');
  const allPendingSelected = pendingApplicants.length > 0 && pendingApplicants.every((u) => selectedIds.includes(u.id));
  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleSelectAll = () => setSelectedIds(allPendingSelected ? [] : pendingApplicants.map((u) => u.id));

  const handleBulkApprove = async () => {
    const ids = selectedIds.filter((id) => pendingApplicants.some((u) => u.id === id));
    setBulkProcessing(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => axios.post(`/auth/users/${id}/approve-seller`)));
      const done = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - done;
      const msg = `Approve: ${done} done, ${failed} failed`;
      if (failed) toast.error(msg); else toast.success(msg);
      setSelectedIds([]);
      setBulkConfirmOpen(false);
      fetchApplicants();
    } finally {
      setBulkProcessing(false);
    }
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
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--t-neutral-400, #94a3b8)' }} />
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
            <EmptyArt name="stores" size={104} />
            <p>No {statusFilter.toLowerCase()} applications</p>
          </div>
        ) : (
          <>
            {selectedIds.length > 0 && (
              <div className="admin-bulk-bar">
                <span>{selectedIds.length} selected</span>
                <button
                  type="button"
                  className="admin-btn admin-btn-green"
                  disabled={bulkProcessing}
                  onClick={() => setBulkConfirmOpen(true)}
                >
                  <CheckCircle size={13} /> Approve selected
                </button>
                <button type="button" className="admin-btn admin-btn-gray" disabled={bulkProcessing} onClick={() => setSelectedIds([])}>
                  Clear
                </button>
              </div>
            )}
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-check-col">
                      {pendingApplicants.length > 0 && (
                        <input type="checkbox" aria-label="Select all pending on this page" checked={allPendingSelected} onChange={toggleSelectAll} />
                      )}
                    </th>
                    <th>Applicant</th>
                    <th>Shop Name</th>
                    <th>Shop Location</th>
                    <th>ID Type</th>
                    <th>Applied</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.map((u) => (
                    <tr
                      key={u.id}
                      className="admin-row-clickable"
                      tabIndex={0}
                      onClick={rowOpen(() => { setSelected(u); setShowRejectInput(false); setRejectReason(''); })}
                      onKeyDown={rowKeyOpen(() => { setSelected(u); setShowRejectInput(false); setRejectReason(''); })}
                    >
                      <td className="admin-check-col">
                        {u.sellerApplicationStatus === 'PENDING' && (
                          <input
                            type="checkbox"
                            aria-label={`Select ${u.fullName}`}
                            checked={selectedIds.includes(u.id)}
                            onChange={() => toggleSelect(u.id)}
                          />
                        )}
                      </td>
                      <td>
                        <div className="admin-user-cell">
                          <div className="admin-avatar">{u.fullName?.[0] || '?'}</div>
                          <div>
                            <p className="admin-user-cell-name">{u.fullName}</p>
                            <p className="admin-user-cell-email">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>{u.shopName || <span style={{ color: 'var(--t-neutral-400, #94a3b8)' }}>—</span>}</td>
                      <td>{shopMunicipality(u)}</td>
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
      <DetailDrawer item={selected} onClose={() => setSelected(null)}>
        {(selected) => (
          <>
            <div className="admin-detail-header">
              <h3>Application Details</h3>
              <div className="admin-detail-head-actions">
                <MessageUserButton userId={selected.id} role={selected.role} />
                <button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
              </div>
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

              {/* Previous verdict */}
              {selected.sellerRejectionReason && (
                <div className="admin-detail-section">
                  <h4>Previous Rejection</h4>
                  <p className="admin-detail-note">{selected.sellerRejectionReason}</p>
                </div>
              )}

              {/* Shop info */}
              <div className="admin-detail-section">
                <h4>Shop Information</h4>
                <div className="admin-detail-grid">
                  <div><label>Shop Name</label><p>{selected.shopName || '—'}</p></div>
                  <div><label>Shop Municipality</label><p>{shopMunicipality(selected)}</p></div>
                  <div className="admin-detail-full"><label>Shop Address</label><p>{selected.shopAddress || '—'}</p></div>
                  <div className="admin-detail-full"><label>Tagline</label><p>{selected.shopTagline || '—'}</p></div>
                  <div className="admin-detail-full">
                    <label>Categories</label>
                    <p>
                      {Array.isArray(selected.shopCategories) && selected.shopCategories.length > 0
                        ? selected.shopCategories.map((id) => lookups.categories[id] || id).join(', ')
                        : '—'}
                    </p>
                  </div>
                  <div className="admin-detail-full">
                    <label>Description</label>
                    <p>{selected.shopDescription || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Business, payout and fulfillment */}
              <div className="admin-detail-section">
                <h4>Business &amp; Payments</h4>
                <div className="admin-detail-grid">
                  <div>
                    <label>Seller Type</label>
                    <p>{selected.sellerBusinessType === 'REGISTERED' ? 'Registered business' : 'Individual seller'}</p>
                  </div>
                  <div><label>Permit / Registration No.</label><p>{selected.sellerPermitNumber || '—'}</p></div>
                  <div><label>BIR TIN</label><p>{selected.sellerBirTin || '—'}</p></div>
                  <div><label>Payout Method</label><p>{selected.payoutMethod || '—'}</p></div>
                  <div><label>Payout Account</label>
                    <p>{[selected.payoutAccountName, selected.payoutAccountNumber].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div><label>Fulfillment</label><p>{selected.fulfillmentPreference || '—'}</p></div>
                  <div className="admin-detail-full">
                    <label>Terms Accepted</label>
                    <p>
                      {selected.sellerTermsAcceptedAt
                        ? `v${selected.sellerTermsVersion} on ${new Date(selected.sellerTermsAcceptedAt).toLocaleString('en-PH')}`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* ID Verification */}
              <div className="admin-detail-section">
                <h4><CreditCard size={14} /> ID Verification</h4>
                {identity === null ? (
                  <p className="admin-id-check">Checking identity…</p>
                ) : identity.status === 'VERIFIED' ? (
                  <p className="admin-id-check is-verified">
                    <CheckCircle size={16} weight="fill" />
                    <span>
                      <strong>ID verified automatically</strong>
                      {' '}— the scanned ID matched this account's name and address
                      {identity.idType && identity.idType !== 'IN_PERSON' ? ` (${identity.idType.replace(/_/g, ' ')})` : ''}
                      {identity.idType === 'IN_PERSON' ? ' (verified in person by an admin)' : ''}
                      {identity.verifiedAt ? `, ${new Date(identity.verifiedAt).toLocaleDateString('en-PH')}` : ''}.
                    </span>
                  </p>
                ) : (
                  <p className="admin-id-check is-missing">
                    <Warning size={16} weight="fill" />
                    <span>
                      <strong>ID not verified yet.</strong>
                      {' '}Sellers verify their ID from their Seller Center after applying; you'll get a notification when they do.
                      {selected.idType ? ` Submitted with the application: ${selected.idType}.` : ''}
                    </span>
                  </p>
                )}
                <div className="admin-id-photos">
                  {[
                    { label: 'Front', field: 'idFront', has: selected.idFrontUrl },
                    { label: 'Back', field: 'idBack', has: selected.idBackUrl },
                    // Legacy applications also captured a selfie; newer ones don't.
                    { label: 'Selfie with ID', field: 'selfie', has: selected.selfieUrl },
                    { label: 'Permit', field: 'permit', has: selected.sellerPermitUrl },
                  ].filter(({ has }) => has).map(({ label, field }) => (
                    <div key={label} className="admin-id-photo">
                      <span className="admin-id-label">{label}</span>
                      <KycPhoto userId={selected.id} field={field} label={label} />
                    </div>
                  ))}
                  {identity?.status === 'VERIFIED' && !selected.idFrontUrl && !selected.idBackUrl && !selected.selfieUrl && (
                    <div className="admin-id-missing">
                      No documents on file — the applicant's identity was verified separately,
                      or the photos have passed their retention period.
                    </div>
                  )}
                </div>
              </div>

              {/* Audit trail */}
              {Array.isArray(selected.sellerApplicationHistory) && selected.sellerApplicationHistory.length > 0 && (
                <div className="admin-detail-section">
                  <h4><Calendar size={14} /> Application History</h4>
                  <ul className="admin-detail-timeline">
                    {[...selected.sellerApplicationHistory].reverse().map((entry, i) => (
                      <li key={`${entry.at}-${i}`}>
                        <strong>{entry.action}</strong>
                        <span>{new Date(entry.at).toLocaleString('en-PH')}</span>
                        {entry.byName && <span>by {entry.byName}</span>}
                        {entry.reason && <p>{entry.reason}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
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
          </>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={bulkConfirmOpen}
        title={`Approve ${selectedIds.length} seller application(s)?`}
        message="Each applicant becomes a seller, their shop is created and goes live, and they are notified."
        confirmLabel="Approve selected"
        loading={bulkProcessing}
        onConfirm={handleBulkApprove}
        onCancel={() => setBulkConfirmOpen(false)}
      />
    </AdminLayout>
  );
}
