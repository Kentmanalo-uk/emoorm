import { useRef, useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Plus, PencilSimple as Pencil, Trash as Trash2, X, Check, UploadSimple as Upload, Image as ImageIcon, CircleNotch as Loader2, Basket, CookingPot, Cow } from '../lib/icons';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import { CategoryStyleSettings } from '../components/admin/PlatformSettings';
import AdminFormPage, { AdminFormLoading, AdminFormMissing } from '../components/admin/AdminFormPage';
import Skeleton from '../components/ui/Skeleton';
import LoadFailed from '../components/ui/LoadFailed';
import { CountTag, StatusSwitch } from '../components/admin/AdminBits';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { IMAGE_ACCEPT } from '../lib/uploadableImage';
import { useReferenceInvalidation } from '../hooks/useReferenceData';
import { resolveImg } from '../lib/media';
import EmptyArt from '../components/ui/EmptyArt';
import CategoryIcon, { CategoryIconGradients } from '../components/CategoryIcon';
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS, categoryIconKey } from '../lib/categoryIcons';
import '../components/admin/AdminLayout.css';
import './AdminCategories.css';
import { confirmAction } from '../lib/confirm';

const BASE = '/admin/categories';

/**
 * A category's kind decides the "What kind?" question sellers get when they
 * add a product in it (kindChoices in lib/productKinds.js). Products already
 * listed keep their own kind when it changes.
 */
const KINDS = [
  { key: 'GOODS', label: 'Goods', Icon: Basket, hint: 'Regular products with stock. Sellers get no extra question.' },
  { key: 'FOOD', label: 'Food', Icon: CookingPot, hint: 'Sellers also pick: packed product, ready to eat today, or paluto (cooked to order).' },
  { key: 'LIVESTOCK', label: 'Livestock', Icon: Cow, hint: 'Sellers also pick: live animal sold per head, or meat and other products.' },
];
const kindOf = (cat) => KINDS.find((k) => k.key === cat?.kind) || KINDS[0];

function KindPill({ category }) {
  const { key, label, Icon } = kindOf(category);
  return (
    <span className={`admin-cat-kind-pill is-${key.toLowerCase()}`}>
      <Icon size={13} weight="fill" aria-hidden="true" />
      {label}
    </span>
  );
}

const EMPTY_FORM = { name: '', description: '', image: '', icon: '', kind: 'GOODS' };

/*
 * Categories: the list. A category is made or edited on a page of its own
 * (/admin/categories/new, /admin/categories/<id>/edit).
 */
