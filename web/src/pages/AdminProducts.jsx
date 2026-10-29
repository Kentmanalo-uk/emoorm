import { useState, useEffect, useRef } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Package, MagnifyingGlass as Search, CheckCircle, XCircle, Eye, X,
  Storefront as Store, Tag, Archive, ArrowCounterClockwise, SlidersHorizontal,
} from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import { ProductFeatureSettings } from '../components/admin/PlatformSettings';
import useAuthStore from '../store/authStore';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import axios from '../lib/axios';
import ReasonDialog from '../components/admin/ReasonDialog';
import { resolveImg } from '../lib/media';
import ProductImage from '../components/ProductImage';
import { useAdminAttention, useRefreshAdminShell } from '../hooks/useAdminShellData';
import { useCategories, useMunicipalities } from '../hooks/useReferenceData';
import { productStatus } from '../lib/labels';
import { confirmAction } from '../lib/confirm';
import { peso } from '../lib/format';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';
import './AdminModeration.css';
import Select from '../components/ui/Select';

// Bulk actions go three at a time: each one is several queries and a
// notification on a database with a handful of connections, so twenty at once
// could time out (and stall every other admin's pages meanwhile).
const settleInBatches = async (items, run, size = 3) => {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...await Promise.allSettled(items.slice(i, i + size).map(run)));
  }
  return results;
};

const STATUS_BADGE = {
  PENDING: 'admin-badge-pending',
  APPROVED: 'admin-badge-approved',
  HIDDEN: 'admin-badge-dismissed',
  SUSPENDED: 'admin-badge-suspended',
  ARCHIVED: 'admin-badge-dismissed',
};

const STATUSES = ['PENDING', 'APPROVED', 'SUSPENDED', 'HIDDEN', 'ARCHIVED'];

// What the list can be ordered by (the API's sort fields). Stock is not one
// of them, so "lowest stock" is not offered.
const SORTS = {
  newest: { label: 'Newest first', sortBy: 'createdAt', sortOrder: 'desc' },
  oldest: { label: 'Oldest first', sortBy: 'createdAt', sortOrder: 'asc' },
  priceLow: { label: 'Price: low to high', sortBy: 'price', sortOrder: 'asc' },
  priceHigh: { label: 'Price: high to low', sortBy: 'price', sortOrder: 'desc' },
  name: { label: 'Name A–Z', sortBy: 'name', sortOrder: 'asc' },
  bestSelling: { label: 'Best-selling', sortBy: 'orderCount', sortOrder: 'desc' },
  stockLow: { label: 'Lowest stock first', sortBy: 'stock', sortOrder: 'asc' },
};

function StatusBadge({ status }) {
  return <span className={`admin-badge ${STATUS_BADGE[status] || ''}`}>{productStatus(status)}</span>;
}

function StockCell({ stock }) {
  if (Number(stock) > 0) return <>{Number(stock).toLocaleString('en-PH')}</>;
  return <span className="admin-badge am-badge-out">Out of stock</span>;
}

