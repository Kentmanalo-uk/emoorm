import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, PencilSimple as Edit2, Trash as Trash2, Eye,
  MagnifyingGlass as Search, WarningCircle as AlertCircle, CheckCircle, Clock, FloppyDisk as Save, X, UploadSimple as Upload, CircleNotch as Loader2,
  EyeSlash as EyeOff, Archive,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
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
  returnPolicy: '',
  variations: [],
};

const RETURN_POLICY_PRESETS = [
  { label: 'No returns', value: 'No returns or refunds accepted unless the item is incorrect or damaged on arrival.' },
  { label: '7-day issue returns', value: 'Returns or refunds accepted within 7 days for incorrect or damaged items. Buyer must provide proof.' },
  { label: 'Perishable goods', value: 'For perishable goods, report incorrect or damaged items on delivery with photo proof.' },
];

const VARIATION_PRESETS = [
  { label: 'Size', name: 'Size', options: 'Small, Medium, Large' },
  { label: 'Color', name: 'Color', options: 'Red, Blue, Green' },
  { label: 'Weight', name: 'Weight', options: '250g, 500g, 1kg' },
  { label: 'Pack size', name: 'Pack Size', options: '1 piece, 3 pieces, 6 pieces' },
];

const STATUS_LABELS = {
  PENDING: { label: 'Pending Approval', cls: 'status-pending', icon: <Clock size={12} /> },
  APPROVED: { label: 'Live', cls: 'status-confirmed', icon: <CheckCircle size={12} /> },
  HIDDEN: { label: 'Hidden', cls: 'status-pending', icon: <EyeOff size={12} /> },
  SUSPENDED: { label: 'Suspended', cls: 'status-cancelled', icon: <AlertCircle size={12} /> },
  ARCHIVED: { label: 'Archived', cls: 'status-cancelled', icon: <Archive size={12} /> },
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

  // Bulk selection + confirm dialogs
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { type: 'delete-one'|'bulk-delete', product?, ids? }

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
      returnPolicy: product.returnPolicy || '',
      variations: Array.isArray(product.variations)
        ? product.variations.map((variation) => ({
          name: variation.name || '',
          options: Array.isArray(variation.options) ? variation.options.join(', ') : '',
          optionDraft: '',
        }))
        : [],
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
        returnPolicy: form.returnPolicy.trim() || null,
        variations: form.variations
          .map((variation) => ({
            name: variation.name.trim(),
            options: variation.options.split(',').map((option) => option.trim()).filter(Boolean),
          }))
          .filter((variation) => variation.name && variation.options.length),
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

  const addVariation = () => {
    setForm((current) => ({
      ...current,
      variations: [...current.variations, { name: '', options: '', optionDraft: '' }],
    }));
  };

  const updateVariation = (index, field, value) => {
    setForm((current) => ({
      ...current,
      variations: current.variations.map((variation, rowIndex) => (
        rowIndex === index ? { ...variation, [field]: value } : variation
      )),
    }));
  };

  const removeVariation = (index) => {
    setForm((current) => ({
      ...current,
      variations: current.variations.filter((_, rowIndex) => rowIndex !== index),
    }));
  };

  const addVariationOption = (index) => {
    setForm((current) => ({
      ...current,
      variations: current.variations.map((variation, rowIndex) => {
        if (rowIndex !== index) return variation;
        const option = variation.optionDraft.trim();
        if (!option) return variation;
        const options = variation.options.split(',').map((item) => item.trim()).filter(Boolean);
        if (!options.some((item) => item.toLowerCase() === option.toLowerCase())) options.push(option);
        return { ...variation, options: options.join(', '), optionDraft: '' };
      }),
    }));
  };

  const removeVariationOption = (variationIndex, optionToRemove) => {
    setForm((current) => ({
      ...current,
      variations: current.variations.map((variation, rowIndex) => {
        if (rowIndex !== variationIndex) return variation;
        return {
          ...variation,
          options: variation.options.split(',').map((item) => item.trim()).filter(
            (item) => item && item !== optionToRemove
          ).join(', '),
        };
      }),
    }));
  };

  const applyReturnPolicyPreset = (value) => {
    setForm((current) => ({ ...current, returnPolicy: value }));
  };

  const addVariationPreset = (preset) => {
    setForm((current) => {
      const existingIndex = current.variations.findIndex(
        (variation) => variation.name.trim().toLowerCase() === preset.name.toLowerCase()
      );
      if (existingIndex >= 0) {
        return {
          ...current,
          variations: current.variations.map((variation, index) => (
            index === existingIndex ? { ...variation, options: preset.options } : variation
          )),
        };
      }
      return {
        ...current,
        variations: [...current.variations, { name: preset.name, options: preset.options, optionDraft: '' }],
      };
    });
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

              <div className="product-optional-section">
                <div className="product-optional-heading">
                  <div>
                    <h3>Return Policy <span>Optional</span></h3>
                    <p>Tell buyers what returns or refunds you accept for this product.</p>
                  </div>
                </div>
                <div className="product-preset-row" aria-label="Return policy presets">
                  {RETURN_POLICY_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.label}
                      className={`product-preset-btn ${form.returnPolicy === preset.value ? 'is-selected' : ''}`}
                      onClick={() => applyReturnPolicyPreset(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <span className="product-custom-hint">Choose a starting point or write your own policy below.</span>
                <textarea
                  value={form.returnPolicy}
                  onChange={(e) => setForm((p) => ({ ...p, returnPolicy: e.target.value }))}
                  placeholder="Example: Returns accepted within 7 days for damaged or incorrect items."
                  className="form-input form-textarea"
                  rows={3}
                  maxLength={2000}
                />
              </div>

              <div className="product-optional-section">
                <div className="product-optional-heading">
                  <div>
                    <h3>Product Variations <span>Optional</span></h3>
                    <p>Add choices buyers must select, such as Size, Color, or Weight.</p>
                  </div>
                  <button type="button" className="btn-seller-outline" onClick={addVariation}>
                    <Plus size={14} /> Add Variation
                  </button>
                </div>
                <div className="product-preset-row" aria-label="Common variation presets">
                  {VARIATION_PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.label}
                      className="product-preset-btn"
                      onClick={() => addVariationPreset(preset)}
                    >
                      <Plus size={12} /> {preset.label}
                    </button>
                  ))}
                </div>
                {form.variations.length === 0 ? (
                  <p className="product-variation-empty">No variations added. The product will have one default option.</p>
                ) : (
                  <div className="product-variation-list">
                    {form.variations.map((variation, index) => (
                      <div className="product-variation-row" key={`variation-${index}`}>
                        <input
                          className="form-input"
                          value={variation.name}
                          onChange={(e) => updateVariation(index, 'name', e.target.value)}
                          placeholder="Variation name, e.g. Size"
                          aria-label="Variation name"
                        />
                        <div className="product-option-editor">
                          <div className="product-option-chips">
                            {variation.options.split(',').map((option) => option.trim()).filter(Boolean).map((option) => (
                              <span className="product-option-chip" key={option}>
                                {option}
                                <button
                                  type="button"
                                  onClick={() => removeVariationOption(index, option)}
                                  aria-label={`Remove ${option}`}
                                >
                                  <X size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="product-option-add">
                            <input
                              className="form-input"
                              value={variation.optionDraft || ''}
                              onChange={(e) => updateVariation(index, 'optionDraft', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  addVariationOption(index);
                                }
                              }}
                              placeholder="Add an option"
                              aria-label="Add variation option"
                            />
                            <button type="button" className="product-option-add-btn" onClick={() => addVariationOption(index)}>
                              <Plus size={13} /> Add
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="seller-icon-btn btn-danger-outline"
                          onClick={() => removeVariation(index)}
                          aria-label={`Remove variation ${index + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
              <button className="seller-icon-btn" onClick={() => setSelectedIds([])} title="Clear selection">
                <X size={15} />
              </button>
            </div>
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
              <Package size={40} weight="fill" />
              <p>No products yet. Click "Add Product" to create your first listing.</p>
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
                    return (
                      <tr key={product.id}>
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
                        <td data-label="Stock">{product.stock}</td>
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
                            {(product.status === 'APPROVED' || product.status === 'HIDDEN') && (
                              <button
                                className="seller-icon-btn"
                                title={product.status === 'HIDDEN' ? 'Unhide (make live again)' : 'Hide from buyers'}
                                onClick={() => handleToggleVisibility(product)}
                                disabled={bulkLoading}
                              >
                                {product.status === 'HIDDEN' ? <Eye size={15} /> : <EyeOff size={15} />}
                              </button>
                            )}
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
