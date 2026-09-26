import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, PencilSimple as Edit2, Trash as Trash2, Eye, ArrowSquareOut,
  MagnifyingGlass as Search, WarningCircle as AlertCircle, CheckCircle, Clock, X, CircleNotch as Loader2,
  EyeSlash as EyeOff, Archive,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { resolveImg } from '../lib/media';
import './SellerDashboard.css';
import './SellerStore.css';
import './SellerProducts.css';
import { useCategories } from '../hooks/useReferenceData';
import SellerPageHead from '../components/seller/SellerPageHead';
import ProductForm from '../components/seller/ProductForm';

const STATUS_LABELS = {
  PENDING: { label: 'Pending Approval', cls: 'status-pending', icon: <Clock size={12} /> },
  APPROVED: { label: 'Live', cls: 'status-confirmed', icon: <CheckCircle size={12} /> },
  HIDDEN: { label: 'Hidden', cls: 'status-pending', icon: <EyeOff size={12} /> },
  SUSPENDED: { label: 'Suspended', cls: 'status-cancelled', icon: <AlertCircle size={12} /> },
  ARCHIVED: { label: 'Archived', cls: 'status-cancelled', icon: <Archive size={12} /> },
};

// Status filter tabs; the key is sent as `status` to GET /products/my/products.
const PRODUCT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'APPROVED', label: 'Live' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'HIDDEN', label: 'Hidden' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'ARCHIVED', label: 'Archived' },
];

const stockLevel = (product) => {
  const stock = Number(product?.stock ?? 0);
  if (stock <= 0) return 'out';
  const threshold = Number(product?.lowStockThreshold ?? 0);
  return stock <= threshold ? 'low' : 'ok';
};

const hasStockPerChoice = (product) => Array.isArray(product?.variations)
  && product.variations.some((v) => v?.stocks && Object.keys(v.stocks).length);