export default function AdminProducts() {
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const [searchParams, setSearchParams] = useSearchParams();
  const storeId = searchParams.get('storeId') || '';
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Seeded from ?search= so a top-bar search result opens filtered. The
  // status filter starts open in that case: a searched-for product may well
  // be pending or suspended, and the usual default would hide it.
  const [search, setSearch] = useState(searchParams.get('search') || '');
  // null until chosen: the page then opens on "Waiting for approval" when
  // anything waits (the work), otherwise on Approved.
  const [chosenStatus, setChosenStatus] = useState(() => {
    if (searchParams.get('status')) return searchParams.get('status');
    return searchParams.get('search') ? '' : null;
  });
  const [categoryId, setCategoryId] = useState('');
  const [municipalityId, setMunicipalityId] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [reasonAction, setReasonAction] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  // A decision changes the waiting count beside Products.
  const refreshShell = useRefreshAdminShell();
  const attention = useAdminAttention();
  const { categories } = useCategories({ activeOnly: false });
  const { municipalities } = useMunicipalities({ enabled: isSuperAdmin });

  const pendingWaiting = Number((attention.data || []).find((i) => i.key === 'pendingProducts')?.count || 0);
  const attentionKnown = attention.isFetched || attention.isError;
  const statusFilter = chosenStatus ?? (attentionKnown ? (pendingWaiting > 0 ? 'PENDING' : 'APPROVED') : null);
  const setStatusFilter = (value) => setChosenStatus(value);
  // The search the list last asked for, to tell typing from other changes.
  const lastSearch = useRef(search);

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
    setChosenStatus(urlSearch ? '' : null);
    setPage(1);
  }, [urlSearch]);

  // Deep link from a notification: /admin/products?id=<productId>.
  const openedId = useRef(null);
  useEffect(() => {
    const targetId = searchParams.get('id');
    if (!targetId || openedId.current === targetId) return;
    openedId.current = targetId;
    axios.get(`/products/${targetId}`)
      .then((res) => setSelected(res.data))
      .catch((err) => toast.error(err?.status === 404 ? 'That product no longer exists.' : 'Could not open that product.'));
  }, [searchParams]);

  // Only the newest request fills the table: one overtaken by a later search,
  // filter or page (and answering late) is dropped.
  const latestRequest = useRef(0);
  const fetchProducts = async () => {
    const request = ++latestRequest.current;
    setIsLoading(true);
    setSelectedIds([]);
    try {
      const { sortBy, sortOrder } = SORTS[sort] || SORTS.newest;
      const params = { pageSize: 20, page, sortBy, sortOrder };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      if (storeId) params.storeId = storeId;
      if (categoryId) params.categoryId = categoryId;
      // Ignored by the API for a municipal admin (always their own town).
      if (isSuperAdmin && municipalityId) params.municipalityId = municipalityId;

      const res = await axios.get('/products', { params });
      if (request !== latestRequest.current) return;
      setProducts(res.data || []);
      setLoadFailed(false);
      if (res.pagination) setPagination(res.pagination);
    } catch {
      if (request === latestRequest.current) setLoadFailed(true);
    } finally {
      if (request === latestRequest.current) setIsLoading(false);
    }
  };

  // Typing waits for a pause (300 ms) before asking, so a name is one request
  // rather than one per letter; a filter or page change asks at once.
  useEffect(() => {
    if (statusFilter === null) return undefined;
    const typed = search !== lastSearch.current;
    lastSearch.current = search;
    if (!typed) {
      fetchProducts();
      return undefined;
    }
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [statusFilter, search, page, storeId, categoryId, municipalityId, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearStore = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('storeId');
    setSearchParams(next, { replace: true });
    setPage(1);
  };

  const handleApprove = async (productId) => {
    setProcessing(productId);
    try {
      await axios.post(`/products/${productId}/approve`);
      toast.success('Product approved — now visible to buyers');
      setSelected(null);
      fetchProducts();
      refreshShell('attention');
    } catch (err) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  // Undo a suspension or archive: buyers see it again at once, so it asks.
  const handleRestore = async (product) => {
    const ok = await confirmAction({
      title: product.status === 'SUSPENDED' ? `Unsuspend "${product.name}"?` : `Restore "${product.name}"?`,
      message: 'Buyers will see it in the shop again, and the seller is told.',
      confirmLabel: product.status === 'SUSPENDED' ? 'Unsuspend' : 'Restore',
    });
    if (!ok) return;
    setProcessing(product.id);
    try {
      await axios.post(`/products/${product.id}/restore`);
      toast.success('Product restored — visible to buyers again');
      setSelected(null);
      fetchProducts();
      refreshShell('attention');
    } catch (err) {
      toast.error(err.message || 'Failed to restore product');
    } finally {
      setProcessing(null);
    }
  };

  // reasonAction: { type: 'suspend' | 'archive' | 'bulk-suspend', productId? }
  const handleSuspend = (productId) => setReasonAction({ type: 'suspend', productId });
  const handleArchive = (productId) => setReasonAction({ type: 'archive', productId });

  const summarize = (results, verb) => {
    const done = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - done;
    const msg = `${verb}: ${done} done, ${failed} failed`;
    if (failed) toast.error(msg); else toast.success(msg);
  };

  const handleReasonConfirm = async (reason) => {
    const action = reasonAction;
    if (!action) return;
    const body = reason ? { reason } : {};
    if (action.type === 'bulk-suspend') {
      setBulkProcessing(true);
      try {
        const targets = products.filter((p) => selectedIds.includes(p.id) && (p.status === 'PENDING' || p.status === 'APPROVED'));
        const results = await settleInBatches(targets, (p) => axios.post(`/products/${p.id}/suspend`, body));
        summarize(results, 'Suspend');
        setSelectedIds([]);
        setReasonAction(null);
        fetchProducts();
        refreshShell('attention');
      } finally {
        setBulkProcessing(false);
      }
      return;
    }
    const { productId, type } = action;
    setProcessing(productId);
    try {
      await axios.post(`/products/${productId}/${type}`, body);
      toast.success(type === 'suspend' ? 'Product suspended' : 'Product archived');
      setReasonAction(null);
      setSelected(null);
      fetchProducts();
      refreshShell('attention');
    } catch (err) {
      toast.error(err.message || `Failed to ${type}`);
    } finally {
      setProcessing(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const allSelected = products.length > 0 && products.every((p) => selectedIds.includes(p.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? [] : products.map((p) => p.id));
  const selectedProducts = products.filter((p) => selectedIds.includes(p.id));
  const selectedPending = selectedProducts.filter((p) => p.status === 'PENDING');
  const selectedSuspendable = selectedProducts.filter((p) => p.status === 'PENDING' || p.status === 'APPROVED');

  const handleBulkApprove = async () => {
    if (selectedPending.length === 0) return;
    const n = selectedPending.length;
    const ok = await confirmAction({
      title: `Approve ${n} product${n === 1 ? '' : 's'}?`,
      message: 'They go live in their shops at once, and each seller is told.',
      confirmLabel: 'Approve',
    });
    if (!ok) return;
    setBulkProcessing(true);
    try {
      const results = await settleInBatches(selectedPending, (p) => axios.post(`/products/${p.id}/approve`));
      summarize(results, 'Approve');
      setSelectedIds([]);
      fetchProducts();
      refreshShell('attention');
    } finally {
      setBulkProcessing(false);
    }
  };

  const images = (p) => (Array.isArray(p?.images) ? p.images : []);
  const storeName = products.find((p) => p.store?.id === storeId)?.store?.name;
  const filtered = Boolean(search || categoryId || municipalityId || storeId);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Products</h1>
          <p className="admin-page-sub">Approve new listings and act on ones that break the rules</p>
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            className="admin-btn admin-btn-gray"
            aria-expanded={featuresOpen}
            aria-controls="product-features"
            onClick={() => setFeaturesOpen((v) => !v)}
          >
            <SlidersHorizontal size={14} /> {featuresOpen ? 'Hide product features' : 'Product features'}
          </button>
        )}
      </div>

      {/* Platform-wide switches for selling (super admin). Behind a header
          button so the product queue stays first, and near the top when open. */}
      {isSuperAdmin && featuresOpen && <ProductFeatureSettings />}

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Products
            {pagination.total > 0 && <span className="am-count">({pagination.total.toLocaleString('en-PH')})</span>}
          </h2>
          <div className="admin-toolbar">
            <label className="am-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="Search products"
                placeholder="Search products…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </label>
            <Select
              aria-label="Filter by status"
              className="admin-select"
              value={statusFilter ?? ''}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{productStatus(s)}</option>)}
              <option value="">All statuses</option>
            </Select>
            <Select
              aria-label="Filter by category"
              className="admin-select"
              value={categoryId}
              onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {isSuperAdmin && (
              <Select
                aria-label="Filter by municipality"
                className="admin-select"
                value={municipalityId}
                onChange={(e) => { setMunicipalityId(e.target.value); setPage(1); }}
              >
                <option value="">All municipalities</option>
                {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            )}
            <Select
              aria-label="Sort by"
              className="admin-select"
              value={sort}
              onChange={(e) => { setSort(e.target.value); setPage(1); }}
            >
              {Object.entries(SORTS).map(([key, s]) => <option key={key} value={key}>{s.label}</option>)}
            </Select>
          </div>
        </div>

        {storeId && (
          <div className="am-chips">
            <span className="am-chip">
              Store: {storeName || 'this shop'}
              <button type="button" onClick={clearStore} aria-label="Show every shop's products"><X size={12} /></button>
            </span>
          </div>
        )}

        {isLoading || statusFilter === null ? (
          <Skeleton.Table cols={6} rows={6} />
        ) : loadFailed ? (
          <LoadFailed what="the products" onRetry={fetchProducts} compact />
        ) : products.length === 0 ? (
          <div className="admin-empty">
            <EmptyArt name="products" size={104} />
            <p>
              {filtered
                ? 'No products match these filters'
                : statusFilter ? `No products: ${productStatus(statusFilter).toLowerCase()}` : 'No products yet'}
            </p>
          </div>
        ) : (
          <>
            {selectedIds.length > 0 && (
              <div className="admin-bulk-bar">
                <span>{selectedIds.length} selected</span>
                <button
                  type="button"
                  className="admin-btn admin-btn-green"
                  disabled={bulkProcessing || selectedPending.length === 0}
                  onClick={handleBulkApprove}
                >
                  <CheckCircle size={13} /> Approve selected ({selectedPending.length})
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-red"
                  disabled={bulkProcessing || selectedSuspendable.length === 0}
                  onClick={() => setReasonAction({ type: 'bulk-suspend' })}
                >
                  <XCircle size={13} /> Suspend selected ({selectedSuspendable.length})
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
                      <input type="checkbox" aria-label="Select all on this page" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th>Product</th>
                    <th>Store</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const img = images(p)[0];
                    return (
                      <tr
                        key={p.id}
                        className="admin-row-clickable"
                        tabIndex={0}
                        onClick={rowOpen(() => setSelected(p))}
                        onKeyDown={rowKeyOpen(() => setSelected(p))}
                      >
                        <td className="admin-check-col">
                          <input
                            type="checkbox"
                            aria-label={`Select ${p.name}`}
                            checked={selectedIds.includes(p.id)}
                            onChange={() => toggleSelect(p.id)}
                          />
                        </td>
                        <td>
                          <div className="admin-product-cell">
                            {img
                              ? <ProductImage sizes="96px" src={img} alt="" className="admin-product-thumb" />
                              : <div className="admin-product-thumb-placeholder"><Package size={16} /></div>}
                            <span className="admin-product-name">{p.name}</span>
                          </div>
                        </td>
                        <td>
                          {p.store
                            ? <Link to={`/store/${p.store.slug}`} className="admin-link" target="_blank">{p.store.name}</Link>
                            : '—'}
                        </td>
                        <td className="am-phone-hide">{p.category?.name || '—'}</td>
                        <td>{peso(p.price)}</td>
                        <td><StockCell stock={p.stock} /></td>
                        <td><StatusBadge status={p.status} /></td>
                        <td>
                          <div className="am-row-actions">
                            <button type="button" className="admin-btn admin-btn-gray am-phone-hide" onClick={() => setSelected(p)}>
                              <Eye size={13} /> View
                            </button>
                            {p.status === 'PENDING' && (
                              <button
                                type="button"
                                className="admin-btn admin-btn-green"
                                disabled={processing === p.id}
                                onClick={() => handleApprove(p.id)}
                              >
                                <CheckCircle size={13} /> Approve
                              </button>
                            )}
                            {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                              <button
                                type="button"
                                className="admin-btn admin-btn-red"
                                disabled={processing === p.id}
                                onClick={() => handleSuspend(p.id)}
                              >
                                <XCircle size={13} /> Suspend
                              </button>
                            )}
                            {(p.status === 'SUSPENDED' || p.status === 'ARCHIVED') && (
                              <button
                                type="button"
                                className="admin-btn admin-btn-green"
                                disabled={processing === p.id}
                                onClick={() => handleRestore(p)}
                              >
                                <ArrowCounterClockwise size={13} /> {p.status === 'SUSPENDED' ? 'Unsuspend' : 'Restore'}
                              </button>
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
                <button type="button" className="admin-page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span>Page {page} of {pagination.totalPages}</span>
                <button type="button" className="admin-page-btn" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
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
              <h3>Product details</h3>
              <button type="button" className="admin-detail-close" onClick={() => setSelected(null)} aria-label="Close"><X size={18} /></button>
            </div>

            <div className="admin-detail-body">
              {/* Image gallery */}
              {images(selected).length > 0 && (
                <div className="admin-product-images">
                  {images(selected).map((img, i) => (
                    <img key={i} src={resolveImg(img) || img} alt={`product ${i}`} className="admin-product-detail-img" />
                  ))}
                </div>
              )}

              <div className="admin-detail-section">
                <h4>Product info</h4>
                <div className="admin-detail-grid">
                  <div><label>Name</label><p>{selected.name}</p></div>
                  <div><label>Status</label><p><StatusBadge status={selected.status} /></p></div>
                  <div><label>Price</label><p>{peso(selected.price)}</p></div>
                  <div><label>Stock</label><p><StockCell stock={selected.stock} /></p></div>
                  <div>
                    <label><Store size={12} /> Store</label>
                    <p>
                      {selected.store?.slug
                        ? <Link to={`/store/${selected.store.slug}`} className="admin-link" target="_blank">{selected.store.name}</Link>
                        : selected.store?.name || '—'}
                    </p>
                  </div>
                  <div><label><Tag size={12} /> Category</label><p>{selected.category?.name || '—'}</p></div>
                  <div className="admin-detail-full">
                    <label>Description</label>
                    <p className="am-desc">{selected.description || '—'}</p>
                  </div>
                  {selected.moderationNote && (
                    <div className="admin-detail-full">
                      <label>Moderation note</label>
                      <p className="am-desc">{selected.moderationNote}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(selected.status === 'PENDING' || selected.status === 'APPROVED') && (
              <div className="admin-detail-footer">
                {selected.status === 'PENDING' && (
                  <button
                    type="button"
                    className="admin-btn admin-btn-green"
                    disabled={processing === selected.id}
                    onClick={() => handleApprove(selected.id)}
                  >
                    <CheckCircle size={15} /> Approve product
                  </button>
                )}
                <button
                  type="button"
                  className="admin-btn admin-btn-red"
                  disabled={processing === selected.id}
                  onClick={() => handleSuspend(selected.id)}
                >
                  <XCircle size={15} /> Suspend
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn-gray"
                  disabled={processing === selected.id}
                  onClick={() => handleArchive(selected.id)}
                >
                  <Archive size={15} /> Archive
                </button>
              </div>
            )}

            {(selected.status === 'SUSPENDED' || selected.status === 'ARCHIVED') && (
              <div className="admin-detail-footer">
                <button
                  type="button"
                  className="admin-btn admin-btn-green"
                  disabled={processing === selected.id}
                  onClick={() => handleRestore(selected)}
                >
                  <ArrowCounterClockwise size={15} />
                  {selected.status === 'SUSPENDED' ? 'Unsuspend product' : 'Restore product'}
                </button>
              </div>
            )}
          </>
        )}
      </DetailDrawer>
      <ReasonDialog
        open={Boolean(reasonAction)}
        title={
          reasonAction?.type === 'archive' ? 'Archive product?'
            : reasonAction?.type === 'bulk-suspend'
              ? `Suspend ${selectedSuspendable.length} product${selectedSuspendable.length === 1 ? '' : 's'}?`
              : 'Suspend product?'
        }
        message={
          reasonAction?.type === 'archive'
            ? 'The product will be archived. You may add an optional note for the seller.'
            : 'Suspended products are hidden from buyers. The seller will see this reason.'
        }
        confirmLabel={reasonAction?.type === 'archive' ? 'Archive' : 'Suspend'}
        placeholder={reasonAction?.type === 'archive' ? 'Reason (optional)' : 'Reason for suspension'}
        required={reasonAction?.type !== 'archive'}
        danger={reasonAction?.type !== 'archive'}
        loading={bulkProcessing || (reasonAction?.productId != null && processing === reasonAction.productId)}
        onConfirm={handleReasonConfirm}
        onCancel={() => setReasonAction(null)}
      />
    </AdminLayout>
  );
}
