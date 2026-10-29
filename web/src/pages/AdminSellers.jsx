import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle, XCircle, Eye, X, MapPin, Calendar, CreditCard, Printer,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import MessageUserButton from '../components/admin/MessageUserButton';
import ReasonDialog from '../components/admin/ReasonDialog';
import IdentityCheck, { IdBadge } from '../components/admin/IdentityCheck';
import { AdminDate, AdminPager, AdminSearch } from '../components/admin/AdminBits';
import { idStatus, shortDate, shortDateTime } from '../components/admin/adminFormat';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import UserContactReveal from '../components/admin/UserContactReveal';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import { useMunicipalities, useCategories } from '../hooks/useReferenceData';
import { useRefreshAdminShell } from '../hooks/useAdminShellData';
import useAuthStore from '../store/authStore';
import EmptyArt from '../components/ui/EmptyArt';
import { confirmAction } from '../lib/confirm';
import { words } from '../lib/labels';
import resolveImg from '../lib/media';

const PAYOUT_LABELS = { GCASH: 'GCash', QRPH: 'QR Ph', MAYA: 'Maya', BANK: 'Bank', COD_ONLY: 'Cash on delivery' };
const FULFILLMENT_LABELS = { DELIVERY: 'Delivers', PICKUP: 'Pickup only', BOTH: 'Delivery and pickup' };

// Bulk decisions go three at a time: each one is a dozen queries and a new
// shop on a database with a handful of connections, so twenty at once could
// time out (and stall every other admin's pages meanwhile).
const settleInBatches = async (items, run, size = 3) => {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.allSettled(items.slice(i, i + size).map(run)));
  }
  return results;
};

const STATUS = {
  PENDING: { label: 'Waiting', badge: 'admin-badge-pending' },
  APPROVED: { label: 'Approved', badge: 'admin-badge-approved' },
  REJECTED: { label: 'Rejected', badge: 'admin-badge-rejected' },
};
const TABS = [
  { key: 'PENDING', label: 'Waiting' },
  { key: 'APPROVED', label: 'Approved' },
  { key: 'REJECTED', label: 'Rejected' },
  { key: '', label: 'All' },
];

const verified = (u) => idStatus(u?.identityVerification).key === 'VERIFIED';

// Fetches a KYC document (ID front/back, selfie) through the authenticated
// endpoint and renders it as an object URL. These files are no longer public
// under /uploads, so a plain <img src> can't reach them — the request must
// carry the admin's Bearer token, which only axios (not <img>) can attach.
function KycPhoto({ userId, field, label }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  // Loaded only when the admin taps View: every view is logged.
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    if (!wanted) return undefined;
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
  }, [userId, field, wanted]);

  if (status === 'idle') {
    return (
      <button type="button" className="admin-btn admin-btn-gray admin-id-view" onClick={() => setWanted(true)}>
        <Eye size={14} /> View
      </button>
    );
  }
  if (status === 'loading') return <div className="admin-id-missing">Loading…</div>;
  if (status === 'error' || !imgSrc) return <div className="admin-id-missing">No photo</div>;

  return (
    <a href={imgSrc} target="_blank" rel="noopener noreferrer">
      <img src={imgSrc} alt={label} />
    </a>
  );
}

/**
 * The application on paper, for the municipal office's file: the applicant,
 * the shop, the ID check and the decision, with lines to sign. Printed on its
 * own (everything else on the page is hidden while it prints).
 */
function ApplicationSlip({ applicant, identity, town, categories, onDone }) {
  useEffect(() => {
    document.body.classList.add('is-printing-slip');
    const done = () => onDone();
    window.addEventListener('afterprint', done);
    // Let the slip render before the print dialog opens.
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('is-printing-slip');
    };
  }, [onDone]);

  const status = STATUS[applicant.sellerApplicationStatus]?.label || words(applicant.sellerApplicationStatus);
  const rows = [
    ['Applicant', applicant.fullName],
    ['Lives in', applicant.municipality?.name || '—'],
    ['Shop name', applicant.shopName || '—'],
    ['Shop location', [applicant.shopAddress, town].filter(Boolean).join(', ') || '—'],
    ['Categories', categories || '—'],
    ['Seller type', applicant.sellerBusinessType === 'REGISTERED' ? 'Registered business' : 'Individual seller'],
    ['Permit / registration no.', applicant.sellerPermitNumber || '—'],
    ['ID check', `${idStatus(identity).label}${identity?.verifiedAt ? `, ${shortDate(identity.verifiedAt)}` : ''}`],
    ['Applied', shortDateTime(applicant.sellerApplicationDate) || '—'],
    ['Status', `${status}${applicant.sellerReviewedAt ? `, ${shortDate(applicant.sellerReviewedAt)}` : ''}`],
    ...(applicant.sellerRejectionReason ? [['Reason given', applicant.sellerRejectionReason]] : []),
  ];

  return createPortal(
    <div className="admin-slip-print">
      <h1>Seller application</h1>
      <p>E-MOORM · Municipality of {town || '—'} · printed {shortDateTime(new Date())}</p>
      <table>
        <tbody>
          {rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
        </tbody>
      </table>
      <div className="admin-slip-sign">
        <span>Checked by (name and signature)</span>
        <span>Date</span>
      </div>
    </div>,
    document.body,
  );
}

