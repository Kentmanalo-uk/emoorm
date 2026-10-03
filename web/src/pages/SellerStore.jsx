import { useState, useEffect } from 'react';
import {
  Link, Navigate, useLocation, useNavigate, useOutletContext, useParams,
} from 'react-router-dom';
import { Storefront as Store, FloppyDisk as Save, WarningCircle as AlertCircle, UploadSimple as Upload, Trash as Trash2, Palette, Image as ImageIcon, Gear as Settings, MapPin } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import StoreLocationMap from '../components/maps/StoreLocationMap';
import SellerPageHead from '../components/seller/SellerPageHead';
import PhoneSaveBar from '../components/seller/PhoneSaveBar';
import PickupAddressField from '../components/seller/PickupAddressField';
import { pickupGap } from '../lib/pickupAddress';
import { SettingsList, SettingsRow } from '../components/seller/SettingsList';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { useMunicipalities } from '../hooks/useReferenceData';
import './SellerDashboard.css';
import './SellerStore.css';
import { BusyLabel } from '../components/ui/Spinner';

const DEFAULT_PRIMARY = 'var(--t-primary-600, #059669)';
const DEFAULT_SECONDARY = 'var(--t-warning-500, #f59e0b)';
const DESCRIPTION_MAX = 500;
const PH_MOBILE_REGEX = /^(09\d{9}|\+639\d{9})$/;

/**
 * Phones: each part of the shop profile on a page of its own
 * (/seller/store/<part>), saving only its own fields.
 */
const PARTS = {
  about: { anchor: 'shop-info', fields: ['name', 'description', 'contactNumber', 'isActive'] },
  branding: { anchor: 'branding', fields: ['logo', 'bannerImage', 'coverImage'] },
  location: { anchor: 'shop-location', fields: ['pickupAddress', 'latitude', 'longitude'] },
  colors: { anchor: 'theme', fields: ['primaryColor', 'secondaryColor'] },
};
// Links written for the one-page layout (/seller/store#branding).
const PART_OF_ANCHOR = {
  'shop-info': 'about',
  branding: 'branding',
  'shop-location': 'location',
  theme: 'colors',
};
const partPath = (part) => `/seller/store/${part}`;

/**
 * /seller/store, and on phones /seller/store/<part>. Each part starts from
 * the saved profile: nothing unsaved carries over between them.
 */
export default function SellerStorePage() {
  const { part } = useParams();
  return <SellerStore key={part || 'all'} part={part || null} />;
}

/**
 * Computers: the whole profile on one page, as before. Phones: its parts as
 * a list (Name & description, Logo & banner, Location, Shop colors), each on
 * its own page with Cancel and Save changes at the bottom.
 */
