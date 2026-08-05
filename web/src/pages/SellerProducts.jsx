import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, Edit2, Trash2, Eye,
  Search, AlertCircle, CheckCircle, Clock, Save, X, Upload, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import './SellerDashboard.css';
import './SellerStore.css';
import './SellerProducts.css';

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  stock: '',
  categoryId: '',
  images: [],
};

const STATUS_LABELS = {
  PENDING: { label: 'Pending Approval', cls: 'status-pending', icon: <Clock size={12} /> },
  ACTIVE: { label: 'Active', cls: 'status-confirmed', icon: <CheckCircle size={12} /> },
  INACTIVE: { label: 'Inactive', cls: 'status-cancelled', icon: <AlertCircle size={12} /> },
  SUSPENDED: { label: 'Suspended', cls: 'status-cancelled', icon: <AlertCircle size={12} /> },
  ARCHIVED: { label: 'Archived', cls: 'status-cancelled', icon: <AlertCircle size={12} /> },
};

export default function SellerProducts() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });

  // Form state
  const [showForm, setShowForm] = useState(searchParams.get('action') === 'new');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadCategories();
    loadProducts();
  }, [pagination.page, search]);

  const loadCategories = async () => {
    try {
      const res = await axios.get('/categories');
      setCategories(res.data || []);
    } catch (_) { }
  };

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get('/products/my/products', {
        params: { page: pagination.page, pageSize: 15, search: search || undefined },
      });
      setProducts(res.data || []);
      if (res.pagination) {
        setPagination(p => ({ ...p, total: res.pagination.total, totalPages: res.pagination.totalPages }));
      }
    } catch (err) {
      toast.error('Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPagination(p => ({ ...p, page: 1 }));
    loadProducts();
  };

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setShowForm(true);
  };

  const openEdit = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || '',
      description: product.description || '',
      price: String(Number(product.price) || ''),
      stock: String(product.stock ?? ''),
      categoryId: product.categoryId || product.category?.id || '',
      images: Array.isArray(product.images) ? product.images : [],
    });
    setFormErrors({});
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Product name is required';
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) errs.price = 'Valid price is required';
    if (!form.categoryId) errs.categoryId = 'Category is required';
    if (form.stock !== '' && (isNaN(Number(form.stock)) || Number(form.stock) < 0)) errs.stock = 'Stock must be 0 or more';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        price: parseFloat(form.price),
        stock: form.stock !== '' ? parseInt(form.stock) : 0,
        categoryId: form.categoryId,
        images: Array.isArray(form.images) ? form.images.filter(Boolean) : [],
      };

      if (editingId) {
        await axios.put(`/products/${editingId}`, payload);
        toast.success('Product updated!');
      } else {
        await axios.post('/products', payload);
        toast.success('Product created! Pending admin approval.');
      }
      closeForm();
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/products/${product.id}`);
      toast.success('Product deleted');
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    }
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>My Products</h1>
            <p className="seller-welcome">Add, edit, and manage your inventory</p>
          </div>
          <div className="seller-header-actions">
            {!showForm && (
              <button className="btn-seller-primary" onClick={openNew}>
                <Plus size={16} /> Add Product
              </button>
            )}
          </div>
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="seller-card products-form-card">
            <div className="seller-card-header">
              <h2><Package size={18} /> {editingId ? 'Edit Product' : 'New Product'}</h2>
              <button className="seller-icon-btn" onClick={closeForm}><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="product-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Product Name <span className="required">*</span></label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Fresh Ampalaya (Bitter Gourd)"
                    className={`form-input ${formErrors.name ? 'form-input--error' : ''}`}
                  />
                  {formErrors.name && <span className="form-error">{formErrors.name}</span>}
                </div>
                <div className="form-group">
                  <label>Category <span className="required">*</span></label>
                  <select
                    value={form.categoryId}
                    onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
                    className={`form-select ${formErrors.categoryId ? 'form-input--error' : ''}`}
                  >
                    <option value="">Select category…</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {formErrors.categoryId && <span className="form-error">{formErrors.categoryId}</span>}
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Describe your product — freshness, variety, farm source..."
                  className="form-input form-textarea"
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Price (₱) <span className="required">*</span></label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={e => setForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="0.00"
                    className={`form-input ${formErrors.price ? 'form-input--error' : ''}`}
                  />
                  {formErrors.price && <span className="form-error">{formErrors.price}</span>}
                </div>
                <div className="form-group">
                  <label>Stock / Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock}
                    onChange={e => setForm(p => ({ ...p, stock: e.target.value }))}
                    placeholder="0"
                    className={`form-input ${formErrors.stock ? 'form-input--error' : ''}`}
                  />
                  {formErrors.stock && <span className="form-error">{formErrors.stock}</span>}
                </div>
              </div>

              <div className="form-group">
                <label>Product Images</label>
                <ProductImageUploader
                  images={form.images}
                  onChange={(imgs) => setForm(p => ({ ...p, images: imgs }))}
                />
                <span className="form-hint">Upload up to 10 photos (JPEG, PNG, WebP — max 5 MB each). The first image is the cover.</span>
              </div>

              <div className="form-actions">
                <button type="button" className="btn-seller-outline" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn-seller-primary" disabled={isSaving}>
                  <Save size={15} />
                  {isSaving ? 'Saving…' : editingId ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        )}

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
              <Package size={40} />
              <p>No products yet. Click "Add Product" to create your first listing.</p>
            </div>
          ) : (
            <>
              <table className="seller-table products-table">
                <thead>
                  <tr>
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
                    return (
                      <tr key={product.id}>
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
                        <td>{product.stock}</td>
                        <td>
                          <span className={`seller-badge ${s.cls}`}>
                            {s.icon} {s.label}
                          </span>
                        </td>
                        <td>
                          <div className="product-actions">
                            <button
                              className="seller-icon-btn"
                              title="Edit"
                              onClick={() => openEdit(product)}
                            >
                              <Edit2 size={15} />
                            </button>
                            <a
                              href={`/product/${product.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="seller-icon-btn"
                              title="View"
                            >
                              <Eye size={15} />
                            </a>
                            <button
                              className="seller-icon-btn seller-icon-btn--danger"
                              title="Delete"
                              onClick={() => handleDelete(product)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
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
    </div>
  );
}