export default function AdminSellers() {
  const actorId = useAuthStore((st) => st.user?.id);
  const [applicants, setApplicants] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [counts, setCounts] = useState({});
  const [selected, setSelected] = useState(null); // detail panel
  // The identity result for the open applicant (from the user detail).
  const [identity, setIdentity] = useState(null);
  const [identityKey, setIdentityKey] = useState(0);
  useEffect(() => {
    if (!selected?.id) { setIdentity(null); return undefined; }
    let cancelled = false;
    setIdentity(null);
    axios.get(`/auth/users/${selected.id}`, { quiet: true })
      .then((res) => { if (!cancelled) setIdentity(res.data?.identity || { status: 'NOT_VERIFIED' }); })
      .catch(() => { if (!cancelled) setIdentity({ status: 'UNKNOWN' }); });
    return () => { cancelled = true; };
  }, [selected?.id, identityKey]);
  const [processing, setProcessing] = useState(null); // id being processed
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const { municipalities: municipalityList } = useMunicipalities();
  const { categories: categoryList } = useCategories();
  // A decision changes the waiting count beside Seller Applications.
  const refreshShell = useRefreshAdminShell();

  // Applications store the shop's municipality and categories as IDs.
  const lookups = useMemo(() => {
    const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x.name]));
    return { municipalities: byId(municipalityList), categories: byId(categoryList) };
  }, [municipalityList, categoryList]);

  // Typing waits for a pause (300 ms) before asking, so a name is one request
  // rather than one per letter; a filter or page change asks at once.
  const lastSearch = useRef(search);
  useEffect(() => {
    const typed = search !== lastSearch.current;
    lastSearch.current = search;
    if (!typed) {
      fetchApplicants();
      return undefined;
    }
    const timer = setTimeout(fetchApplicants, 300);
    return () => clearTimeout(timer);
  }, [statusFilter, search, page]);

  // How many applications each status holds (the tabs' numbers).
  const fetchCounts = () => {
    Promise.all(['PENDING', 'APPROVED', 'REJECTED'].map((status) => axios
      .get('/auth/users', { params: { sellerApplicationStatus: status, pageSize: 1 }, quiet: true })
      .then((res) => [status, res.pagination?.total ?? 0])
      .catch(() => [status, null])))
      .then((pairs) => setCounts(Object.fromEntries(pairs)));
  };
  useEffect(() => { fetchCounts(); }, []);

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

  // Only the newest request fills the table: one overtaken by a later search,
  // filter or page (and answering late) is dropped.
  const latestRequest = useRef(0);
  const fetchApplicants = async () => {
    const request = ++latestRequest.current;
    setIsLoading(true);
    setSelectedIds([]);
    try {
      // No role filter: applicants stay BUYER until they are approved, so
      // filtering by SELLER would hide every pending application.
      const params = { pageSize: 20, page };
      if (statusFilter) params.sellerApplicationStatus = statusFilter;
      if (search) params.search = search;

      const res = await axios.get('/auth/users', { params, quiet: true });
      if (request !== latestRequest.current) return;
      // Filter to only users who have applied (have sellerApplicationStatus set)
      const data = (res.data || []).filter((u) => u.sellerApplicationStatus);
      setApplicants(data);
      setLoadError(false);
      if (res.pagination) setPagination(res.pagination);
    } catch {
      if (request === latestRequest.current) setLoadError(true);
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  };

  const decided = () => {
    fetchApplicants();
    fetchCounts();
    refreshShell('attention');
  };

  const openApplication = (u, { reject = false } = {}) => {
    setSelected(u);
    setShowRejectInput(reject);
    setRejectReason('');
  };

  const handleApprove = async (u, { fromRow = false } = {}) => {
    // From a row, an applicant without a verified ID opens their application
    // first, so the admin sees the ID section before deciding.
    if (fromRow && !verified(u)) {
      openApplication(u);
      toast('Their ID is not verified yet: check the application first.');
      return;
    }
    const idOk = selected?.id === u.id ? idStatus(identity).key === 'VERIFIED' : verified(u);
    if (!(await confirmAction({
      title: `Approve ${u.shopName || u.fullName}?`,
      message: idOk
        ? 'Their shop is created and goes live, and they are told.'
        : 'Their ID is not verified. Their shop is created and goes live, and they are told; buyers see no ID badge until they verify.',
      confirmLabel: 'Approve',
      danger: !idOk,
    }))) return;
    setProcessing(u.id);
    try {
      await axios.post(`/auth/users/${u.id}/approve-seller`);
      toast.success('Seller approved!');
      setSelected(null);
      decided();
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
    if (!(await confirmAction({ title: 'Reject this seller application?', message: 'The applicant will be notified and can fix it and re-apply.', confirmLabel: 'Reject', danger: true }))) return;
    setProcessing(userId);
    try {
      await axios.post(`/auth/users/${userId}/reject-seller`, { reason });
      toast.success('Application rejected');
      setSelected(null);
      setShowRejectInput(false);
      setRejectReason('');
      decided();
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
  const chosen = pendingApplicants.filter((u) => selectedIds.includes(u.id));
  const unverifiedChosen = chosen.filter((u) => !verified(u)).length;

  const runBulk = async (label, request) => {
    setBulkProcessing(true);
    try {
      const results = await settleInBatches(chosen.map((u) => u.id), request);
      const done = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - done;
      const msg = `${label}: ${done} done${failed ? `, ${failed} failed` : ''}`;
      if (failed) toast.error(msg); else toast.success(msg);
      setSelectedIds([]);
      setBulkConfirmOpen(false);
      setBulkRejectOpen(false);
      decided();
    } finally {
      setBulkProcessing(false);
    }
  };
  const handleBulkApprove = () => runBulk('Approved', (id) => axios.post(`/auth/users/${id}/approve-seller`));
  const handleBulkReject = (reason) => runBulk('Rejected', (id) => axios.post(`/auth/users/${id}/reject-seller`, { reason }));

  const setTab = (key) => { setStatusFilter(key); setPage(1); };
  const showStatus = !statusFilter;
  const otherTabs = TABS.filter((t) => t.key && t.key !== statusFilter && counts[t.key]);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Seller applications</h1>
          <p className="admin-page-sub">People asking to open a shop in your area. Check their ID before approving.</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-status-tabs" role="tablist" aria-label="Applications by status">
            {TABS.map((t) => (
              <button
                key={t.key || 'all'}
                type="button"
                role="tab"
                aria-selected={statusFilter === t.key}
                className={`admin-status-tab${statusFilter === t.key ? ' is-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
                {t.key && counts[t.key] != null && <b>{counts[t.key]}</b>}
              </button>
            ))}
          </div>
          <div className="admin-toolbar">
            <AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name or email…" />
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={7} rows={6} />
        ) : loadError ? (
          <LoadFailed onRetry={fetchApplicants} what="the applications" compact />
        ) : applicants.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="stores" size={104} />
            <p>
              {search
                ? 'No applications match that search.'
                : statusFilter === 'PENDING'
                  ? 'No applications waiting. New ones show here, and you get a notification.'
                  : `No ${(STATUS[statusFilter]?.label || '').toLowerCase()} applications.`}
            </p>
            {!search && otherTabs.length > 0 && (
              <div className="admin-empty-actions">
                {otherTabs.map((t) => (
                  <button key={t.key} type="button" className="admin-btn admin-btn-gray" onClick={() => setTab(t.key)}>
                    See {t.label.toLowerCase()} ({counts[t.key]})
                  </button>
                ))}
              </div>
            )}
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
                <button
                  type="button"
                  className="admin-btn admin-btn-red"
                  disabled={bulkProcessing}
                  onClick={() => setBulkRejectOpen(true)}
                >
                  <XCircle size={13} /> Reject selected…
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
                        <input type="checkbox" aria-label="Select all waiting on this page" checked={allPendingSelected} onChange={toggleSelectAll} />
                      )}
                    </th>
                    <th>Applicant</th>
                    <th>Shop Name</th>
                    <th>Shop Location</th>
                    <th>ID check</th>
                    <th>Applied</th>
                    {showStatus && <th>Status</th>}
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {applicants.map((u) => (
                    <tr
                      key={u.id}
                      className="admin-row-clickable"
                      tabIndex={0}
                      onClick={rowOpen(() => openApplication(u))}
                      onKeyDown={rowKeyOpen(() => openApplication(u))}
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
                      <td>{u.shopName || '—'}</td>
                      <td>{shopMunicipality(u)}</td>
                      <td><IdBadge record={u.identityVerification} /></td>
                      <td><AdminDate value={u.sellerApplicationDate} /></td>
                      {showStatus && (
                        <td>
                          <span className={`admin-badge ${STATUS[u.sellerApplicationStatus]?.badge || ''}`}>
                            {STATUS[u.sellerApplicationStatus]?.label || words(u.sellerApplicationStatus)}
                          </span>
                        </td>
                      )}
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" className="admin-btn admin-btn-gray" onClick={() => openApplication(u)}>
                            <Eye size={13} /> View
                          </button>
                          {u.sellerApplicationStatus === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                className="admin-btn admin-btn-green"
                                disabled={processing === u.id}
                                onClick={() => handleApprove(u, { fromRow: true })}
                                title={verified(u) ? undefined : 'ID not verified: opens the application first'}
                              >
                                <CheckCircle size={13} /> Approve
                              </button>
                              <button
                                type="button"
                                className="admin-btn admin-btn-red"
                                disabled={processing === u.id}
                                onClick={() => openApplication(u, { reject: true })}
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

            <AdminPager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} />
          </>
        )}
      </div>

      {/* Detail panel */}
      <DetailDrawer item={selected} onClose={() => setSelected(null)}>
        {(selected) => (
          <>
            <div className="admin-detail-header">
              <h3>{selected.shopName || 'Application'}</h3>
              <div className="admin-detail-head-actions">
                <button type="button" className="admin-btn admin-btn-gray" onClick={() => setPrinting(true)} title="A one-page summary for the office's paper file">
                  <Printer size={14} /> Print
                </button>
                <MessageUserButton userId={selected.id} role={selected.role} />
                <button type="button" className="admin-detail-close" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button>
              </div>
            </div>

            <div className="admin-detail-body">
              {/* Applicant info */}
              <div className="admin-detail-section">
                <h4>Personal Information</h4>
                <div className="admin-detail-grid">
                  <div><label>Full Name</label><p>{selected.fullName}</p></div>
                  <div><label><MapPin size={12} /> Municipality</label><p>{selected.municipality?.name || '—'}</p></div>
                  <UserContactReveal user={selected} />
                </div>
              </div>

              {/* ID: where it stands, and the in-person check */}
              <div className="admin-detail-section">
                <h4><CreditCard size={14} /> ID check</h4>
                <IdentityCheck
                  userId={selected.id}
                  identity={identity}
                  canReview={selected.id !== actorId && !['MUNICIPAL_ADMIN', 'SUPER_ADMIN'].includes(selected.role)}
                  onChange={() => { setIdentityKey((k) => k + 1); fetchApplicants(); }}
                />
                {selected.idType && idStatus(identity).key !== 'VERIFIED' && (
                  <p className="admin-detail-hint">Submitted with the application: {words(selected.idType)}.</p>
                )}
                {selected.sellerApplicationStatus !== 'PENDING' && (
                  <div className="admin-id-missing">
                    ID documents are only shown while an application is under review. They are removed after the decision.
                  </div>
                )}
                <div className="admin-id-photos">
                  {selected.sellerApplicationStatus === 'PENDING' && [
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
                        ? selected.shopCategories.map((id) => lookups.categories[id] || 'Removed category').join(', ')
                        : '—'}
                    </p>
                  </div>
                  <div className="admin-detail-full">
                    <label>Description</label>
                    <p>{selected.shopDescription || '—'}</p>
                  </div>
                  {(selected.shopLogoUrl || selected.shopCoverUrl) && (
                    <div className="admin-detail-full">
                      <label>Logo and Cover Photo</label>
                      <div className="admin-shop-pics">
                        {selected.shopLogoUrl && <img className="admin-shop-pic-logo" src={resolveImg(selected.shopLogoUrl)} alt="Shop logo" />}
                        {selected.shopCoverUrl && <img className="admin-shop-pic-cover" src={resolveImg(selected.shopCoverUrl)} alt="Shop cover" />}
                      </div>
                    </div>
                  )}
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
                  <div>
                    <label>Payment Methods</label>
                    <p>
                      {(Array.isArray(selected.payoutMethods) && selected.payoutMethods.length
                        ? selected.payoutMethods
                        : [selected.payoutMethod].filter(Boolean)
                      ).map((m) => PAYOUT_LABELS[m] || words(m)).join(', ') || '—'}
                    </p>
                  </div>
                  <div><label>Payout Account</label>
                    <p>{[selected.payoutAccountName, selected.payoutAccountNumber].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <div><label>Delivery</label><p>{FULFILLMENT_LABELS[selected.fulfillmentPreference] || words(selected.fulfillmentPreference) || '—'}</p></div>
                  {selected.payoutQrUrl && (
                    <div>
                      <label>{PAYOUT_LABELS[selected.payoutQrType] || 'Payment'} QR</label>
                      <img className="admin-shop-pic-qr" src={resolveImg(selected.payoutQrUrl)} alt="Payment QR code" />
                    </div>
                  )}
                  <div className="admin-detail-full">
                    <label>Terms Accepted</label>
                    <p>
                      {selected.sellerTermsAcceptedAt
                        ? `Version ${selected.sellerTermsVersion}, ${shortDateTime(selected.sellerTermsAcceptedAt)}`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Audit trail */}
              {Array.isArray(selected.sellerApplicationHistory) && selected.sellerApplicationHistory.length > 0 && (
                <div className="admin-detail-section">
                  <h4><Calendar size={14} /> Application History</h4>
                  <ul className="admin-detail-timeline">
                    {[...selected.sellerApplicationHistory].reverse().map((entry, i) => (
                      <li key={`${entry.at}-${i}`}>
                        <strong>{words(entry.action)}</strong>
                        <span>{shortDateTime(entry.at)}</span>
                        {entry.byName && <span>by {entry.byName}</span>}
                        {entry.reason && <p>{entry.reason}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {selected.sellerApplicationStatus === 'PENDING' && (
              <div className="admin-detail-footer is-decision">
                {showRejectInput && (
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (visible to the applicant)…"
                    aria-label="Reason for rejection"
                    rows={3}
                    className="admin-input"
                    autoFocus
                  />
                )}
                <div className="admin-detail-footer-buttons">
                  <button
                    type="button"
                    className="admin-btn admin-btn-green"
                    disabled={processing === selected.id}
                    onClick={() => handleApprove(selected)}
                  >
                    <CheckCircle size={15} /> Approve Seller
                  </button>
                  {!showRejectInput ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn-red"
                      disabled={processing === selected.id}
                      onClick={() => setShowRejectInput(true)}
                    >
                      <XCircle size={15} /> Reject…
                    </button>
                  ) : (
                    <button
                      type="button"
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

      {printing && selected && (
        <ApplicationSlip
          applicant={selected}
          identity={identity}
          town={shopMunicipality(selected)}
          categories={(selected.shopCategories || []).map((id) => lookups.categories[id]).filter(Boolean).join(', ')}
          onDone={() => setPrinting(false)}
        />
      )}

      <ConfirmDialog
        open={bulkConfirmOpen}
        title={`Approve ${chosen.length} seller application${chosen.length === 1 ? '' : 's'}?`}
        message={`Each applicant becomes a seller, their shop is created and goes live, and they are notified.${unverifiedChosen ? ` ${unverifiedChosen} of them ${unverifiedChosen === 1 ? 'has' : 'have'} no verified ID.` : ''}`}
        confirmLabel="Approve selected"
        danger={unverifiedChosen > 0}
        loading={bulkProcessing}
        onConfirm={handleBulkApprove}
        onCancel={() => setBulkConfirmOpen(false)}
      />
      <ReasonDialog
        open={bulkRejectOpen}
        title={`Reject ${chosen.length} application${chosen.length === 1 ? '' : 's'}?`}
        message="Each applicant gets this reason and can fix their application and apply again."
        confirmLabel="Reject selected"
        placeholder="e.g. Please upload a clearer photo of your ID"
        required
        loading={bulkProcessing}
        onConfirm={handleBulkReject}
        onCancel={() => setBulkRejectOpen(false)}
      />
    </AdminLayout>
  );
}
