import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, UserMinus as UserX, UserCheck, X, Eye, DownloadSimple, Storefront, Trash, IdentificationCard,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import { BuyerVerificationSettings } from '../components/admin/PlatformSettings';
import DetailDrawer from '../components/admin/DetailDrawer';
import MessageUserButton from '../components/admin/MessageUserButton';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import ReasonDialog from '../components/admin/ReasonDialog';
import UserContactReveal from '../components/admin/UserContactReveal';
import DeleteUserDialog from '../components/admin/DeleteUserDialog';
import IdentityCheck, { IdBadge } from '../components/admin/IdentityCheck';
import {
  AdminDate, AdminPager, AdminSearch, CountTag,
} from '../components/admin/AdminBits';
import { idStatus, shortDate } from '../components/admin/adminFormat';
import { downloadCsv, fetchAllPages, csvDate } from '../lib/csv';
import { roleLabel } from '../lib/labels';
import { useMunicipalities } from '../hooks/useReferenceData';
import EmptyArt from '../components/ui/EmptyArt';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import { confirmAction } from '../lib/confirm';
import Select from '../components/ui/Select';

const ROLE_BADGE = {
  BUYER: 'admin-badge-active',
  SELLER: 'admin-badge-approved',
  MUNICIPAL_ADMIN: 'admin-badge-review',
  SUPER_ADMIN: 'admin-badge-resolved',
};

const ROLES = ['BUYER', 'SELLER', 'MUNICIPAL_ADMIN'];
// The filter for accounts their owners closed (waiting to be erased).
const CLOSING = '__closing';

/*
 * One component, three pages, each with its own job:
 *  - Sellers (/admin/all-sellers): the town's shops, with how each is doing.
 *  - Buyers (/admin/buyers): the people who order, their ID check and orders.
 *  - All users (/admin/users, super admin): every account, to find anyone,
 *    change a role or restore an account its owner closed.
 */
const PAGES = {
  SELLER: {
    title: 'Sellers',
    sub: 'Shops and how each is doing. New applications are under Seller applications.',
    noun: 'sellers',
    search: 'Search seller name or email…',
  },
  BUYER: {
    title: 'Buyers',
    sub: 'People who shop here: their ID check and orders.',
    noun: 'buyers',
    search: 'Search name or email…',
  },
  '': {
    title: 'All users',
    sub: 'Every account, of any role. Find someone, change a role or restore a closed account.',
    noun: 'users',
    search: 'Search name or email…',
  },
};

// Where a shop stands, in the order an admin would act on it.
const storeState = (store, stats) => {
  if (!store) return { label: 'No shop yet', badge: 'admin-badge-neutral' };
  if (store.isSuspended) return { label: 'Suspended', badge: 'admin-badge-rejected' };
  if (!store.isActive) return { label: 'Closed', badge: 'admin-badge-dismissed' };
  if (store.isApproved === false) return { label: 'Not approved', badge: 'admin-badge-pending' };
  if (stats && !stats.readyToSell) return { label: 'Not ready to sell', badge: 'admin-badge-pending', hint: 'Delivery, pickup or payment setup is missing' };
  return { label: 'Selling', badge: 'admin-badge-approved' };
};