const MAX_IMAGES = 10;

function ProductImageUploader({ images, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const list = Array.isArray(images) ? images : [];

  const pickFiles = () => inputRef.current?.click();

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_IMAGES - list.length;
    if (remaining <= 0) {
      toast.error(`You can upload up to ${MAX_IMAGES} images`);
      return;
    }
    const chosen = files.slice(0, remaining);
    if (files.length > remaining) {
      toast(`Only ${remaining} more image(s) can be added`);
    }

    setUploading(true);
    const uploaded = [];
    for (const file of chosen) {
      try {
        const res = await uploadImage(file);
        uploaded.push(res.url);
      } catch (err) {
        toast.error(err.message || 'Upload failed');
      }
    }
    if (uploaded.length) {
      onChange([...list, ...uploaded]);
      toast.success(`${uploaded.length} image(s) uploaded`);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  return (
    <div className="product-image-uploader">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple
        onChange={handleFiles}
        style={{ display: 'none' }}
      />
      <div className="product-image-grid">
        {list.map((src, idx) => (
          <div key={src + idx} className="product-image-tile">
            <img src={resolveImg(src) || src} alt={`Product image ${idx + 1}`} />
            <button
              type="button"
              className="product-image-remove"
              onClick={() => removeAt(idx)}
              aria-label="Remove image"
            >
              <X size={14} />
            </button>
            {idx === 0 && <span className="product-image-cover-badge">Cover</span>}
          </div>
        ))}
        {list.length < MAX_IMAGES && (
          <button
            type="button"
            className="product-image-add"
            onClick={pickFiles}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}
            <span>{uploading ? 'Uploading…' : 'Add photo'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