export default function AdminCategories() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const creating = pathname.replace(/\/$/, '') === `${BASE}/new`;
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [toggling, setToggling] = useState(null);
  // Products in each category (null until known): Delete waits for it.
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  // Categories are cached app-wide; refresh those readers after every edit.
  const invalidate = useReferenceInvalidation();

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      // Browsers may keep GET /categories for 15 minutes (publicCache): the
      // page that edits them always asks the server, so a save shows at once.
      const [res, countRes] = await Promise.all([
        axios.get('/categories', { params: { includeInactive: true, at: Date.now() }, quiet: true }),
        axios.get('/categories/admin/product-counts', { quiet: true }).catch(() => null),
      ]);
      setCategories(res.data || []);
      setCounts(countRes?.data || null);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const changed = () => {
    fetchCategories();
    invalidate.categories();
    invalidate.products();
  };

  if (creating || id) {
    const editing = id ? categories.find((c) => c.id === id) : null;
    let content;
    if (id && isLoading && !editing) content = <AdminFormLoading backTo={BASE} backLabel="Categories" />;
    else if (id && !editing) content = <AdminFormMissing backTo={BASE} backLabel="Categories" what="category" />;
    else {
      content = (
        <CategoryForm
          key={id || 'new'}
          category={editing}
          onImageSaved={changed}
          onSaved={() => { navigate(BASE); changed(); }}
          onCancel={() => navigate(BASE)}
        />
      );
    }
    return <AdminLayout><CategoryIconGradients />{content}</AdminLayout>;
  }

  const countOf = (cat) => counts?.[cat.id]?.products ?? 0;

  const handleToggle = async (cat) => {
    const n = countOf(cat);
    const ok = await confirmAction(cat.isActive ? {
      title: `Hide "${cat.name}"?`,
      message: `Buyers stop seeing it in the category lists and sellers can't pick it for new products.${n ? ` The ${n} product${n === 1 ? '' : 's'} already in it ${n === 1 ? 'is' : 'are'} not changed; move ${n === 1 ? 'it' : 'them'} to another category if they should still be found by category.` : ''}`,
      confirmLabel: 'Hide category',
      danger: n > 0,
    } : {
      title: `Show "${cat.name}" again?`,
      message: 'Buyers see it in the category lists and sellers can pick it again.',
      confirmLabel: 'Show category',
    });
    if (!ok) return;
    setToggling(cat.id);
    try {
      await axios.post(`/categories/${cat.id}/toggle`);
      toast.success(cat.isActive ? `${cat.name} is hidden` : `${cat.name} is shown`);
      changed();
    } catch (err) {
      toast.error(err.message || 'Failed to toggle category');
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (cat) => {
    if (!(await confirmAction({ title: `Delete "${cat.name}"?`, message: 'It has no products. This cannot be undone.', confirmLabel: 'Delete', danger: true }))) return;
    setDeleting(cat.id);
    try {
      await axios.delete(`/categories/${cat.id}`);
      toast.success('Category deleted');
      changed();
    } catch (err) {
      toast.error(err.message || 'Failed to delete category');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminLayout>
      <CategoryIconGradients />
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Categories</h1>
          <p className="admin-page-sub">What buyers browse by, and what sellers are asked when they list a product in each.</p>
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => navigate(`${BASE}/new`)}>
          <Plus size={14} /> New category
        </button>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <h2 className="admin-card-title">Categories {categories.length > 0 && <CountTag n={categories.length} />}</h2>
        </div>

        {isLoading ? (
          <Skeleton.Table cols={7} rows={6} />
        ) : loadError ? (
          <LoadFailed onRetry={fetchCategories} what="the categories" compact />
        ) : categories.length === 0 ? (
          <div className="admin-empty"><EmptyArt name="categories" size={104} /><p>No categories yet</p></div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Image</th>
                  <th>Kind</th>
                  <th>Products</th>
                  <th>Description</th>
                  <th>Shown</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const n = countOf(cat);
                  return (
                    <tr key={cat.id}>
                      <td>
                        <span className="admin-cat-name">
                          <span className="admin-cat-thumb admin-cat-thumb--icon" title={cat.icon ? CATEGORY_ICONS[cat.icon]?.label : 'Icon: auto, from the name'}>
                            <CategoryIcon category={cat} size={22} />
                          </span>
                          <strong>{cat.name}</strong>
                        </span>
                      </td>
                      <td className="admin-hide-phone">
                        <div className="admin-cat-thumb">
                          {cat.image ? (
                            <img src={resolveImg(cat.image)} alt="" />
                          ) : (
                            <ImageIcon size={16} strokeWidth={1.4} />
                          )}
                        </div>
                      </td>
                      <td><KindPill category={cat} /></td>
                      <td>
                        {counts ? (
                          <span title={`${counts[cat.id]?.approved ?? 0} approved`}>{n}</span>
                        ) : '—'}
                      </td>
                      <td className="admin-cat-desc admin-hide-phone">{cat.description || '—'}</td>
                      <td>
                        <StatusSwitch
                          on={cat.isActive}
                          busy={toggling === cat.id}
                          label={`Show ${cat.name} to buyers and sellers`}
                          onToggle={() => handleToggle(cat)}
                        />
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button type="button" className="admin-btn admin-btn-gray" onClick={() => navigate(`${BASE}/${cat.id}/edit`)}>
                            <Pencil size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn-gray admin-cat-delete"
                            disabled={deleting === cat.id || n > 0 || !counts}
                            onClick={() => handleDelete(cat)}
                            title={n > 0 ? `Has ${n} product${n === 1 ? '' : 's'}: move ${n === 1 ? 'it' : 'them'} to another category first, or hide the category` : undefined}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <CategoryStyleSettings />
    </AdminLayout>
  );
}

/* ── A category's own page: the form, and how it looks ─────── */

function CategoryPreview({ form }) {
  const kind = kindOf(form);
  const name = form.name.trim() || 'Category name';
  return (
    <div className="admin-card afp-panel">
      <h2 className="afp-panel-title">How it looks</h2>
      <div className="admin-cat-preview">
        <div className="admin-cat-preview-tile">
          <span className="admin-cat-preview-icon"><CategoryIcon iconKey={form.icon || categoryIconKey({ name: form.name })} size={30} /></span>
          <span>{name}</span>
          <small>Homepage, as icons</small>
        </div>
        <div className="admin-cat-preview-tile">
          <span className="admin-cat-preview-image">
            {form.image ? <img src={resolveImg(form.image)} alt="" /> : <ImageIcon size={22} />}
          </span>
          <span>{name}</span>
          <small>Homepage, as images</small>
        </div>
      </div>
      <p className="afp-panel-note">
        <strong>{kind.label}:</strong> {kind.hint}
        {form.description.trim() ? ` Shown with it: “${form.description.trim()}”.` : ''}
      </p>
    </div>
  );
}

function CategoryForm({ category, onImageSaved, onSaved, onCancel }) {
  // icon: '' = Auto (picked from the name).
  const [form, setForm] = useState(() => (category
    ? { name: category.name, description: category.description || '', image: category.image || '', icon: category.icon || '', kind: kindOf(category).key }
    : EMPTY_FORM));
  const [savedImage, setSavedImage] = useState(category?.image || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const [initial, setInitial] = useState(form);
  useUnsavedChanges(!saving && JSON.stringify(form) !== JSON.stringify(initial));

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Any photo goes: uploadImage shrinks it, the server converts HEIC and the like.
      const { url } = await uploadImage(file);
      setForm((f) => ({ ...f, image: url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveImage = async () => {
    setSaving(true);
    try {
      await axios.put(`/categories/${category.id}`, { image: form.image || null });
      toast.success(form.image ? 'Category image saved' : 'Category image removed');
      setSavedImage(form.image || '');
      setInitial((i) => ({ ...i, image: form.image || '' }));
      onImageSaved();
    } catch (err) {
      toast.error(err.message || 'Failed to save image');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      if (category) {
        await axios.put(`/categories/${category.id}`, form);
        toast.success('Category updated');
      } else {
        await axios.post('/categories', form);
        toast.success('Category created');
      }
      onSaved();
    } catch (err) {
      toast.error(err.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormPage
      backTo={BASE}
      backLabel="Categories"
      title={category ? `Edit ${category.name}` : 'New category'}
      subtitle="A group of products buyers browse, and what sellers are asked when they list in it."
      aside={<CategoryPreview form={form} />}
    >
      <form onSubmit={handleSave} className="admin-cat-form">
        <div className="admin-form-row">
          <div className="admin-form-field">
            <label htmlFor="admin-cat-name">Name *</label>
            <input
              id="admin-cat-name"
              className="admin-search-input admin-cat-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Fresh Produce"
              required
            />
          </div>
          <div className="admin-form-field">
            <label>Category image</label>
            <div className="admin-cat-image-row">
              <div className="admin-cat-image-preview">
                {form.image ? (
                  <img src={resolveImg(form.image)} alt="" />
                ) : (
                  <ImageIcon size={20} strokeWidth={1.4} />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={IMAGE_ACCEPT}
                onChange={handleImageFile}
                hidden
              />
              <button
                type="button"
                className="admin-btn admin-btn-gray"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
                {uploading ? 'Uploading…' : (form.image ? 'Replace' : 'Upload image')}
              </button>
              {form.image && (
                <button
                  type="button"
                  className="admin-btn admin-btn-gray"
                  onClick={() => setForm((f) => ({ ...f, image: '' }))}
                >
                  <X size={13} /> Remove
                </button>
              )}
              {category && (
                <button
                  type="button"
                  className="admin-btn admin-btn-green"
                  onClick={handleSaveImage}
                  disabled={saving || uploading || (form.image || '') === savedImage}
                  title="Save just the image to this category"
                >
                  <Check size={13} /> {saving ? 'Saving…' : 'Save image'}
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="admin-form-field">
          <label id="admin-cat-kind-label">Kind</label>
          <p className="admin-cat-icon-help">What sellers are asked when they add a product here. Products already listed keep their kind.</p>
          <div className="admin-cat-kinds" role="radiogroup" aria-labelledby="admin-cat-kind-label">
            {KINDS.map(({ key, label, hint, Icon }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={form.kind === key}
                className={`admin-cat-kind-opt is-${key.toLowerCase()}${form.kind === key ? ' is-on' : ''}`}
                onClick={() => setForm((f) => ({ ...f, kind: key }))}
              >
                <span className="admin-cat-kind-icon" aria-hidden="true"><Icon size={18} weight="fill" /></span>
                <span className="admin-cat-kind-text">
                  <strong>{label}</strong>
                  <span>{hint}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-form-field">
          <label>Homepage icon</label>
          <p className="admin-cat-icon-help">Shown when Homepage categories (under the list on the Categories page) is set to Icons.</p>
          <div className="admin-cat-icons" role="radiogroup" aria-label="Homepage icon">
            <button
              type="button"
              role="radio"
              aria-checked={!form.icon}
              className={`admin-cat-icon-opt is-auto${!form.icon ? ' is-on' : ''}`}
              onClick={() => setForm((f) => ({ ...f, icon: '' }))}
              title="Picked from the category's name"
            >
              <CategoryIcon iconKey={categoryIconKey({ name: form.name })} size={24} />
              <span>Auto</span>
            </button>
            {CATEGORY_ICON_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={form.icon === key}
                className={`admin-cat-icon-opt${form.icon === key ? ' is-on' : ''}`}
                onClick={() => setForm((f) => ({ ...f, icon: key }))}
                title={CATEGORY_ICONS[key].label}
              >
                <CategoryIcon iconKey={key} size={24} />
                <span>{CATEGORY_ICONS[key].label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-form-field">
          <label htmlFor="admin-cat-description">Description</label>
          <input
            id="admin-cat-description"
            className="admin-search-input admin-cat-input"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Short description…"
          />
        </div>
        <div className="afp-actions">
          <button type="submit" className="admin-btn admin-btn-green" disabled={saving}>
            <Check size={14} /> {saving ? 'Saving…' : (category ? 'Save Changes' : 'Create')}
          </button>
          <button type="button" className="admin-btn admin-btn-gray" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </AdminFormPage>
  );
}