export default function AdminUsers({ fixedRole = '' }) {
  const navigate = useNavigate();
  const { user: actor } = useAuthStore();
  const isSuperAdmin = actor?.role === 'SUPER_ADMIN';
  const page$ = PAGES[fixedRole] || PAGES[''];
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // Seeded from ?search= so a top-bar search result opens filtered.
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [roleFilter, setRoleFilter] = useState(fixedRole);
  // '' all, 'true' active, 'false' suspended (the API's isActive).
  const [activeFilter, setActiveFilter] = useState('');
  const [townFilter, setTownFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [processing, setProcessing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [storeSuspendOpen, setStoreSuspendOpen] = useState(false);
  const [storeProcessing, setStoreProcessing] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showRule, setShowRule] = useState(false);
  const { municipalities } = useMunicipalities({ enabled: isSuperAdmin });

  // Typing waits for a pause (300 ms) before asking, so a name is one request
  // rather than one per letter; a filter or page change asks at once.
  const lastSearch = useRef(search);
  useEffect(() => {
    const typed = search !== lastSearch.current;
    lastSearch.current = search;
    if (!typed) {
      fetchUsers();
      return undefined;
    }
    const timer = setTimeout(fetchUsers, 300);
    return () => clearTimeout(timer);
  }, [search, roleFilter, activeFilter, townFilter, sort, page, fixedRole]);

  // Follows ?search= when it changes, so a second search from the top bar
  // re-filters instead of leaving the first term in place. Only a change to
  // the URL counts, so typing in this page's own box is left alone.
  const urlSearch = searchParams.get('search') || '';
  const lastUrlSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch === lastUrlSearch.current) return;
    lastUrlSearch.current = urlSearch;
    // A finished search, not typing: it loads at once.
    lastSearch.current = urlSearch;
    setSearch(urlSearch);
    setPage(1);
  }, [urlSearch]);

  // Only the newest request fills the table: one overtaken by a later search,
  // filter or page (and answering late) is dropped.
  const latestRequest = useRef(0);
  const listParams = () => {
    const params = {};
    if (search) params.search = search;
    if (roleFilter === CLOSING) params.closing = '1';
    else if (fixedRole || roleFilter) params.role = fixedRole || roleFilter;
    if (activeFilter) params.isActive = activeFilter;
    if (isSuperAdmin && townFilter) params.municipalityId = townFilter;
    if (sort !== 'newest') params.sort = sort;
    return params;
  };
  const fetchUsers = async () => {
    const request = ++latestRequest.current;
    setIsLoading(true);
    try {
      const res = await axios.get('/auth/users', { params: { ...listParams(), page, pageSize: 20 }, quiet: true });
      if (request !== latestRequest.current) return;
      setUsers(res.data || []);
      setLoadError(false);
      if (res.pagination) setPagination(res.pagination);
    } catch {
      if (request === latestRequest.current) setLoadError(true);
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  };

  const openDetails = async (userId, { quiet = false } = {}) => {
    try {
      const res = await axios.get(`/auth/users/${userId}`, { quiet: true });
      setSelected(res.data);
      return true;
    } catch (err) {
      if (!quiet) toast.error(err?.response?.data?.message || err.message || 'Unable to view this user');
      return false;
    }
  };

  // ?id=<userId> opens that person's details (the dashboard's "View", a
  // notification): fetched by id, so they need not be on this page of the
  // list; the server refuses anyone outside a town admin's town.
  const linkedId = searchParams.get('id');
  const openedId = useRef(null);
  useEffect(() => {
    if (!linkedId || openedId.current === linkedId) return;
    openedId.current = linkedId;
    openDetails(linkedId).then((ok) => {
      if (!ok) setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('id'); return next; }, { replace: true });
    });
  }, [linkedId, setSearchParams]);

  const closeDetails = () => {
    setSelected(null);
    if (searchParams.get('id')) {
      openedId.current = null;
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete('id'); return next; }, { replace: true });
    }
  };

  const refreshSelected = async () => {
    if (selected) await openDetails(selected.id, { quiet: true });
    fetchUsers();
  };

  const handleSuspend = async (reason) => {
    const target = suspendTarget;
    if (!target) return;
    setProcessing(target.id);
    try {
      await axios.post(`/auth/users/${target.id}/suspend`, { reason });
      toast.success(`${target.fullName || 'User'} is suspended`);
      setSuspendTarget(null);
      await refreshSelected();
    } catch (err) {
      toast.error(err.message || 'Failed to suspend user');
    } finally {
      setProcessing(null);
    }
  };

  const handleActivate = async (u) => {
    if (!(await confirmAction({ title: `Reactivate ${u.fullName}?`, message: 'They can sign in again straight away.', confirmLabel: 'Reactivate' }))) return;
    setProcessing(u.id);
    try {
      await axios.post(`/auth/users/${u.id}/activate`);
      toast.success('User reactivated');
      await refreshSelected();
    } catch (err) {
      toast.error(err.message || 'Failed to activate user');
    } finally {
      setProcessing(null);
    }
  };

  // The owner closed the account and asked support to undo it.
  const handleRestore = async (userId) => {
    if (!(await confirmAction({ title: 'Restore this account?', message: 'It opens again and will not be erased. Its shop stays closed until the owner reopens it.', confirmLabel: 'Restore' }))) return;
    setProcessing(userId);
    try {
      await axios.post(`/account/users/${userId}/restore`);
      toast.success('Account restored');
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to restore the account');
    } finally {
      setProcessing(null);
    }
  };

  const handleSetRole = async (u, role) => {
    const message = role === 'MUNICIPAL_ADMIN'
      ? `They get the admin panel for ${u.municipality?.name || 'their town'} at once. To make someone a town's admin, use Municipal admins instead.`
      : role === 'SELLER'
        ? 'They get the Seller Center. A shop is not opened for them; approving an application does that.'
        : 'They lose any admin or seller access at once.';
    if (!(await confirmAction({ title: `Make ${u.fullName} a ${roleLabel(role).toLowerCase()}?`, message, confirmLabel: 'Change role', danger: role === 'MUNICIPAL_ADMIN' }))) return;
    setProcessing(u.id);
    try {
      await axios.post(`/auth/users/${u.id}/set-role`, { role });
      toast.success(`${u.fullName} is now a ${roleLabel(role).toLowerCase()}`);
      closeDetails();
      fetchUsers();
    } catch (err) {
      toast.error(err.message || 'Failed to update role');
    } finally {
      setProcessing(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllPages('/auth/users', listParams());
      const prefix = fixedRole === 'SELLER' ? 'sellers' : fixedRole === 'BUYER' ? 'buyers' : 'users';
      downloadCsv(`${prefix}-${new Date().toISOString().slice(0, 10)}.csv`, [
        { header: 'Name', value: (r) => r.fullName },
        ...(fixedRole === 'SELLER' ? [{ header: 'Shop', value: (r) => r.store?.name || '' }] : []),
        { header: 'Municipality', value: (r) => r.municipality?.name },
        { header: 'Role', value: (r) => roleLabel(r.role) },
        { header: 'Status', value: (r) => (r.isActive ? 'Active' : 'Suspended') },
        { header: 'ID check', value: (r) => idStatus(r.identityVerification).label },
        { header: 'Seller application', value: (r) => r.sellerApplicationStatus || '' },
        { header: 'Joined', value: (r) => csvDate(r.createdAt) },
      ], rows);
      toast.success(`Exported ${rows.length} rows`);
    } catch (err) {
      toast.error(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleStoreSuspend = async (reason) => {
    if (!selected?.store) return;
    setStoreProcessing(true);
    try {
      await axios.post(`/stores/${selected.store.id}/suspend`, { reason });
      toast.success('Store suspended');
      setStoreSuspendOpen(false);
      await refreshSelected();
    } catch (err) {
      toast.error(err.message || 'Failed to suspend store');
    } finally {
      setStoreProcessing(false);
    }
  };

  const handleStoreRestore = async () => {
    if (!selected?.store) return;
    if (!(await confirmAction({ title: `Restore ${selected.store.name}?`, message: 'The shop and its products are visible to buyers again.', confirmLabel: 'Restore shop' }))) return;
    setStoreProcessing(true);
    try {
      await axios.post(`/stores/${selected.store.id}/unsuspend`);
      toast.success('Store restored');
      await refreshSelected();
    } catch (err) {
      toast.error(err.message || 'Failed to restore store');
    } finally {
      setStoreProcessing(false);
    }
  };

  const resetPage = (fn) => (value) => { fn(value); setPage(1); };
  const filtered = Boolean(search || activeFilter || townFilter || (roleFilter && !fixedRole));
  // Columns that are the same on every row are left out: a town admin's
  // lists are all one town; Sellers and Buyers are all one role.
  const showTown = isSuperAdmin;
  const sellers = fixedRole === 'SELLER';
  const buyers = fixedRole === 'BUYER';
  const cols = 4 + (showTown ? 1 : 0) + (sellers ? 2 : 0) + (buyers || sellers ? 1 : 0) + (!fixedRole ? 1 : 0);

  const statusBadge = (u) => (u.deletionRequestedAt ? (
    <span className="admin-badge admin-badge-rejected" title="Closed by its owner">
      Erased {shortDate(new Date(u.deletionRequestedAt).getTime() + 30 * 864e5)}
    </span>
  ) : (
    <span className={`admin-badge ${u.isActive ? 'admin-badge-approved' : 'admin-badge-rejected'}`}>
      {u.isActive ? 'Active' : 'Suspended'}
    </span>
  ));

  const canReviewId = (u) => ['BUYER', 'SELLER'].includes(u.role) && u.id !== actor?.id;

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">{page$.title}</h1>
          <p className="admin-page-sub">{page$.sub}</p>
        </div>
        {isSuperAdmin && buyers && (
          <button type="button" className="admin-btn admin-btn-gray" aria-expanded={showRule} onClick={() => setShowRule((v) => !v)}>
            <IdentificationCard size={14} /> Checkout ID rule
          </button>
        )}
      </div>

      {/* The Buyers page: whether checkout needs a verified ID (a platform
          rule, so above the list and behind its own button). */}
      {isSuperAdmin && buyers && showRule && <BuyerVerificationSettings />}

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            {page$.title}
            {pagination.total > 0 && <CountTag n={pagination.total} />}
          </h2>
          <div className="admin-toolbar">
            <AdminSearch value={search} onChange={resetPage(setSearch)} placeholder={page$.search} />
            {!fixedRole && (
              <Select
                aria-label="Filter by role"
                className="admin-select"
                value={roleFilter}
                onChange={(e) => resetPage(setRoleFilter)(e.target.value)}
              >
                <option value="">All roles</option>
                {['BUYER', 'SELLER', 'MUNICIPAL_ADMIN', 'SUPER_ADMIN'].map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
                {isSuperAdmin && <option value={CLOSING}>Closed by owner</option>}
              </Select>
            )}
            {roleFilter !== CLOSING && (
              <Select
                aria-label="Filter by status"
                className="admin-select"
                value={activeFilter}
                onChange={(e) => resetPage(setActiveFilter)(e.target.value)}
              >
                <option value="">Active and suspended</option>
                <option value="true">Active</option>
                <option value="false">Suspended</option>
              </Select>
            )}
            {isSuperAdmin && (
              <Select
                aria-label="Filter by municipality"
                className="admin-select"
                value={townFilter}
                onChange={(e) => resetPage(setTownFilter)(e.target.value)}
              >
                <option value="">All municipalities</option>
                {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
            <Select aria-label="Sort" className="admin-select" value={sort} onChange={(e) => resetPage(setSort)(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </Select>
            <button type="button" className="admin-btn admin-btn-gray" disabled={exporting} onClick={handleExport}>
              <DownloadSimple size={13} /> {exporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={cols} rows={7} />
        ) : loadError ? (
          <LoadFailed onRetry={fetchUsers} what={`the ${page$.noun}`} compact />
        ) : users.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="users" size={104} />
            <p>{filtered ? `No ${page$.noun} match these filters.` : `No ${page$.noun} yet.`}</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{sellers ? 'Shop' : 'Person'}</th>
                    {!fixedRole && <th>Role</th>}
                    {showTown && <th>Municipality</th>}
                    {sellers && <th>Live products</th>}
                    {sellers && <th>Orders (30 days)</th>}
                    {buyers && <th>Orders</th>}
                    {(sellers || buyers) && <th>ID check</th>}
                    <th>{sellers ? 'Shop status' : 'Status'}</th>
                    <th>Joined</th>
                    <th><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const shop = sellers ? storeState(u.store, u.shopStats) : null;
                    return (
                      <tr
                        key={u.id}
                        className="admin-row-clickable"
                        tabIndex={0}
                        onClick={rowOpen(() => openDetails(u.id))}
                        onKeyDown={rowKeyOpen(() => openDetails(u.id))}
                      >
                        <td>
                          <div className="admin-user-cell">
                            <div className="admin-avatar">{(sellers ? u.store?.name : u.fullName)?.[0] || '?'}</div>
                            <div>
                              {sellers && u.store ? (
                                <>
                                  <Link className="admin-user-cell-name admin-link" to={`/store/${u.store.slug}`} target="_blank" rel="noopener noreferrer">{u.store.name}</Link>
                                  <p className="admin-user-cell-email">{u.fullName}</p>
                                </>
                              ) : (
                                <>
                                  <p className="admin-user-cell-name">{u.fullName}</p>
                                  <p className="admin-user-cell-email">{u.email}</p>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        {!fixedRole && (
                          <td><span className={`admin-badge ${ROLE_BADGE[u.role] || ''}`}>{roleLabel(u.role)}</span></td>
                        )}
                        {showTown && <td>{u.municipality?.name || '—'}</td>}
                        {sellers && <td>{u.shopStats ? u.shopStats.liveProducts : '—'}</td>}
                        {sellers && <td>{u.shopStats ? u.shopStats.orders30d : '—'}</td>}
                        {buyers && <td>{u._count?.orders ?? 0}</td>}
                        {(sellers || buyers) && <td><IdBadge record={u.identityVerification} /></td>}
                        <td>
                          {sellers && u.isActive && !u.deletionRequestedAt ? (
                            <span className={`admin-badge ${shop.badge}`} title={shop.hint}>{shop.label}</span>
                          ) : statusBadge(u)}
                        </td>
                        <td className="admin-hide-phone"><AdminDate value={u.createdAt} /></td>
                        <td>
                          {u.deletionRequestedAt ? (
                            <button
                              type="button"
                              className="admin-btn admin-btn-green"
                              disabled={processing === u.id}
                              onClick={() => handleRestore(u.id)}
                            >
                              <UserCheck size={13} /> Restore
                            </button>
                          ) : (
                            <button type="button" className="admin-btn admin-btn-gray" onClick={() => openDetails(u.id)}>
                              <Eye size={13} /> Details
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <AdminPager page={page} totalPages={pagination.totalPages} total={pagination.total} onPage={setPage} />
          </>
        )}
      </div>

      {/* User detail panel */}
      <DetailDrawer item={selected} onClose={closeDetails}>
        {(selected) => (
          <>
            <div className="admin-detail-header">
              <h3>{selected.store && selected.role === 'SELLER' ? selected.store.name : selected.fullName}</h3>
              <div className="admin-detail-head-actions">
                <MessageUserButton userId={selected.id} role={selected.role} />
                <button type="button" className="admin-detail-close" onClick={closeDetails} aria-label="Close"><X size={18} /></button>
              </div>
            </div>

            <div className="admin-detail-body">
              {!selected.isActive && (
                <div className="admin-detail-section admin-suspended-note">
                  <h4>Suspended</h4>
                  <p className="admin-detail-note">
                    {selected.suspension?.reason || 'No reason was recorded.'}
                    {selected.suspension && (
                      <span className="admin-detail-note-by">
                        {`${shortDate(selected.suspension.at)}${selected.suspension.byName ? ` · by ${selected.suspension.byName}` : ''}. They see this reason when they try to sign in.`}
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="admin-detail-section">
                <h4>Account Info</h4>
                <div className="admin-detail-grid">
                  <div><label>Full Name</label><p>{selected.fullName}</p></div>
                  <div><label>Municipality</label><p>{selected.municipality?.name || '—'}</p></div>
                  <div><label>Barangay</label><p>{selected.barangay || '—'}</p></div>
                  <div><label>Province</label><p>{selected.province || 'Oriental Mindoro'}</p></div>
                  <UserContactReveal user={selected} withAddress />
                  <div><label>Role</label><p><span className={`admin-badge ${ROLE_BADGE[selected.role]}`}>{roleLabel(selected.role)}</span></p></div>
                  <div><label>Status</label><p>{statusBadge(selected)}</p></div>
                  <div><label>Joined</label><p><AdminDate value={selected.createdAt} /></p></div>
                </div>
              </div>

              {['BUYER', 'SELLER'].includes(selected.role) && (
                <div className="admin-detail-section">
                  <h4><IdentificationCard size={14} /> ID check</h4>
                  <IdentityCheck
                    userId={selected.id}
                    identity={selected.identity || { status: 'NOT_VERIFIED' }}
                    canReview={canReviewId(selected)}
                    onChange={() => refreshSelected()}
                  />
                </div>
              )}

              {selected.store && (
                <div className="admin-detail-section">
                  <h4>Store Information</h4>
                  <div className="admin-detail-grid">
                    <div><label>Store</label><p>{selected.store.name}</p></div>
                    <div><label>Status</label><p>{selected.store.isSuspended ? 'Suspended' : selected.store.isActive ? 'Active' : 'Closed'}</p></div>
                    <div><label>Products</label><p>{selected.store._count?.products ?? 0}</p></div>
                    <div><label>Orders</label><p>{selected.store._count?.orders ?? 0}</p></div>
                    <div className="admin-detail-full"><label>Pickup Address</label><p>{selected.store.pickupAddress || '—'}</p></div>
                    {selected.store.isSuspended && selected.store.suspensionReason && (
                      <div className="admin-detail-full"><label>Suspension Reason</label><p>{selected.store.suspensionReason}</p></div>
                    )}
                  </div>
                  <div className="admin-detail-actions">
                    <button type="button" className="admin-btn admin-btn-gray" onClick={() => navigate(`/store/${selected.store.slug}`)}>View Store</button>
                    <button type="button" className="admin-btn admin-btn-gray" onClick={() => navigate(`/admin/products?storeId=${selected.store.id}`)}>View Products</button>
                    <button type="button" className="admin-btn admin-btn-gray" onClick={() => navigate(`/admin/orders?storeId=${selected.store.id}`)}>View Orders</button>
                    <button type="button" className="admin-btn admin-btn-gray" onClick={() => navigate(`/admin/reviews?storeId=${selected.store.id}`)}>View Reviews</button>
                    {selected.role === 'SELLER' && (selected.store.isSuspended ? (
                      <button type="button" className="admin-btn admin-btn-green" disabled={storeProcessing} onClick={handleStoreRestore}>
                        <Storefront size={13} /> Restore store
                      </button>
                    ) : (
                      <button type="button" className="admin-btn admin-btn-red" disabled={storeProcessing} onClick={() => setStoreSuspendOpen(true)}>
                        <Storefront size={13} /> Suspend store
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selected.role === 'BUYER' && (
                <div className="admin-detail-section">
                  <h4>Buyer Activity</h4>
                  <button type="button" className="admin-btn admin-btn-gray" onClick={() => navigate(`/admin/orders?buyerId=${selected.id}`)}>
                    View Orders
                  </button>
                </div>
              )}

              {isSuperAdmin && selected.role !== 'SUPER_ADMIN' && (
                <div className="admin-detail-section">
                  <h4>Change Role</h4>
                  <div className="admin-detail-actions">
                    {ROLES.filter((r) => r !== selected.role).map((role) => (
                      <button
                        type="button"
                        key={role}
                        className="admin-btn admin-btn-blue"
                        disabled={processing === selected.id}
                        onClick={() => handleSetRole(selected, role)}
                      >
                        <ShieldCheck size={13} /> Make {roleLabel(role).toLowerCase()}
                      </button>
                    ))}
                  </div>
                  <p className="admin-detail-hint">
                    To put someone in charge of a town, use <Link className="admin-link" to="/admin/junior-admins">Municipal admins</Link>: it sets their town too.
                  </p>
                </div>
              )}

              <div className="admin-detail-section">
                <h4>Account Actions</h4>
                <div className="admin-detail-actions">
                  {selected.isActive ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn-red"
                      disabled={processing === selected.id || selected.role === 'SUPER_ADMIN' || selected.id === actor?.id}
                      onClick={() => setSuspendTarget(selected)}
                    >
                      <UserX size={14} /> Suspend account…
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-btn admin-btn-green"
                      disabled={processing === selected.id}
                      onClick={() => handleActivate(selected)}
                    >
                      <UserCheck size={14} /> Reactivate account
                    </button>
                  )}
                </div>
              </div>

              {isSuperAdmin && selected.role !== 'SUPER_ADMIN' && selected.id !== actor?.id && (
                <div className="admin-detail-section admin-danger-zone">
                  <h4>Danger Zone</h4>
                  <p className="admin-detail-hint">
                    Permanently removes this account and everything that belongs to it
                    (orders, store, products, messages). This cannot be undone.
                  </p>
                  <button
                    type="button"
                    className="admin-btn admin-btn-red"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash size={14} /> Delete permanently
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </DetailDrawer>
      <DeleteUserDialog
        open={deleteOpen}
        user={selected}
        onCancel={() => setDeleteOpen(false)}
        onDeleted={() => {
          const name = selected?.fullName || 'User';
          const goneId = selected?.id;
          setDeleteOpen(false);
          closeDetails();
          setUsers((list) => list.filter((u) => u.id !== goneId));
          setPagination((pg) => ({ ...pg, total: Math.max(0, (pg.total || 1) - 1) }));
          toast.success(`${name} was permanently deleted`);
        }}
      />
      <ReasonDialog
        open={!!suspendTarget}
        title={`Suspend ${suspendTarget?.fullName || 'this account'}?`}
        message={`They are signed out and cannot sign in until reactivated${suspendTarget?.store ? '; their shop stays as it is (suspend it separately)' : ''}. They see this reason when they try to sign in, and it is kept in the audit log.`}
        confirmLabel="Suspend"
        placeholder="e.g. Repeated fake orders reported by three shops"
        required
        danger
        loading={processing === suspendTarget?.id}
        onConfirm={handleSuspend}
        onCancel={() => setSuspendTarget(null)}
      />
      <ReasonDialog
        open={storeSuspendOpen}
        title="Suspend store?"
        message="The store and its products will be hidden from buyers until restored."
        confirmLabel="Suspend store"
        placeholder="Reason for suspension"
        required
        danger
        loading={storeProcessing}
        onConfirm={handleStoreSuspend}
        onCancel={() => setStoreSuspendOpen(false)}
      />
    </AdminLayout>
  );
}