function SellerStore({ part }) {
  const [store, setStore] = useState(null);
  const layoutCtx = useOutletContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);
  // Phones fold the shop colours away until asked for.
  const isPhone = usePhoneLayout();
  // "Your own colours" in Decorate links here with #theme: open straight away.
  const [themeOpen, setThemeOpen] = useState(location.hash === '#theme');
  const showTheme = !isPhone || themeOpen;
  const [form, setForm] = useState({
    name: '',
    description: '',
    pickupAddress: '',
    latitude: null,
    longitude: null,
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
  // Phones: the address as picked (town, barangay, street), once changed.
  const [pickupDraft, setPickupDraft] = useState(null);
  const { municipalities } = useMunicipalities();

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
        pickupAddress: res.data.pickupAddress || '',
        latitude: res.data.latitude ?? null,
        longitude: res.data.longitude ?? null,
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
  // What a part's page saves: its own fields ('all' on the one-page layout).
  const scope = part && PARTS[part] && isPhone && !isNew ? part : 'all';
  const saved = savedSnapshot ? JSON.parse(savedSnapshot) : null;
  const partDirty = scope !== 'all' && Boolean(saved)
    && PARTS[scope].fields.some((f) => JSON.stringify(form[f] ?? null) !== JSON.stringify(saved[f] ?? null));

  // Back to where the part was opened from (the list, Me, Shop setup…).
  const leave = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/seller/store', { replace: true });
  };

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
    e?.preventDefault?.();
    const checksAbout = scope === 'all' || scope === 'about';
    if (checksAbout && !validate()) return;
    // Phones pick the address: the barangay and a street or landmark as well.
    const addressProblem = scope === 'location' && pickupDraft ? pickupGap(pickupDraft) : null;
    if (addressProblem) {
      toast.error(addressProblem);
      return;
    }
    // Deactivating an existing, currently-active store hides it from all buyers — confirm first.
    if (checksAbout && !isNew && store?.isActive && !form.isActive) {
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
        layoutCtx?.setStore?.(saved);
        setIsNew(false);
        toast.success('Store created successfully!');
      } else {
        // A part's page sends only its own fields.
        const changes = scope === 'all'
          ? form
          : Object.fromEntries(PARTS[scope].fields.map((f) => [f, form[f]]));
        const res = await axios.put(`/stores/${store.id}`, changes);
        saved = res.data;
        setStore(saved);
        layoutCtx?.setStore?.((prev) => ({ ...prev, ...saved }));
        toast.success(scope === 'all' ? 'Store updated!' : 'Saved');
      }
      setSavedSnapshot(JSON.stringify(form));
      if (scope !== 'all') leave();
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

  // Parts have their own pages on phones only: computers show the whole
  // profile (scrolled to the part), and phones turn one-page links
  // (/seller/store#branding) into the part's page.
  if (part && !PARTS[part]) return <Navigate to="/seller/store" replace />;
  if (part && !isPhone) {
    return <Navigate to={`/seller/store${location.hash || `#${PARTS[part].anchor}`}`} replace />;
  }
  const anchorPart = PART_OF_ANCHOR[location.hash.slice(1)];
  if (!part && isPhone && anchorPart) return <Navigate to={partPath(anchorPart)} replace />;

  const deactivateDialog = (
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
  );

  // The fields, shared by the one-page layout and the parts' pages.
  const nameField = (
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
  );

  const descriptionField = (
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
  );

  const addressField = (
                  <div className="form-group">
                    <label>Store / Pickup Address</label>
                    <input
                      type="text"
                      name="pickupAddress"
                      value={form.pickupAddress}
                      onChange={handleChange}
                      placeholder="Street, Barangay, Municipality, Oriental Mindoro"
                      className="form-input"
                    />
                  </div>
  );

  const mapField = (
                  <div className="form-group" id="shop-location">
                    <label><MapPin size={14} /> Pin Store Location</label>
                    <StoreLocationMap
                      value={{ latitude: form.latitude, longitude: form.longitude }}
                      onChange={({ latitude, longitude }) => setForm((previous) => ({ ...previous, latitude, longitude }))}
                      height={330}
                    />
                  </div>
  );

  const contactField = (
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
  );

  const activeField = !isNew && (
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
  );

  const brandingBody = (
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
  );

  const themeBody = (
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
  );

  // Phones: the list of parts, then each part on its own page.
  if (isPhone && !isNew) {
    if (isLoading) {
      return (
        <div className="seller-dashboard">
          <div className="seller-container">
            <div className="seller-card">
              <Skeleton.Text lines={3} height={14} />
            </div>
          </div>
        </div>
      );
    }

    if (!part) {
      const hasLogo = Boolean(form.logo);
      const hasBanner = Boolean(form.bannerImage || form.coverImage);
      const pinned = form.latitude != null && form.longitude != null;
      const ownColors = form.primaryColor !== DEFAULT_PRIMARY || form.secondaryColor !== DEFAULT_SECONDARY;
      return (
        <div className="seller-dashboard">
          <div className="seller-container">
            <SettingsList label="Shop profile">
              <SettingsRow
                to={partPath('about')}
                icon={Store}
                label="Name & description"
                value={form.description.trim() ? form.name : `${form.name} · Add a description`}
                missing={!form.description.trim()}
              />
              <SettingsRow
                to={partPath('branding')}
                icon={ImageIcon}
                label="Logo & banner"
                value={hasLogo && hasBanner
                  ? 'Logo and banner added'
                  : !hasLogo && !hasBanner ? 'Add a logo and a banner' : !hasLogo ? 'Add a logo' : 'Add a banner'}
                missing={!hasLogo || !hasBanner}
              />
              <SettingsRow
                to={partPath('location')}
                icon={MapPin}
                label="Location"
                value={pinned ? (form.pickupAddress.trim() || 'Pinned on the map') : 'Pin your shop on the map'}
                missing={!pinned}
              />
              <SettingsRow
                to={partPath('colors')}
                icon={Palette}
                label="Shop colors"
                value={(
                  <>
                    <span className="scm-swatch" style={{ background: form.primaryColor }} />
                    <span className="scm-swatch" style={{ background: form.secondaryColor }} />
                    {ownColors ? 'Your own colors' : 'Emoorm colors'}
                  </>
                )}
              />
            </SettingsList>
          </div>
        </div>
      );
    }

    const card = {
      about: (
        <div className="seller-card" id="shop-info">
          <div className="seller-card-header">
            <h2><Store size={18} /> Store Information</h2>
          </div>
          <div className="store-form">
            {nameField}
            {descriptionField}
            {contactField}
            {activeField}
          </div>
        </div>
      ),
      branding: (
        <div className="seller-card" id="branding">
          <div className="seller-card-header">
            <h2><ImageIcon size={16} /> Branding</h2>
          </div>
          {brandingBody}
        </div>
      ),
      location: (
        <div className="seller-card" id="shop-info">
          <div className="seller-card-header">
            <h2><MapPin size={16} /> Location</h2>
          </div>
          <div className="store-form">
            <div className="form-group">
              <label>Store / Pickup Address</label>
              <PickupAddressField
                value={form.pickupAddress}
                shopTown={store?.municipality?.name}
                municipalities={municipalities}
                onChange={(text, parts) => {
                  setForm((p) => ({ ...p, pickupAddress: text }));
                  setPickupDraft(parts);
                }}
              />
            </div>
            {mapField}
          </div>
        </div>
      ),
      colors: (
        <div className="seller-card" id="theme">
          <div className="seller-card-header">
            <h2><Palette size={16} /> Shop colors</h2>
          </div>
          {themeBody}
          <div className="form-actions branding-actions">
            <button type="button" className="btn-seller-outline" onClick={resetColors}>
              Reset to Emoorm colors
            </button>
          </div>
        </div>
      ),
    }[part];

    return (
      <div className="seller-dashboard scm-part">
        <div className="seller-container">{card}</div>
        <PhoneSaveBar
          onCancel={leave}
          onSave={() => handleSubmit()}
          saving={isSaving}
          canSave={partDirty && !uploadingField}
        />
        {deactivateDialog}
      </div>
    );
  }

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title={isNew ? 'Create Your Store' : 'Store Settings'}
          subtitle="Your public storefront details"
          actions={!isNew && isDirty && (
            <span className="store-unsaved-badge">
              <AlertCircle size={13} /> Unsaved changes
            </span>
          )}
        />

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
              <div className="seller-card" id="shop-info">
                <div className="seller-card-header">
                  <h2><Store size={18} /> Store Information</h2>
                </div>
                <form onSubmit={handleSubmit} className="store-form">
                  {nameField}

                  {descriptionField}

                  {addressField}

                  {mapField}

                  {contactField}

                  {activeField}

                  <div className="form-actions">
                    <button type="submit" className="btn-seller-primary" disabled={isSaving}>
                      <Save size={16} />
                      {isSaving ? <BusyLabel>Saving…</BusyLabel> : isNew ? 'Create Store' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Branding: logo + banner */}
              {!isNew && (
                <div className="seller-card" id="branding">
                  <div className="seller-card-header">
                    <h2><ImageIcon size={16} /> Branding</h2>
                  </div>
                  {brandingBody}
                  <div className="form-actions branding-actions">
                    <button type="button" className="btn-seller-primary" onClick={handleSubmit} disabled={isSaving}>
                      <Save size={16} />
                      {isSaving ? <BusyLabel>Saving…</BusyLabel> : 'Save Branding'}
                    </button>
                  </div>
                </div>
              )}

              {/* Theme colors */}
              {!isNew && (
                <div className="seller-card" id="theme">
                  <div className="seller-card-header">
                    <h2><Palette size={16} /> {isPhone ? 'Shop colors' : 'Theme Colors'}</h2>
                    {showTheme ? (
                      <button type="button" className="btn-seller-outline" onClick={resetColors}>
                        Reset defaults
                      </button>
                    ) : (
                      <button type="button" className="btn-seller-outline" onClick={() => setThemeOpen(true)}>
                        Change
                      </button>
                    )}
                  </div>
                  {showTheme && (<>
                  {themeBody}
                  <div className="form-actions branding-actions">
                    <button type="button" className="btn-seller-primary" onClick={handleSubmit} disabled={isSaving}>
                      <Save size={16} />
                      {isSaving ? <BusyLabel>Saving…</BusyLabel> : 'Save Theme'}
                    </button>
                  </div>
                  </>)}
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

      {deactivateDialog}
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
          placeholder="var(--t-primary-600, #059669)"
          className="form-input color-hex"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function ThemePreview({ name, logo, banner, primary, secondary }) {
  const style = {
    '--sp-primary': primary || 'var(--t-primary-600, #059669)',
    '--sp-secondary': secondary || 'var(--t-warning-500, #f59e0b)',
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
