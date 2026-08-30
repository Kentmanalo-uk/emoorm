import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Storefront as Store, FloppyDisk as Save, WarningCircle as AlertCircle, UploadSimple as Upload, Trash as Trash2, Palette, Image as ImageIcon, Gear as Settings } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import './SellerDashboard.css';
import './SellerStore.css';

const DEFAULT_PRIMARY = '#059669';
const DEFAULT_SECONDARY = '#f59e0b';
const DESCRIPTION_MAX = 500;
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

export default function SellerStore() {
  const [store, setStore] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    address: '',
    contactNumber: '',
    isActive: true,
    logo: '',
    coverImage: '',
    bannerImage: '',
    primaryColor: DEFAULT_PRIMARY,
    secondaryColor: DEFAULT_SECONDARY,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [deactivateConfirm, setDeactivateConfirm] = useState(false);

  useEffect(() => {
    loadStore();
  }, []);

  const loadStore = async () => {
    try {
      const res = await axios.get('/stores/my/store');
      setStore(res.data);
      const next = {
        name: res.data.name || '',
        description: res.data.description || '',
        address: res.data.address || '',
        contactNumber: res.data.contactNumber || '',
        isActive: res.data.isActive ?? true,
        logo: res.data.logo || '',
        coverImage: res.data.coverImage || '',
        bannerImage: res.data.bannerImage || '',
        primaryColor: res.data.primaryColor || DEFAULT_PRIMARY,
        secondaryColor: res.data.secondaryColor || DEFAULT_SECONDARY,
      };
      setForm(next);
      setSavedSnapshot(JSON.stringify(next));
    } catch (err) {
      if (err.status === 404 || (typeof err.message === 'string' && err.message.includes('404'))) {
        setIsNew(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isDirty = savedSnapshot !== null && JSON.stringify(form) !== savedSnapshot;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleUpload = async (field, file) => {
    if (!file) return;
    setUploadingField(field);
    try {
      const res = await uploadImage(file);
      setForm((p) => ({ ...p, [field]: res.url }));
      toast.success('Image uploaded');
    } catch (err) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploadingField(null);
    }
  };

  const validate = () => {
    if (!form.name.trim()) {
      toast.error('Store name is required');
      return false;
    }
    if (form.contactNumber && !PH_MOBILE_REGEX.test(form.contactNumber.trim())) {
      toast.error('Enter a valid PH mobile number (e.g. 09171234567)');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    // Deactivating an existing, currently-active store hides it from all buyers — confirm first.
    if (!isNew && store?.isActive && !form.isActive) {
      setDeactivateConfirm(true);
      return;
    }
    await saveStore();
  };

  const saveStore = async () => {
    setIsSaving(true);
    try {
      let saved;
      if (isNew) {
        const res = await axios.post('/stores', form);
        saved = res.data;
        setStore(saved);
        setIsNew(false);
        toast.success('Store created successfully!');
      } else {
        const res = await axios.put(`/stores/${store.id}`, form);
        saved = res.data;
        setStore(saved);
        toast.success('Store updated!');
      }
      setSavedSnapshot(JSON.stringify(form));
    } catch (err) {
      toast.error(err.message || 'Failed to save store');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeactivateAndSave = async () => {
    setDeactivateConfirm(false);
    await saveStore();
  };

  const resetColors = () => {
    setForm((p) => ({ ...p, primaryColor: DEFAULT_PRIMARY, secondaryColor: DEFAULT_SECONDARY }));
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>{isNew ? 'Create Your Store' : 'Store Settings'}</h1>
            <p className="seller-welcome">Your public storefront details</p>
          </div>
          {!isNew && isDirty && (
            <span className="store-unsaved-badge">
              <AlertCircle size={13} /> Unsaved changes
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="seller-card">
            <Skeleton.Text lines={2} height={14} />
            <div style={{ height: 12 }} />
            <Skeleton.Text lines={4} height={12} />
            <div style={{ height: 12 }} />
            <Skeleton height={38} width={140} radius={8} />
          </div>
        ) : (
          <div className="store-settings-grid">
            <div className="store-settings-main">
            <div className="seller-card">
              <div className="seller-card-header">
                <h2><Store size={18} /> Store Information</h2>
              </div>
              <form onSubmit={handleSubmit} className="store-form">
                <div className="form-group">
                  <label>Store Name <span className="required">*</span></label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Maria's Fresh Farm"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>Description</label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Tell buyers about your store and what you sell..."
                    className="form-input form-textarea"
                    rows={4}
                    maxLength={DESCRIPTION_MAX}
                  />
                  <span className="form-hint store-char-count">
                    {form.description.length}/{DESCRIPTION_MAX}
                  </span>
                </div>

                <div className="form-group">
                  <label>Store Address</label>
                  <input
                    type="text"
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    placeholder="Barangay, Municipality, Oriental Mindoro"
                    className="form-input"
                  />
                </div>

                <div className="form-group">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    name="contactNumber"
                    value={form.contactNumber}
                    onChange={handleChange}
                    placeholder="09XXXXXXXXX"
                    className="form-input"
                  />
                </div>

                {!isNew && (
                  <div className="form-group form-toggle">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        name="isActive"
                        checked={form.isActive}
                        onChange={handleChange}
                      />
                      <span className="toggle-text">
                        Store is <strong>{form.isActive ? 'Active' : 'Inactive'}</strong>
                        {!form.isActive && (
                          <span className="toggle-warn">
                            <AlertCircle size={14} /> Buyers won't see your store or products
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )}

                <div className="form-actions">
                  <button type="submit" className="btn-seller-primary" disabled={isSaving}>
                    <Save size={16} />
                    {isSaving ? 'Saving…' : isNew ? 'Create Store' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Branding: logo + banner */}
            {!isNew && (
              <div className="seller-card">
                <div className="seller-card-header">
                  <h2><ImageIcon size={16} /> Branding</h2>
                </div>
                <div className="store-branding-body">
                  <div className="branding-row">
                    <div className="branding-label">
                      <strong>Shop Logo</strong>
                      <small>Square image, at least 200×200px.</small>
                    </div>
                    <ImageUploader
                      value={form.logo}
                      onChange={(url) => setForm((p) => ({ ...p, logo: url }))}
                      onFile={(file) => handleUpload('logo', file)}
                      uploading={uploadingField === 'logo'}
                      shape="circle"
                    />
                  </div>

                  <div className="branding-divider" />

                  <div className="branding-row">
                    <div className="branding-label">
                      <strong>Cover Banner</strong>
                      <small>Wide image (recommended 1600×400px).</small>
                    </div>
                    <ImageUploader
                      value={form.bannerImage || form.coverImage}
                      onChange={(url) => setForm((p) => ({ ...p, bannerImage: url }))}
                      onFile={(file) => handleUpload('bannerImage', file)}
                      uploading={uploadingField === 'bannerImage'}
                      shape="banner"
                    />
                  </div>
                </div>
                <div className="form-actions branding-actions">
                  <button type="button" className="btn-seller-primary" onClick={handleSubmit} disabled={isSaving}>
                    <Save size={16} />
                    {isSaving ? 'Saving…' : 'Save Branding'}
                  </button>
                </div>
              </div>
            )}

            {/* Theme colors */}
            {!isNew && (
              <div className="seller-card">
                <div className="seller-card-header">
                  <h2><Palette size={16} /> Theme Colors</h2>
                  <button type="button" className="btn-seller-outline" onClick={resetColors}>
                    Reset defaults
                  </button>
                </div>
                <div className="store-theme-body">
                  <div className="theme-picker-row">
                    <ColorPicker
                      label="Primary color"
                      hint="Used for buttons, links, and highlights."
                      value={form.primaryColor}
                      onChange={(v) => setForm((p) => ({ ...p, primaryColor: v }))}
                    />
                    <ColorPicker
                      label="Accent color"
                      hint="Used for secondary highlights and badges."
                      value={form.secondaryColor}
                      onChange={(v) => setForm((p) => ({ ...p, secondaryColor: v }))}
                    />
                  </div>

                  <ThemePreview
                    name={form.name || 'Your Store'}
                    logo={form.logo}
                    banner={form.bannerImage || form.coverImage}
                    primary={form.primaryColor}
                    secondary={form.secondaryColor}
                  />
                </div>
                <div className="form-actions branding-actions">
                  <button type="button" className="btn-seller-primary" onClick={handleSubmit} disabled={isSaving}>
                    <Save size={16} />
                    {isSaving ? 'Saving…' : 'Save Theme'}
                  </button>
                </div>
              </div>
            )}
            </div>

            <div className="store-settings-side">
            {/* Store slug / link */}
            {store?.slug && (
              <div className="seller-card store-preview-card">
                <div className="seller-card-header">
                  <h2>Public Store Link</h2>
                </div>
                <div className="store-slug-info">
                  <p className="store-slug-label">Your store URL:</p>
                  <a
                    href={`/store/${store.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="store-slug-link"
                  >
                    emoorm.app/store/{store.slug}
                  </a>
                </div>
              </div>
            )}

            {/* Danger zone / account-level shop controls now live on a dedicated Settings page */}
            {!isNew && (
              <div className="seller-card store-settings-pointer">
                <div className="seller-card-header">
                  <h2><Settings size={16} /> More Shop Controls</h2>
                </div>
                <div className="store-settings-pointer-body">
                  <p>Deleting your shop and other account-level shop settings now live on a dedicated Settings page.</p>
                  <Link to="/seller/settings" className="btn-seller-outline">
                    Go to Shop Settings
                  </Link>
                </div>
              </div>
            )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deactivateConfirm}
        title="Deactivate your store?"
        message="Buyers won't see your store or any of your products while it's inactive. You can reactivate anytime from this page."
        confirmLabel="Deactivate & Save"
        danger
        loading={isSaving}
        onConfirm={confirmDeactivateAndSave}
        onCancel={() => setDeactivateConfirm(false)}
      />
    </div>
  );
}

function ImageUploader({ value, onChange, onFile, uploading, shape = 'circle' }) {
  const src = value ? resolveImg(value) : null;
  const cls = `img-uploader img-uploader--${shape}`;
  return (
    <div className={cls}>
      {src ? (
        <>
          <div className="img-uploader-preview">
            <img src={src} alt="" />
          </div>
          <div className="img-uploader-actions">
            <label className="btn-seller-outline">
              <Upload size={14} /> Replace
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => onFile(e.target.files?.[0])}
                disabled={uploading}
                hidden
              />
            </label>
            <button
              type="button"
              className="btn-seller-outline btn-danger-outline"
              onClick={() => onChange('')}
            >
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </>
      ) : (
        <label className="img-uploader-empty">
          <Upload size={18} />
          <span>{uploading ? 'Uploading…' : 'Upload image'}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onFile(e.target.files?.[0])}
            disabled={uploading}
            hidden
          />
        </label>
      )}
    </div>
  );
}

function ColorPicker({ label, hint, value, onChange }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#000000';
  return (
    <div className="color-picker">
      <div className="color-picker-head">
        <div>
          <strong>{label}</strong>
          {hint && <small>{hint}</small>}
        </div>
        <div
          className="color-swatch"
          style={{ background: safe }}
          aria-hidden
        />
      </div>
      <div className="color-picker-inputs">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="color-input"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#059669"
          className="form-input color-hex"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function ThemePreview({ name, logo, banner, primary, secondary }) {
  const style = {
    '--sp-primary': primary || '#059669',
    '--sp-secondary': secondary || '#f59e0b',
  };
  return (
    <div className="theme-preview" style={style}>
      <div className="theme-preview-banner">
        {banner ? <img src={resolveImg(banner)} alt="" /> : <span>Banner</span>}
      </div>
      <div className="theme-preview-body">
        <div className="theme-preview-logo">
          {logo ? <img src={resolveImg(logo)} alt="" /> : <Store size={22} />}
        </div>
        <div className="theme-preview-info">
          <strong>{name}</strong>
          <div className="theme-preview-actions">
            <button type="button" className="tp-btn tp-btn-primary">Follow</button>
            <button type="button" className="tp-btn tp-btn-ghost">Message</button>
          </div>
          <div className="theme-preview-badges">
            <span className="tp-badge">Featured</span>
            <span className="tp-badge tp-badge-accent">Best Seller</span>
          </div>
        </div>
      </div>
    </div>
  );
}