export default function SellerProducts() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const { categories } = useCategories();
  const [isLoading, setIsLoading] = useState(true);
  // Seeded from ?search= so a top-bar search result opens filtered.
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = searchParams.get('status');
    return PRODUCT_TABS.some((t) => t.key === fromUrl) ? fromUrl : 'all';
  });
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  // Inline restock: per-row draft quantity and the row currently saving.
  const [restockDrafts, setRestockDrafts] = useState({});
  const [restockingId, setRestockingId] = useState(null);

  // The form is a page of its own: /seller/products/new adds a product and
  // ?edit=<id> edits one, so the phone's back button closes it.
  const isNewRoute = /\/seller\/products\/new\/?$/.test(location.pathname) || searchParams.get('action') === 'new';
  const editParam = searchParams.get('edit');
  const [editingProduct, setEditingProduct] = useState(null);
  const showForm = isNewRoute || (!!editParam && !!editingProduct);

  // Bulk selection + confirm dialogs
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { type: 'delete-one'|'bulk-delete', product?, ids? }

  useEffect(() => {
    loadProducts();
  }, [pagination.page, search, statusFilter]);

  // Follows ?search= when it changes, so a second search from the top bar
  // re-filters instead of leaving the first term in place. Only a change to
  // the URL counts, so typing in this page's own box is left alone.
  const urlSearch = searchParams.get('search') || '';
  const lastUrlSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch === lastUrlSearch.current) return;
    lastUrlSearch.current = urlSearch;
    setSearch(urlSearch);
    setPagination((p) => ({ ...p, page: 1 }));
  }, [urlSearch]);

  // ?edit=<id> follows the URL: going back closes the form, and a reload
  // reopens it once the product is in the loaded list.
  useEffect(() => {
    if (!editParam) {
      if (editingProduct) setEditingProduct(null);
      return;
    }
    if (editingProduct?.id === editParam) return;
    const found = products.find((p) => p.id === editParam);
    if (found) setEditingProduct(found);
    else if (!isLoading) navigate('/seller/products', { replace: true });
  }, [editParam, products, isLoading]);

  // Opening or closing the form starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [showForm]);

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/products/my/products', {
        params: {
          page: pagination.page,
          pageSize: 15,
          search: search || undefined,
          status: statusFilter !== 'all' ? statusFilter : undefined,
        },
      });
      setProducts(res.data || []);
      if (res.pagination) {
        setPagination(p => ({ ...p, total: res.pagination.total, totalPages: res.pagination.totalPages }));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPagination(p => ({ ...p, page: 1 }));
    loadProducts();
  };

  const selectStatusTab = (key) => {
    if (key === statusFilter) return;
    setStatusFilter(key);
    setSelectedIds([]);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  // POST /products/:id/stock { delta } — the response is the updated product,
  // so the row is replaced in place instead of reloading the whole page.
  const handleRestock = async (product) => {
    const delta = parseInt(restockDrafts[product.id], 10);
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error('Enter how many to add (or a minus number to remove)');
      return;
    }
    setRestockingId(product.id);
    try {
      const res = await axios.post(`/products/${product.id}/stock`, { delta });
      const updated = res.data || {};
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...updated } : p)));
      setRestockDrafts((prev) => ({ ...prev, [product.id]: '' }));
      toast.success(delta > 0 ? `Added ${delta} to stock` : `Removed ${Math.abs(delta)} from stock`);
    } catch (err) {
      toast.error(err.message || 'Failed to update stock');
    } finally {
      setRestockingId(null);
    }
  };

  const openNew = () => navigate('/seller/products/new', { state: { fromList: true } });

  const openEdit = (product) => {
    setEditingProduct(product);
    navigate(`/seller/products?edit=${product.id}`, { state: { fromList: true } });
  };

  const closeForm = () => {
    if (location.state?.fromList) navigate(-1);
    // Opened from Shop setup ("Add your first product"): go back to it.
    else if (location.state?.fromSetup) navigate('/seller/setup', { replace: true });
    else navigate('/seller/products', { replace: true });
  };

  const handleSaved = (saved, { created }) => {
    if (created) {
      toast.success(saved?.status === 'APPROVED'
        ? 'Product added. It is now live.'
        : 'Product added. It will go live once approved.');
    } else {
      toast.success('Changes saved');
    }
    closeForm();
    loadProducts();
  };

  const handleDelete = (product) => {
    setConfirmState({ type: 'delete-one', product });
  };

  const confirmDeleteOne = async () => {
    const product = confirmState?.product;
    if (!product) return;
    setBulkLoading(true);
    try {
      await axios.delete(`/products/${product.id}`);
      toast.success('Product deleted');
      setSelectedIds((ids) => ids.filter((id) => id !== product.id));
      loadProducts();
      setConfirmState(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const runBulkAction = async (action) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await axios.patch('/products/bulk', { ids: selectedIds, action });
      toast.success(res.message || `${res.data?.updatedCount ?? 0} product(s) updated`);
      setSelectedIds([]);
      setConfirmState(null);
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleToggleVisibility = async (product) => {
    setBulkLoading(true);
    try {
      const action = product.status === 'HIDDEN' ? 'UNHIDE' : 'HIDE';
      await axios.patch('/products/bulk', { ids: [product.id], action });
      toast.success(action === 'HIDE' ? 'Product hidden from buyers' : 'Product is live again');
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to update product');
    } finally {
      setBulkLoading(false);
    }
  };

  if (showForm) {
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SellerPageHead
            className="pf-head"
            title={editingProduct && !isNewRoute ? 'Edit product' : 'Add a product'}
            subtitle="Fill in the steps below. Parts marked * are required."
          />
          <ProductForm
            key={isNewRoute ? 'new' : editingProduct?.id}
            product={isNewRoute ? null : editingProduct}
            categories={categories}
            onCancel={closeForm}
            onSaved={handleSaved}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="My Products"
          subtitle="Add, edit, and manage your inventory"
          actions={(
            <button className="btn-seller-primary" onClick={openNew}>
              <Plus size={16} /> Add Product
            </button>
          )}
        />

        {/* Bulk action bar */}
        {selectedIds.length > 0 && (
          <div className="seller-card products-bulk-bar">
            <span className="products-bulk-count">{selectedIds.length} selected</span>
            <div className="products-bulk-actions">
              <button className="btn-seller-outline" disabled={bulkLoading} onClick={() => runBulkAction('HIDE')}>
                <EyeOff size={14} /> Hide
              </button>
              <button className="btn-seller-outline" disabled={bulkLoading} onClick={() => runBulkAction('UNHIDE')}>
                <Eye size={14} /> Unhide
              </button>
              <button
                className="btn-seller-outline btn-danger-outline"
                disabled={bulkLoading}
                onClick={() => setConfirmState({ type: 'bulk-delete', ids: selectedIds })}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button className="seller-icon-btn" onClick={() => setSelectedIds([])} title="Clear selection" aria-label="Clear selection">
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Status filter tabs */}
        <div className="seller-tabs products-tabs">
          {PRODUCT_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`seller-tab ${statusFilter === t.key ? 'seller-tab--active' : ''}`}
              onClick={() => selectStatusTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="seller-card products-toolbar">
          <form onSubmit={handleSearchSubmit} className="products-search-form">
            <Search size={16} className="products-search-icon" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              className="products-search-input"
            />
            <button type="submit" className="products-search-btn">Search</button>
          </form>
        </div>

        {/* Products table */}
        <div className="seller-card">
          {isLoading ? (
            <Skeleton.Table cols={6} rows={6} />
          ) : products.length === 0 ? (
            <div className="seller-empty">
              <Package size={40} weight="fill" />
              <p>
                {statusFilter !== 'all' || search
                  ? 'No products match this filter.'
                  : 'No products yet. Tap "Add Product" to create your first listing.'}
              </p>
            </div>
          ) : (
            <>
              <table className="seller-table products-table">
                <thead>
                  <tr>
                    <th className="products-th-check" data-label="Select all">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === products.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all products"
                      />
                    </th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => {
                    const s = STATUS_LABELS[product.status] || { label: product.status, cls: '' };
                    const thumb = product.images?.[0];
                    const level = stockLevel(product);
                    const showNote = Boolean(product.moderationNote)
                      && (product.status === 'SUSPENDED' || product.status === 'ARCHIVED');
                    return (
                      <React.Fragment key={product.id}>
                      <tr className={showNote ? 'products-row--noted' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            aria-label={`Select ${product.name}`}
                          />
                        </td>
                        <td>
                          <div className="product-cell">
                            {thumb ? (
                              <img src={resolveImg(thumb) || thumb} alt={product.name} className="product-thumb" />
                            ) : (
                              <div className="product-thumb product-thumb--placeholder">
                                <Package size={16} />
                              </div>
                            )}
                            <span className="product-cell-name">{product.name}</span>
                          </div>
                        </td>
                        <td>{product.category?.name || '—'}</td>
                        <td>₱{Number(product.price).toFixed(2)}</td>
                        <td data-label="Stock">
                          <div className={`product-stock ${level !== 'ok' ? `product-stock--${level}` : ''}`}>
                            <span className="product-stock-line">
                              <span className="product-stock-label">Stock</span>
                              <span className="product-stock-value">{product.stock}</span>
                              {level === 'out' && (
                                <span className="seller-badge status-cancelled product-stock-badge">Out of stock</span>
                              )}
                              {level === 'low' && (
                                <span className="seller-badge status-pending product-stock-badge">Low stock</span>
                              )}
                            </span>
                            {hasStockPerChoice(product) ? (
                              <button type="button" className="btn-seller-outline product-restock-btn" onClick={() => openEdit(product)}>
                                Edit stock
                              </button>
                            ) : (
                            <form
                              className="product-restock"
                              onSubmit={(e) => { e.preventDefault(); handleRestock(product); }}
                            >
                              <input
                                type="number"
                                step="1"
                                inputMode="numeric"
                                className="form-input product-restock-input"
                                placeholder="Qty"
                                aria-label={`How many ${product.name} to add`}
                                value={restockDrafts[product.id] ?? ''}
                                onChange={(e) => setRestockDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))}
                                disabled={restockingId === product.id}
                              />
                              <button
                                type="submit"
                                className="btn-seller-outline product-restock-btn"
                                disabled={restockingId === product.id || !restockDrafts[product.id]}
                              >
                                {restockingId === product.id ? <Loader2 size={13} className="spin" /> : 'Add stock'}
                              </button>
                            </form>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`seller-badge ${s.cls}`}>
                            {s.icon} {s.label}
                          </span>
                        </td>
                        <td>
                          <div className="product-actions">
                            <button
                              className="seller-icon-btn product-action"
                              title="Edit"
                              aria-label={`Edit ${product.name}`}
                              onClick={() => openEdit(product)}
                            >
                              <Edit2 size={15} /><span>Edit</span>
                            </button>
                            {(product.status === 'APPROVED' || product.status === 'HIDDEN') && (
                              <button
                                className="seller-icon-btn product-action"
                                title={product.status === 'HIDDEN' ? 'Show to buyers again' : 'Hide from buyers'}
                                onClick={() => handleToggleVisibility(product)}
                                disabled={bulkLoading}
                              >
                                {product.status === 'HIDDEN' ? <Eye size={15} /> : <EyeOff size={15} />}
                                <span>{product.status === 'HIDDEN' ? 'Show' : 'Hide'}</span>
                              </button>
                            )}
                            <a
                              href={`/product/${product.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="seller-icon-btn product-action"
                              title="See it as a buyer"
                            >
                              <ArrowSquareOut size={15} /><span>View</span>
                            </a>
                            <button
                              className="seller-icon-btn seller-icon-btn--danger product-action"
                              title="Delete"
                              aria-label={`Delete ${product.name}`}
                              onClick={() => handleDelete(product)}
                            >
                              <Trash2 size={15} /><span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                      {showNote && (
                        <tr className="products-note-row">
                          <td colSpan={7}>
                            <div className="products-moderation-note">
                              <AlertCircle size={14} />
                              <span>
                                <strong>{product.status === 'SUSPENDED' ? 'Suspended by admin: ' : 'Archived by admin: '}</strong>
                                {product.moderationNote}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="products-pagination">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    className="btn-seller-outline pagination-btn"
                  >
                    Prev
                  </button>
                  <span>{pagination.page} / {pagination.totalPages}</span>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    className="btn-seller-outline pagination-btn"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmState?.type === 'delete-one'}
        title={`Delete "${confirmState?.product?.name}"?`}
        message="This product will be permanently removed from your store and cannot be undone."
        confirmLabel="Delete"
        danger
        loading={bulkLoading}
        onConfirm={confirmDeleteOne}
        onCancel={() => setConfirmState(null)}
      />

      <ConfirmDialog
        open={confirmState?.type === 'bulk-delete'}
        title={`Delete ${confirmState?.ids?.length || 0} product(s)?`}
        message="These products will be permanently removed from your store and cannot be undone."
        confirmLabel="Delete All"
        danger
        loading={bulkLoading}
        onConfirm={() => runBulkAction('DELETE')}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
