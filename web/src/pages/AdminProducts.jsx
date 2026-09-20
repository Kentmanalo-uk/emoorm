import React, { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Package, MagnifyingGlass as Search, CheckCircle, XCircle, Eye, X,
  Storefront as Store, Tag, Archive, ArrowCounterClockwise,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import DetailDrawer from '../components/admin/DetailDrawer';
import { rowOpen, rowKeyOpen } from '../components/admin/rowClick';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
import ReasonDialog from '../components/admin/ReasonDialog';
import { resolveImg } from '../lib/media';
import '../components/admin/AdminLayout.css';
import './AdminSellers.css';

const STATUS_BADGE = {
  PENDING: 'admin-badge-pending',
  APPROVED: 'admin-badge-approved',
  HIDDEN: 'admin-badge-dismissed',
  SUSPENDED: 'admin-badge-suspended',
  ARCHIVED: 'admin-badge-dismissed',
};

export default function AdminProducts() {
  const [searchParams] = useSearchParams();
  const storeId = searchParams.get('storeId') || '';
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  // Seeded from ?search= so a top-bar search result opens filtered. The
  // status filter starts open in that case: a searched-for product may well
  // be pending or suspended, and the usual APPROVED default would hide it.
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('search') ? '' : 'APPROVED');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(null);
  const [reasonAction, setReasonAction] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, [statusFilter, search, page, storeId]);

  // Follows ?search= when it changes, so a second search from the top bar
  // re-filters instead of leaving the first term in place. Only a change to
  // the URL counts, so typing in this page's own box is left alone.
  const urlSearch = searchParams.get('search') || '';
  const lastUrlSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch === lastUrlSearch.current) return;
    lastUrlSearch.current = urlSearch;
    setSearch(urlSearch);
    setStatusFilter(urlSearch ? '' : 'APPROVED');
    setPage(1);
  }, [urlSearch]);

  const fetchProducts = async () => {
    setIsLoading(true);
    setSelectedIds([]);
    try {
      const params = { pageSize: 20, page };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      if (storeId) params.storeId = storeId;

      const res = await axios.get('/products', { params });
      setProducts(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (productId) => {
    setProcessing(productId);
    try {
      await axios.post(`/products/${productId}/approve`);
      toast.success('Product approved — now visible to buyers');
      setSelected(null);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to approve');
    } finally {
      setProcessing(null);
    }
  };

  // Undo a suspension or archive.
  const handleRestore = async (productId) => {
    setProcessing(productId);
    try {
      await axios.post(`/products/${productId}/restore`);
      toast.success('Product restored — visible to buyers again');
      setSelected(null);
      fetchProducts();
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
        const results = await Promise.allSettled(targets.map((p) => axios.post(`/products/${p.id}/suspend`, body)));
        summarize(results, 'Suspend');
        setSelectedIds([]);
        setReasonAction(null);
        fetchProducts();
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
    setBulkProcessing(true);
    try {
      const results = await Promise.allSettled(selectedPending.map((p) => axios.post(`/products/${p.id}/approve`)));
      summarize(results, 'Approve');
      setSelectedIds([]);
      fetchProducts();
    } finally {
      setBulkProcessing(false);
    }
  };

  const images = (p) => (Array.isArray(p?.images) ? p.images : []);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Product Approvals</h1>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">
            Products
            {pagination.total > 0 && (
              <span style={{ fontWeight: 400, color: '#64748b', fontSize: 14, marginLeft: 8 }}>
                ({pagination.total})
              </span>
            )}
          </h2>
          <div className="admin-toolbar">
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                className="admin-search-input"
                style={{ paddingLeft: 30 }}
                placeholder="Search products…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select
              className="admin-select"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            >
              <option value="APPROVED">Approved</option>
              <option value="PENDING">Pending</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="">All</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={6} rows={6} />
        ) : products.length === 0 ? (
          <div className="admin-empty">
            <Package size={36} weight="fill" />
            <p>No {statusFilter.toLowerCase()} products</p>
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
                              ? <img src={resolveImg(img) || img} alt={p.name} className="admin-product-thumb" />
                              : <div className="admin-product-thumb-placeholder"><Package size={16} /></div>}
                            <span className="admin-product-name">{p.name}</span>
                          </div>
                        </td>
                        <td>
                          {p.store
                            ? <Link to={`/store/${p.store.slug}`} className="admin-link" target="_blank">
                              {p.store.name}
                            </Link>
                            : '—'}
                        </td>
                        <td>{p.category?.name || '—'}</td>
                        <td>₱{Number(p.price).toFixed(2)}</td>
                        <td>{p.stock}</td>
                        <td>
                          <span className={`admin-badge ${STATUS_BADGE[p.status] || ''}`}>{p.status}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button className="admin-btn admin-btn-gray" onClick={() => setSelected(p)}>
                              <Eye size={13} /> View
                            </button>
                            {p.status === 'PENDING' && (
                              <button
                                className="admin-btn admin-btn-green"
                                disabled={processing === p.id}
                                onClick={() => handleApprove(p.id)}
                              >
                                <CheckCircle size={13} /> Approve
                              </button>
                            )}
                            {(p.status === 'PENDING' || p.status === 'APPROVED') && (
                              <button
                                className="admin-btn admin-btn-red"
                                disabled={processing === p.id}
                                onClick={() => handleSuspend(p.id)}
                              >
                                <XCircle size={13} /> Suspend
                              </button>
                            )}
                            {(p.status === 'SUSPENDED' || p.status === 'ARCHIVED') && (
                              <button
                                className="admin-btn admin-btn-green"
                                disabled={processing === p.id}
                                onClick={() => handleRestore(p.id)}
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
              <h3>Product Details</h3>
              <button className="admin-detail-close" onClick={() => setSelected(null)}><X size={18} /></button>
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
                <h4>Product Info</h4>
                <div className="admin-detail-grid">
                  <div><label>Name</label><p>{selected.name}</p></div>
                  <div><label>Status</label><p><span className={`admin-badge ${STATUS_BADGE[selected.status] || ''}`}>{selected.status}</span></p></div>
                  <div><label>Price</label><p>₱{Number(selected.price).toFixed(2)}</p></div>
                  <div><label>Stock</label><p>{selected.stock}</p></div>
                  <div><label><Store size={12} /> Store</label><p>{selected.store?.name || '—'}</p></div>
                  <div><label><Tag size={12} /> Category</label><p>{selected.category?.name || '—'}</p></div>
                  <div className="admin-detail-full">
                    <label>Description</label>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{selected.description || '—'}</p>
                  </div>
                  {selected.moderationNote && (
                    <div className="admin-detail-full">
                      <label>Moderation Note</label>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{selected.moderationNote}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {(selected.status === 'PENDING' || selected.status === 'APPROVED') && (
              <div className="admin-detail-footer">
                {selected.status === 'PENDING' && (
                  <button
                    className="admin-btn admin-btn-green"
                    disabled={processing === selected.id}
                    onClick={() => handleApprove(selected.id)}
                  >
                    <CheckCircle size={15} /> Approve Product
                  </button>
                )}
                <button
                  className="admin-btn admin-btn-red"
                  disabled={processing === selected.id}
                  onClick={() => handleSuspend(selected.id)}
                >
                  <XCircle size={15} /> Suspend
                </button>
                <button
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
                  className="admin-btn admin-btn-green"
                  disabled={processing === selected.id}
                  onClick={() => handleRestore(selected.id)}
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
            : reasonAction?.type === 'bulk-suspend' ? `Suspend ${selectedSuspendable.length} product(s)?`
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
