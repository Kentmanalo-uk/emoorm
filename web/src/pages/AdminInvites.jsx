import { useEffect, useState } from 'react';
import { MagnifyingGlass as Search, Check, X } from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import { InviteSettings } from '../components/admin/PlatformSettings';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import EmptyArt from '../components/ui/EmptyArt';
import Select from '../components/ui/Select';
import axios from '../lib/axios';
import { timeAgo } from '../lib/format';
import { confirmAction } from '../lib/confirm';
import useAuthStore from '../store/authStore';
import '../components/admin/AdminLayout.css';
import './AdminModeration.css';

const PAGE_SIZE = 20;

const STATUS_LABELS = {
  PENDING: 'Waiting',
  HELD: 'Held for review',
  REWARDED: 'Rewarded',
  COUNTED: 'Counted',
  REJECTED: 'Rejected',
};

// Why an invite was held, counted without a reward, or rejected (services/referral).
const REASONS = {
  NO_PHONE: 'Friend has no confirmed mobile number',
  SAME_PHONE: 'Friend uses the inviter\'s number',
  SHARED_PHONE: 'Friend\'s number is on another account',
  SAME_ADDRESS: 'Delivered to the inviter\'s address',
  NO_PROGRAM: 'No shop rewards',
  OWN_SHOP: 'Inviter owns the shop',
  INVITER_CAP: 'Inviter\'s monthly limit',
  SHOP_CAP: 'Shop\'s monthly limit',
  INVITER_INACTIVE: 'Inviter\'s account is off',
  INVITER_NO_SHOP: 'Inviter has no open shop',
  REFUNDED: 'Order refunded',
};

/**
 * Invites (services/referral): every invite and how far it got, held ones to
 * approve or reject. A municipal admin sees the invites of people in their
 * town; the super admin also gets the switches and limits.
 */
export default function AdminInvites() {
  const isSuper = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('HELD');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, failed: false });
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return undefined;
    const timer = setTimeout(() => { setSearch(next); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const queryKey = `${search}|${status}|${kind}|${page}|${reloadTick}`;
  const isLoading = result.key !== queryKey;

  useEffect(() => {
    let cancelled = false;
    const params = { page, pageSize: PAGE_SIZE };
    if (search) params.search = search;
    if (status) params.status = status;
    if (kind) params.kind = kind;
    axios.get('/referrals/admin', { params })
      .then((res) => { if (!cancelled) setResult({ key: queryKey, data: res.data, failed: false }); })
      .catch(() => { if (!cancelled) setResult({ key: queryKey, data: null, failed: true }); });
    return () => { cancelled = true; };
  }, [queryKey, search, status, kind, page]);

  const decide = async (row, action) => {
    const ok = await confirmAction(action === 'approve'
      ? { title: 'Approve this invite?', message: `${row.inviter?.fullName || 'The inviter'} gets the shop's thank-you voucher, if the shop's invite rewards are still on.`, confirmLabel: 'Approve' }
      : { title: 'Reject this invite?', message: 'It will not count and no voucher is given.', confirmLabel: 'Reject', danger: true });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await axios.post(`/referrals/admin/${row.id}/${action}`);
      toast.success(action === 'approve' ? 'Invite approved' : 'Invite rejected');
      setReloadTick((t) => t + 1);
    } catch (err) {
      toast.error(err.message || 'Could not decide the invite');
    } finally {
      setBusyId(null);
    }
  };

  const data = result.data;
  const rows = data?.items || [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const counts = data?.counts || {};

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Invites</h1>
          <p className="admin-page-sub">Who invited whom, and the invites held for a closer look</p>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            {status ? STATUS_LABELS[status] : 'All invites'}
            {data && <span className="am-count">({data.total.toLocaleString('en-PH')})</span>}
          </h2>
          <div className="admin-toolbar">
            <label className="am-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search invites"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, code or shop…"
              />
            </label>
            <Select aria-label="Filter by status" className="admin-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}{counts[value] ? ` (${counts[value]})` : ''}</option>
              ))}
            </Select>
            <Select aria-label="Filter by kind" className="admin-select" value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
              <option value="">Buyers and sellers</option>
              <option value="BUYER">Friends who joined</option>
              <option value="SELLER">Sellers brought in</option>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={6} rows={6} />
        ) : result.failed ? (
          <LoadFailed what="the invites" onRetry={() => setReloadTick((t) => t + 1)} compact />
        ) : rows.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="invites" size={104} />
            <p>{status === 'HELD' ? 'No invites are waiting for a decision' : 'No invites match these filters'}</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table am-table">
                <thead>
                  <tr>
                    <th>Inviter</th>
                    <th>Joined</th>
                    <th>Shop</th>
                    <th>Status</th>
                    <th>When</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Inviter">
                        {r.inviter?.fullName || '—'}
                        <span className="am-muted"> {r.inviter?.referralCode}</span>
                      </td>
                      <td data-label="Joined">
                        {r.invitee?.fullName || '—'}
                        {r.kind === 'SELLER' && <span className="am-muted"> (seller)</span>}
                        {r.invitee?.town && <span className="am-muted"> · {r.invitee.town}</span>}
                      </td>
                      <td data-label="Shop">{r.shop?.name || '—'}</td>
                      <td data-label="Status">
                        {STATUS_LABELS[r.status] || r.status}
                        {r.reason && <span className="am-reply">{REASONS[r.reason] || r.reason}</span>}
                      </td>
                      <td data-label="When">
                        <time className="am-time" dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString('en-PH')}>
                          {timeAgo(r.countedAt || r.createdAt)}
                        </time>
                      </td>
                      <td className="am-actions">
                        {r.status === 'HELD' ? (
                          <>
                            <button type="button" className="admin-btn admin-btn-primary" disabled={busyId === r.id} onClick={() => decide(r, 'approve')}>
                              <Check size={13} /> Approve
                            </button>
                            <button type="button" className="admin-btn admin-btn-danger" disabled={busyId === r.id} onClick={() => decide(r, 'reject')}>
                              <X size={13} /> Reject
                            </button>
                          </>
                        ) : <span className="am-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="admin-pagination">
                <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {totalPages}</span>
                <button type="button" className="admin-page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {isSuper && <InviteSettings />}
    </AdminLayout>
  );
}
