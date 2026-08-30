import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Package, MagnifyingGlass as Search, CheckCircle, XCircle, Eye, X,
  Storefront as Store, Tag, Archive
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import Skeleton from '../components/ui/Skeleton';
import axios from '../lib/axios';
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
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('APPROVED');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(null);

  useEffect(() => {
    fetchProducts();
  }, [statusFilter, search, page]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const params = { pageSize: 20, page };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;

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

  const handleSuspend = async (productId) => {
    if (!window.confirm('Suspend this product? It will be hidden from buyers.')) return;
    setProcessing(productId);
    try {
      await axios.post(`/products/${productId}/suspend`);
      toast.success('Product suspended');
      setSelected(null);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to suspend');
    } finally {
      setProcessing(null);
    }
  };

  const handleArchive = async (productId) => {
    if (!window.confirm('Archive this product?')) return;
    setProcessing(productId);
    try {
      await axios.post(`/products/${productId}/archive`);
      toast.success('Product archived');
      setSelected(null);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to archive');
    } finally {
      setProcessing(null);
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
            <Package size={36} />
            <p>No {statusFilter.toLowerCase()} products</p>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
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
                      <tr key={p.id}>
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
      {selected && (
        <div className="admin-detail-overlay" onClick={() => setSelected(null)}>
          <div className="admin-detail-panel" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
