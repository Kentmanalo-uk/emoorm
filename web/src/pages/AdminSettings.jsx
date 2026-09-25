import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Key as KeyRound, User, MapPin, FloppyDisk as Save, CircleNotch as Loader2,
  ArrowsClockwise as RefreshCcw, Copy, Image as ImageIcon, UploadSimple, Plus, X, ArrowSquareOut, Palette, PaintBrushBroad, CheckCircle,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import ThemePanel from '../components/admin/theme/ThemePanel';
import '../components/admin/AdminLayout.css';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import useAppSettings, { APP_SETTINGS_QUERY_KEY, DEFAULT_APP_SETTINGS, resolveAppSettingImage } from '../hooks/useAppSettings';
import useAuthStore from '../store/authStore';
import './AdminSettings.css';

// Settings row: label and help on the left, controls on the right.
function Row({ label, help, children }) {
  return (
    <div className="st-row">
      <div className="st-row-label">
        <strong>{label}</strong>
        {help && <span>{help}</span>}
      </div>
      <div className="st-row-control">{children}</div>
    </div>
  );
}

export default function AdminSettings() {
  const { user, updateUser, setTokens } = useAuthStore();
  const queryClient = useQueryClient();
  const isMunicipalAdmin = user?.role === 'MUNICIPAL_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { settings: currentAppSettings } = useAppSettings();
  const [brandingForm, setBrandingForm] = useState(DEFAULT_APP_SETTINGS);
  const [uploadingBrandField, setUploadingBrandField] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);
  const appLogoInputRef = useRef(null);
  const placeholderInputRef = useRef(null);
  const [municipalityProfile, setMunicipalityProfile] = useState({ id: '', name: '', logo: '', tagline: '', description: '', gallery: [] });
  const [savingMunicipality, setSavingMunicipality] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const galleryInputRef = useRef(null);
  const [uploadingMuniLogo, setUploadingMuniLogo] = useState(false);
  // Last saved municipality page, to detect unsaved edits.
  const [municipalitySnapshot, setMunicipalitySnapshot] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const muniLogoInputRef = useRef(null);
  const [profileForm, setProfileForm] = useState({
    fullName: user?.fullName || '',
    contactNumber: user?.contactNumber || '',
  });
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const [mfaStatus, setMfaStatus] = useState(null);
  const [mfaSetup, setMfaSetup] = useState(null); // { qrDataUrl, secret }
  const [mfaCode, setMfaCode] = useState('');
  const [newBackupCodes, setNewBackupCodes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await axios.get('/auth/mfa/status');
      setMfaStatus(res.data);
    } catch (err) {
      toast.error(err.message || 'Failed to load MFA status');
    }
  };

  useEffect(() => { loadStatus(); }, []);

  useEffect(() => {
    setBrandingForm({
      appLogo: currentAppSettings.appLogo,
      productPlaceholder: currentAppSettings.productPlaceholder,
      deliveryFee: String(currentAppSettings.deliveryFee ?? DEFAULT_APP_SETTINGS.deliveryFee),
      requireBuyerVerification: currentAppSettings.requireBuyerVerification !== false,
    });
  }, [
    currentAppSettings.appLogo,
    currentAppSettings.productPlaceholder,
    currentAppSettings.deliveryFee,
    currentAppSettings.requireBuyerVerification,
  ]);

  useEffect(() => {
    if (!isMunicipalAdmin || !user?.municipalityId) return;
    axios.get(`/municipalities/${user.municipalityId}`)
      .then((res) => {
        const loaded = {
          id: res.data?.id || user.municipalityId,
          name: res.data?.name || '',
          logo: res.data?.logo || '',
          tagline: res.data?.tagline || '',
          description: res.data?.description || '',
          gallery: Array.isArray(res.data?.gallery) ? res.data.gallery : [],
        };
        setMunicipalityProfile(loaded);
        setMunicipalitySnapshot(loaded);
      })
      .catch((err) => toast.error(err.message || 'Failed to load municipality profile'));
  }, [isMunicipalAdmin, user?.municipalityId]);

  const saveMunicipalityProfile = async () => {
    setSavingMunicipality(true);
    try {
      await axios.put(`/municipalities/${municipalityProfile.id}`, {
        logo: municipalityProfile.logo || null,
        tagline: municipalityProfile.tagline,
        description: municipalityProfile.description,
        gallery: municipalityProfile.gallery,
      });
      setMunicipalitySnapshot(municipalityProfile);
      toast.success('Municipality page updated');
    } catch (err) {
      toast.error(err.message || 'Failed to save municipality page');
    } finally {
      setSavingMunicipality(false);
    }
  };

  const uploadMunicipalityLogo = async (file) => {
    if (!file) return;
    setUploadingMuniLogo(true);
    try {
      const result = await uploadImage(file);
      setMunicipalityProfile((profile) => ({ ...profile, logo: result.url }));
      toast.success('Logo uploaded. Save the page to publish it.');
    } catch (err) {
      toast.error(err.message || 'Failed to upload logo');
    } finally {
      setUploadingMuniLogo(false);
    }
  };

  const addGalleryImages = async (files) => {
    if (!files?.length) return;
    const remaining = Math.max(0, 12 - municipalityProfile.gallery.length);
    if (remaining === 0) { toast.error('Gallery limit is 12 images'); return; }
    setUploadingGallery(true);
    try {
      const uploaded = [];
      for (const file of Array.from(files).slice(0, remaining)) {
        const result = await uploadImage(file);
        uploaded.push(result.url);
      }
      setMunicipalityProfile((profile) => ({ ...profile, gallery: [...profile.gallery, ...uploaded] }));
      toast.success('Gallery images added. Save the page to publish them.');
    } catch (err) {
      toast.error(err.message || 'Failed to upload gallery image');
    } finally {
      setUploadingGallery(false);
    }
  };

  const uploadBrandImage = async (field, file) => {
    if (!file) return;
    setUploadingBrandField(field);
    try {
      const result = await uploadImage(file);
      setBrandingForm((current) => ({ ...current, [field]: result.url }));
      toast.success('Image uploaded. Save branding to publish it.');
    } catch (err) {
      toast.error(err.message || 'Failed to upload branding image');
    } finally {
      setUploadingBrandField('');
    }
  };

  const saveBranding = async () => {
    const deliveryFee = Number(brandingForm.deliveryFee);
    if (!Number.isFinite(deliveryFee) || deliveryFee < 0) {
      toast.error('Delivery fee must be 0 or more');
      return;
    }
    // Send only what changed; the server keeps the rest.
    const changes = {};
    if (brandingForm.appLogo !== currentAppSettings.appLogo) changes.appLogo = brandingForm.appLogo;
    if (brandingForm.productPlaceholder !== currentAppSettings.productPlaceholder) {
      changes.productPlaceholder = brandingForm.productPlaceholder;
    }
    if (deliveryFee !== Number(currentAppSettings.deliveryFee)) changes.deliveryFee = deliveryFee;
    const requireBuyerVerification = brandingForm.requireBuyerVerification !== false;
    if (requireBuyerVerification !== (currentAppSettings.requireBuyerVerification !== false)) {
      changes.requireBuyerVerification = requireBuyerVerification;
    }
    if (Object.keys(changes).length === 0) {
      toast.success('No changes to save');
      return;
    }
    setSavingBranding(true);
    try {
      const response = await axios.put('/app-settings', changes);
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, { ...DEFAULT_APP_SETTINGS, ...(response.data || {}) });
      queryClient.invalidateQueries({ queryKey: APP_SETTINGS_QUERY_KEY });
      toast.success('App settings updated');
    } catch (err) {
      toast.error(err.message || 'Failed to save app branding');
    } finally {
      setSavingBranding(false);
    }
  };

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await axios.put('/auth/profile', profileForm);
      updateUser(res.data);
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePwSave = async (e) => {
    e.preventDefault();
    if (pwForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    setSavingPw(true);
    try {
      const res = await axios.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      // The change invalidated this tab's tokens along with every other
      // device's. Adopt the replacements so the person who just changed
      // their password is not the one bounced to the login screen.
      if (res?.data?.accessToken) {
        setTokens(res.data.accessToken, res.data.refreshToken);
      }
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Other devices have been signed out.');
    } catch (err) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSavingPw(false);
    }
  };

  const beginMfaSetup = async () => {
    setBusy(true);
    try {
      const res = await axios.post('/auth/mfa/setup/begin');
      setMfaSetup(res.data);
      setMfaCode('');
    } catch (err) {
      toast.error(err.message || 'Failed to start MFA setup');
    } finally {
      setBusy(false);
    }
  };

  const completeMfaSetup = async () => {
    if (!/^\d{6}$/.test(mfaCode.trim())) {
      toast.error('Enter the 6-digit code from your authenticator');
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post('/auth/mfa/setup/complete', { code: mfaCode.trim() });
      setNewBackupCodes(res.data.backupCodes);
      setMfaSetup(null);
      setMfaCode('');
      toast.success('MFA enabled');
      loadStatus();
    } catch (err) {
      toast.error(err.message || 'Invalid code');
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async () => {
    if (!/^\d{6,}$/.test(mfaCode.trim())) {
      toast.error('Enter a valid code');
      return;
    }
    setBusy(true);
    try {
      await axios.post('/auth/mfa/disable', { code: mfaCode.trim() });
      setMfaCode('');
      setConfirmDisable(false);
      toast.success('MFA disabled');
      loadStatus();
    } catch (err) {
      toast.error(err.message || 'Failed to disable MFA');
    } finally {
      setBusy(false);
    }
  };

  const regenerateBackupCodes = async () => {
    if (!/^\d{6}$/.test(mfaCode.trim())) {
      toast.error('Enter your current 6-digit code first');
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post('/auth/mfa/backup-codes/regenerate', { code: mfaCode.trim() });
      setNewBackupCodes(res.data.backupCodes);
      setMfaCode('');
      toast.success('New backup codes generated');
      loadStatus();
    } catch (err) {
      toast.error(err.message || 'Failed to generate codes');
    } finally {
      setBusy(false);
    }
  };

  const copyCodes = async () => {
    if (!newBackupCodes) return;
    try {
      await navigator.clipboard.writeText(newBackupCodes.join('\n'));
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  };

  const municipalityDirty = Boolean(municipalitySnapshot) && ['logo', 'tagline', 'description', 'gallery']
    .some((key) => JSON.stringify(municipalityProfile[key]) !== JSON.stringify(municipalitySnapshot[key]));

  const passwordChecks = [
    { label: 'At least 8 characters', ok: pwForm.newPassword.length >= 8 },
    { label: 'Contains a number', ok: /\d/.test(pwForm.newPassword) },
    { label: 'Contains a symbol', ok: /[^A-Za-z0-9]/.test(pwForm.newPassword) },
  ];
  const passwordsMatch = pwForm.confirm.length > 0 && pwForm.confirm === pwForm.newPassword;

  const sections = [
    isSuperAdmin && { key: 'branding', label: 'App branding', hint: 'Logo and placeholder', icon: Palette },
    isSuperAdmin && { key: 'appearance', label: 'Theme & colours', hint: 'Palette for every screen', icon: PaintBrushBroad },
    isMunicipalAdmin && { key: 'municipality', label: 'Municipality page', hint: 'Public showcase', icon: MapPin },
    { key: 'profile', label: 'Profile', hint: 'Name and contact', icon: User },
    { key: 'password', label: 'Password', hint: 'Change your password', icon: KeyRound },
    { key: 'security', label: 'Two-factor', hint: mfaStatus?.enabled ? 'Enabled' : 'Not enabled', icon: ShieldCheck },
  ].filter(Boolean);
  const requestedTab = searchParams.get('tab');
  const activeTab = sections.some((sec) => sec.key === requestedTab) ? requestedTab : sections[0].key;
  const selectTab = (key) => setSearchParams({ tab: key }, { replace: true });

  const brandingPanel = (
    <section className="st-panel">
      <header className="st-panel-head">
        <div>
          <h2>App branding</h2>
          <p>The Emoorm logo, the image shown when a product has no photo, and checkout delivery pricing.</p>
        </div>
      </header>
      <div className="st-branding-grid">
        {[
          { field: 'appLogo', label: 'General app logo', ref: appLogoInputRef, className: '' },
          { field: 'productPlaceholder', label: 'No-product-image placeholder', ref: placeholderInputRef, className: 'is-placeholder' },
        ].map(({ field, label, ref, className }) => (
          <div key={field} className="st-branding-item">
            <strong>{label}</strong>
            <div className={`st-branding-preview ${className}`}>
              <img src={resolveAppSettingImage(brandingForm[field])} alt={label} />
            </div>
            <div className="st-inline-actions">
              <button type="button" className="st-btn st-btn-soft" onClick={() => ref.current?.click()} disabled={Boolean(uploadingBrandField)}>
                {uploadingBrandField === field ? <Loader2 size={15} className="spin" /> : <UploadSimple size={15} weight="bold" />}
                {uploadingBrandField === field ? 'Uploading…' : 'Choose image'}
              </button>
              <button type="button" className="st-btn st-btn-text" onClick={() => setBrandingForm((current) => ({ ...current, [field]: DEFAULT_APP_SETTINGS[field] }))}>
                Restore default
              </button>
              <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { uploadBrandImage(field, event.target.files?.[0]); event.target.value = ''; }} />
            </div>
          </div>
        ))}
      </div>

      <Row label="Default delivery fee (₱)" help="Charged on delivery orders from stores that have not set their own delivery fee. Sellers set theirs in Fulfillment & Payment. Pickup orders are never charged.">
        <input
          className="st-input"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={brandingForm.deliveryFee ?? ''}
          onChange={(e) => setBrandingForm((current) => ({ ...current, deliveryFee: e.target.value }))}
          placeholder={String(DEFAULT_APP_SETTINGS.deliveryFee)}
        />
      </Row>

      <Row
        label="Buyer ID verification"
        help={brandingForm.requireBuyerVerification !== false
          ? 'On: buyers must verify a government ID before they can check out.'
          : 'Off: anyone with an account can check out. Verification stays available and records are kept.'}
      >
        <label className="st-toggle">
          <input
            type="checkbox"
            checked={brandingForm.requireBuyerVerification !== false}
            onChange={(e) => setBrandingForm((current) => ({ ...current, requireBuyerVerification: e.target.checked }))}
          />
          <span>Require verification before checkout</span>
        </label>
      </Row>

      <footer className="st-panel-foot">
        <button type="button" className="st-btn st-btn-primary" onClick={saveBranding} disabled={savingBranding || Boolean(uploadingBrandField)}>
          {savingBranding ? <Loader2 size={15} className="spin" /> : <Save size={15} weight="fill" />}
          {savingBranding ? 'Saving…' : 'Save branding'}
        </button>
      </footer>
    </section>
  );

  const municipalityPanel = (
    <section className="st-panel">
      <header className="st-panel-head">
        <div>
          <h2>{municipalityProfile.name ? `${municipalityProfile.name} page` : 'Municipality page'}</h2>
          <p>What visitors see on your public municipality page.</p>
        </div>
        {municipalityProfile.id && (
          <a className="st-btn st-btn-text" href={`/municipality/${municipalityProfile.id}`} target="_blank" rel="noopener noreferrer">
            View page <ArrowSquareOut size={15} weight="bold" />
          </a>
        )}
      </header>

      <Row label="Logo" help="Square JPEG, PNG or WebP, up to 5 MB.">
        <div className="st-logo">
          <div className="st-logo-preview">
            {municipalityProfile.logo
              ? <img src={resolveImg(municipalityProfile.logo)} alt={`${municipalityProfile.name} logo`} />
              : <ImageIcon size={40} weight="fill" />}
          </div>
          <div className="st-inline-actions">
            <button type="button" className="st-btn st-btn-soft" onClick={() => muniLogoInputRef.current?.click()} disabled={uploadingMuniLogo}>
              {uploadingMuniLogo ? <Loader2 size={15} className="spin" /> : <UploadSimple size={15} weight="bold" />}
              {uploadingMuniLogo ? 'Uploading…' : municipalityProfile.logo ? 'Replace' : 'Upload logo'}
            </button>
            {municipalityProfile.logo && (
              <button type="button" className="st-btn st-btn-text" onClick={() => setMunicipalityProfile((p) => ({ ...p, logo: '' }))} disabled={uploadingMuniLogo}>
                Remove
              </button>
            )}
            <input ref={muniLogoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { uploadMunicipalityLogo(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
      </Row>

      <Row label="Tagline" help="A short line under the municipality name.">
        <input
          className="st-input"
          value={municipalityProfile.tagline}
          onChange={(e) => setMunicipalityProfile((p) => ({ ...p, tagline: e.target.value }))}
          placeholder={`${municipalityProfile.name || 'Municipality'}, made local.`}
          maxLength={180}
        />
        <span className="st-counter">{municipalityProfile.tagline.length}/180</span>
      </Row>

      <Row label="Background" help="Tell visitors what makes this place special.">
        <textarea
          className="st-input"
          rows={5}
          value={municipalityProfile.description}
          onChange={(e) => setMunicipalityProfile((p) => ({ ...p, description: e.target.value }))}
          placeholder="History, local products, festivals, places to visit…"
        />
      </Row>

      <Row label="Gallery" help={`${municipalityProfile.gallery.length} of 12 photos. Shown on the page and gallery view.`}>
        <div className="st-gallery">
          {municipalityProfile.gallery.map((image, index) => (
            <div key={`${image}-${index}`} className="st-gallery-item">
              <img src={resolveImg(image)} alt={`Gallery ${index + 1}`} />
              <button
                type="button"
                onClick={() => setMunicipalityProfile((p) => ({ ...p, gallery: p.gallery.filter((_, i) => i !== index) }))}
                aria-label={`Remove photo ${index + 1}`}
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          ))}
          {municipalityProfile.gallery.length < 12 && (
            <button type="button" className="st-gallery-add" onClick={() => galleryInputRef.current?.click()} disabled={uploadingGallery}>
              {uploadingGallery ? <Loader2 size={22} className="spin" /> : <Plus size={22} weight="bold" />}
              <span>{uploadingGallery ? 'Uploading…' : 'Add photos'}</span>
            </button>
          )}
          <input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addGalleryImages(e.target.files); e.target.value = ''; }} />
        </div>
      </Row>

      <footer className="st-panel-foot">
        {municipalityDirty && <span className="st-dirty">Unsaved changes</span>}
        {municipalityDirty && (
          <button type="button" className="st-btn st-btn-text" onClick={() => setMunicipalityProfile(municipalitySnapshot)} disabled={savingMunicipality}>
            Discard
          </button>
        )}
        <button
          type="button"
          className="st-btn st-btn-primary"
          disabled={!municipalityDirty || savingMunicipality || uploadingMuniLogo || uploadingGallery || !municipalityProfile.id}
          onClick={saveMunicipalityProfile}
        >
          {savingMunicipality ? <Loader2 size={15} className="spin" /> : <Save size={15} weight="fill" />}
          {savingMunicipality ? 'Saving…' : 'Save page'}
        </button>
      </footer>
    </section>
  );

  const profilePanel = (
    <form className="st-panel" onSubmit={handleProfileSave}>
      <header className="st-panel-head">
        <div>
          <h2>Profile</h2>
          <p>Your name and contact appear in audit logs and support chats.</p>
        </div>
      </header>
      <Row label="Full name">
        <input className="st-input" type="text" value={profileForm.fullName} onChange={(e) => setProfileForm((p) => ({ ...p, fullName: e.target.value }))} required />
      </Row>
      <Row label="Contact number">
        <input className="st-input" type="tel" value={profileForm.contactNumber} onChange={(e) => setProfileForm((p) => ({ ...p, contactNumber: e.target.value }))} placeholder="+63…" />
      </Row>
      <Row label="Email" help="Contact a super admin to change your email.">
        <input className="st-input" type="email" value={user?.email || ''} disabled />
      </Row>
      <footer className="st-panel-foot">
        <button type="submit" className="st-btn st-btn-primary" disabled={savingProfile}>
          {savingProfile ? <Loader2 size={15} className="spin" /> : <Save size={15} weight="fill" />}
          {savingProfile ? 'Saving…' : 'Save profile'}
        </button>
      </footer>
    </form>
  );

  const passwordPanel = (
    <form className="st-panel" onSubmit={handlePwSave}>
      <header className="st-panel-head">
        <div>
          <h2>Password</h2>
          <p>Choose a strong password you don&apos;t use anywhere else.</p>
        </div>
      </header>
      <Row label="Current password">
        <input className="st-input" type="password" autoComplete="current-password" value={pwForm.currentPassword} onChange={(e) => setPwForm((p) => ({ ...p, currentPassword: e.target.value }))} required />
      </Row>
      <Row label="New password">
        <input className="st-input" type="password" autoComplete="new-password" value={pwForm.newPassword} onChange={(e) => setPwForm((p) => ({ ...p, newPassword: e.target.value }))} required minLength={8} />
        <ul className="st-checks">
          {passwordChecks.map((check) => (
            <li key={check.label} className={check.ok ? 'is-ok' : ''}>
              <CheckCircle size={15} weight="fill" /> {check.label}
            </li>
          ))}
        </ul>
      </Row>
      <Row label="Confirm password">
        <input className="st-input" type="password" autoComplete="new-password" value={pwForm.confirm} onChange={(e) => setPwForm((p) => ({ ...p, confirm: e.target.value }))} required minLength={8} />
        {pwForm.confirm && (
          <span className={`st-match ${passwordsMatch ? 'is-ok' : 'is-bad'}`}>
            {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
          </span>
        )}
      </Row>
      <footer className="st-panel-foot">
        <button type="submit" className="st-btn st-btn-primary" disabled={savingPw}>
          {savingPw ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} weight="fill" />}
          {savingPw ? 'Updating…' : 'Update password'}
        </button>
      </footer>
    </form>
  );

  const securityPanel = (
    <section className="st-panel">
      <header className="st-panel-head">
        <div>
          <h2>Two-factor authentication</h2>
          <p>
            {mfaStatus?.enabled
              ? 'Every sign-in asks for a code from your authenticator app.'
              : 'Admin accounts must use an authenticator app for stronger protection.'}
          </p>
        </div>
        <span className={`st-status ${mfaStatus?.enabled ? 'is-on' : 'is-off'}`}>
          {mfaStatus?.enabled ? 'Enabled' : 'Not enabled'}
        </span>
      </header>

      {newBackupCodes && (
        <div className="st-callout">
          <div className="st-callout-head">
            <strong>Save your backup codes</strong>
            <button type="button" className="st-btn st-btn-text" onClick={copyCodes}>
              <Copy size={15} weight="bold" /> Copy all
            </button>
          </div>
          <p>Each code works once if you lose access to your authenticator. Keep them somewhere safe.</p>
          <ul className="st-codes">
            {newBackupCodes.map((c) => <li key={c}><code>{c}</code></li>)}
          </ul>
          <button type="button" className="st-btn st-btn-soft" onClick={() => setNewBackupCodes(null)}>
            I&apos;ve saved them
          </button>
        </div>
      )}

      {!mfaStatus?.enabled && !mfaSetup && (
        <div className="st-empty">
          <ShieldCheck size={72} weight="fill" />
          <strong>Protect your admin account</strong>
          <span>Use Google Authenticator, Authy or 1Password to generate sign-in codes.</span>
          <button type="button" className="st-btn st-btn-primary" onClick={beginMfaSetup} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} weight="fill" />} Set up two-factor
          </button>
        </div>
      )}

      {mfaSetup && (
        <>
          <Row label="1. Scan the QR code" help="Open your authenticator app and scan this code.">
            <div className="st-qr">
              <img src={mfaSetup.qrDataUrl} alt="Authenticator QR code" />
              <div>
                <span>Can&apos;t scan? Enter this key:</span>
                <code>{mfaSetup.secret}</code>
              </div>
            </div>
          </Row>
          <Row label="2. Enter the code" help="The 6-digit code shown in the app.">
            <input className="st-input st-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="123456" />
          </Row>
          <footer className="st-panel-foot">
            <button type="button" className="st-btn st-btn-text" onClick={() => { setMfaSetup(null); setMfaCode(''); }}>Cancel</button>
            <button type="button" className="st-btn st-btn-primary" onClick={completeMfaSetup} disabled={busy}>
              {busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} weight="fill" />} Confirm and enable
            </button>
          </footer>
        </>
      )}

      {mfaStatus?.enabled && (
        <>
          <Row label="Backup codes" help={`${mfaStatus.backupCodesRemaining} unused. Regenerating replaces all old codes.`}>
            <input className="st-input st-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Current 6-digit code" />
            <div className="st-inline-actions">
              <button type="button" className="st-btn st-btn-soft" onClick={regenerateBackupCodes} disabled={busy}>
                <RefreshCcw size={15} weight="bold" /> Regenerate codes
              </button>
            </div>
          </Row>
          <Row label="Turn off" help={mfaStatus.required ? 'Required for admin accounts.' : 'Uses the code entered above.'}>
            {mfaStatus.required ? (
              <span className="st-note">Two-factor authentication can&apos;t be turned off for admins.</span>
            ) : confirmDisable ? (
              <div className="st-inline-actions">
                <button type="button" className="st-btn st-btn-danger" onClick={disableMfa} disabled={busy}>Confirm turn off</button>
                <button type="button" className="st-btn st-btn-text" onClick={() => setConfirmDisable(false)}>Cancel</button>
              </div>
            ) : (
              <div className="st-inline-actions">
                <button type="button" className="st-btn st-btn-text st-btn-text-danger" onClick={() => setConfirmDisable(true)}>Turn off two-factor</button>
              </div>
            )}
          </Row>
        </>
      )}
    </section>
  );

  const panels = {
    branding: brandingPanel,
    // Only ever reachable by a super admin: the tab is left out of the
    // sections list for anyone else, so activeTab cannot resolve to it.
    appearance: <ThemePanel />,
    municipality: municipalityPanel,
    profile: profilePanel,
    password: passwordPanel,
    security: securityPanel,
  };

  return (
    <AdminLayout>
      <div className="st">
        <header className="st-header">
          <h1 className="admin-page-title">Settings</h1>
          <p>Manage {isMunicipalAdmin ? 'your municipality page, ' : ''}{isSuperAdmin ? 'app branding, the colour theme, ' : ''}profile and account security.</p>
        </header>

        <div className="st-layout">
          <nav className="st-nav" aria-label="Settings sections">
            {sections.map(({ key, label, hint, icon: Icon }) => (
              <button
                key={key}
                type="button"
                className={`st-nav-item${activeTab === key ? ' is-active' : ''}`}
                onClick={() => selectTab(key)}
                aria-current={activeTab === key ? 'page' : undefined}
              >
                <Icon size={20} weight="fill" />
                <span>
                  <strong>{label}</strong>
                  <small>{hint}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className="st-content">{panels[activeTab]}</div>
        </div>
      </div>
    </AdminLayout>
  );
}
