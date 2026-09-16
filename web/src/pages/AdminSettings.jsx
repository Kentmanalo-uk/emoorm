import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Key as KeyRound, User, MapPin, FloppyDisk as Save, CircleNotch as Loader2, ArrowsClockwise as RefreshCcw, Copy, Image as ImageIcon, UploadSimple } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import '../components/admin/AdminLayout.css';
import axios from '../lib/axios';
import { uploadImage } from '../lib/upload';
import { resolveImg } from '../lib/media';
import useAppSettings, { APP_SETTINGS_QUERY_KEY, DEFAULT_APP_SETTINGS, resolveAppSettingImage } from '../hooks/useAppSettings';
import useAuthStore from '../store/authStore';
import './AdminSettings.css';

export default function AdminSettings() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();
  const isMunicipalAdmin = user?.role === 'MUNICIPAL_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const { settings: currentAppSettings } = useAppSettings();
  const [brandingForm, setBrandingForm] = useState(DEFAULT_APP_SETTINGS);
  const [uploadingBrandField, setUploadingBrandField] = useState('');
  const [savingBranding, setSavingBranding] = useState(false);
  const appLogoInputRef = useRef(null);
  const placeholderInputRef = useRef(null);
  const [municipalityProfile, setMunicipalityProfile] = useState({ id: '', name: '', tagline: '', description: '', gallery: [] });
  const [savingMunicipality, setSavingMunicipality] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const galleryInputRef = useRef(null);
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
    });
  }, [currentAppSettings.appLogo, currentAppSettings.productPlaceholder]);

  useEffect(() => {
    if (!isMunicipalAdmin || !user?.municipalityId) return;
    axios.get(`/municipalities/${user.municipalityId}`)
      .then((res) => setMunicipalityProfile({
        id: res.data?.id || user.municipalityId,
        name: res.data?.name || '',
        tagline: res.data?.tagline || '',
        description: res.data?.description || '',
        gallery: Array.isArray(res.data?.gallery) ? res.data.gallery : [],
      }))
      .catch((err) => toast.error(err.message || 'Failed to load municipality profile'));
  }, [isMunicipalAdmin, user?.municipalityId]);

  const saveMunicipalityProfile = async () => {
    setSavingMunicipality(true);
    try {
      await axios.put(`/municipalities/${municipalityProfile.id}`, {
        tagline: municipalityProfile.tagline,
        description: municipalityProfile.description,
        gallery: municipalityProfile.gallery,
      });
      toast.success('Municipality page updated');
    } catch (err) {
      toast.error(err.message || 'Failed to save municipality page');
    } finally {
      setSavingMunicipality(false);
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
    setSavingBranding(true);
    try {
      const response = await axios.put('/app-settings', brandingForm);
      queryClient.setQueryData(APP_SETTINGS_QUERY_KEY, response.data);
      toast.success('App branding updated');
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
      await axios.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed');
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

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Settings</h1>
        <p className="admin-page-subtitle">Manage app branding, your admin profile, password, and security.</p>
      </div>

      {isSuperAdmin && (
        <section className="admin-card admin-settings-card app-branding-card">
          <header className="admin-settings-card-head">
            <div className="admin-settings-icon"><ImageIcon size={18} /></div>
            <div>
              <h2 className="admin-card-title">App branding</h2>
              <p className="admin-settings-sub">Manage the Emoorm logo and the image shown when a product has no photo.</p>
            </div>
          </header>
          <div className="app-branding-grid">
            <div className="app-branding-item">
              <span className="app-branding-label">General app logo</span>
              <div className="app-branding-preview">
                <img src={resolveAppSettingImage(brandingForm.appLogo)} alt="Current app logo" />
              </div>
              <div className="app-branding-actions">
                <button type="button" className="admin-btn admin-btn-outline" onClick={() => appLogoInputRef.current?.click()} disabled={Boolean(uploadingBrandField)}>
                  {uploadingBrandField === 'appLogo' ? <Loader2 size={14} className="spin" /> : <UploadSimple size={14} />}
                  {uploadingBrandField === 'appLogo' ? 'Uploading...' : 'Choose logo'}
                </button>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setBrandingForm((current) => ({ ...current, appLogo: DEFAULT_APP_SETTINGS.appLogo }))}>Restore default</button>
                <input ref={appLogoInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { uploadBrandImage('appLogo', event.target.files?.[0]); event.target.value = ''; }} />
              </div>
            </div>
            <div className="app-branding-item">
              <span className="app-branding-label">No-product-image placeholder</span>
              <div className="app-branding-preview app-branding-preview-placeholder">
                <img src={resolveAppSettingImage(brandingForm.productPlaceholder)} alt="Current product placeholder" />
              </div>
              <div className="app-branding-actions">
                <button type="button" className="admin-btn admin-btn-outline" onClick={() => placeholderInputRef.current?.click()} disabled={Boolean(uploadingBrandField)}>
                  {uploadingBrandField === 'productPlaceholder' ? <Loader2 size={14} className="spin" /> : <UploadSimple size={14} />}
                  {uploadingBrandField === 'productPlaceholder' ? 'Uploading...' : 'Choose placeholder'}
                </button>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setBrandingForm((current) => ({ ...current, productPlaceholder: DEFAULT_APP_SETTINGS.productPlaceholder }))}>Restore default</button>
                <input ref={placeholderInputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => { uploadBrandImage('productPlaceholder', event.target.files?.[0]); event.target.value = ''; }} />
              </div>
            </div>
          </div>
          <div className="admin-settings-actions app-branding-save">
            <button type="button" className="admin-btn admin-btn-primary" onClick={saveBranding} disabled={savingBranding || Boolean(uploadingBrandField)}>
              {savingBranding ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {savingBranding ? 'Saving...' : 'Save app branding'}
            </button>
          </div>
        </section>
      )}

      {isMunicipalAdmin && (
        <section className="admin-card admin-settings-card municipality-editor-card">
          <header className="admin-settings-card-head">
            <div className="admin-settings-icon"><MapPin size={18} /></div>
            <div><h2 className="admin-card-title">Municipality page</h2><p className="admin-settings-sub">Edit the introduction and gallery shown on your public municipality page.</p></div>
          </header>
          <div className="admin-settings-form">
            <label className="admin-settings-field"><span>Municipality</span><input value={municipalityProfile.name} disabled /></label>
            <label className="admin-settings-field"><span>Showcase tagline</span><input value={municipalityProfile.tagline} onChange={(e) => setMunicipalityProfile((p) => ({ ...p, tagline: e.target.value }))} placeholder={`${municipalityProfile.name || 'Municipality'}, made local.`} maxLength={180} /></label>
            <label className="admin-settings-field"><span>Short background</span><textarea rows={4} value={municipalityProfile.description} onChange={(e) => setMunicipalityProfile((p) => ({ ...p, description: e.target.value }))} placeholder="Tell visitors what makes this place special…" /></label>
            <div className="municipality-editor-gallery">
              <div className="municipality-editor-gallery-head"><span>Gallery ({municipalityProfile.gallery.length}/12)</span><button type="button" className="admin-btn admin-btn-gray" onClick={() => galleryInputRef.current?.click()} disabled={uploadingGallery}>{uploadingGallery ? 'Uploading…' : 'Add images'}</button><input ref={galleryInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { addGalleryImages(e.target.files); e.target.value = ''; }} /></div>
              <div className="municipality-editor-gallery-grid">
                {municipalityProfile.gallery.map((image, index) => <div key={`${image}-${index}`}><img src={resolveImg(image)} alt={`Gallery ${index + 1}`} /><button type="button" onClick={() => setMunicipalityProfile((p) => ({ ...p, gallery: p.gallery.filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Remove gallery image">×</button></div>)}
              </div>
            </div>
            <div className="admin-settings-actions"><button type="button" className="admin-btn admin-btn-primary" disabled={savingMunicipality || !municipalityProfile.id} onClick={saveMunicipalityProfile}><Save size={14} /> {savingMunicipality ? 'Saving…' : 'Save municipality page'}</button></div>
          </div>
        </section>
      )}

      <div className="admin-settings-grid">
        {/* Profile */}
        <section className="admin-card admin-settings-card">
          <header className="admin-settings-card-head">
            <div className="admin-settings-icon"><User size={18} /></div>
            <div>
              <h2 className="admin-card-title">Profile</h2>
              <p className="admin-settings-sub">Your name and contact used in audit logs.</p>
            </div>
          </header>
          <form onSubmit={handleProfileSave} className="admin-settings-form">
            <label className="admin-settings-field">
              <span>Full name</span>
              <input
                type="text"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm(p => ({ ...p, fullName: e.target.value }))}
                required
              />
            </label>
            <label className="admin-settings-field">
              <span>Contact number</span>
              <input
                type="tel"
                value={profileForm.contactNumber}
                onChange={(e) => setProfileForm(p => ({ ...p, contactNumber: e.target.value }))}
                placeholder="+63…"
              />
            </label>
            <label className="admin-settings-field">
              <span>Email</span>
              <input type="email" value={user?.email || ''} disabled />
            </label>
            <div className="admin-settings-actions">
              <button type="submit" className="admin-btn admin-btn-primary" disabled={savingProfile}>
                {savingProfile ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                {savingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </section>

        {/* Password */}
        <section className="admin-card admin-settings-card">
          <header className="admin-settings-card-head">
            <div className="admin-settings-icon"><KeyRound size={18} /></div>
            <div>
              <h2 className="admin-card-title">Password</h2>
              <p className="admin-settings-sub">Use at least 8 characters with a mix of numbers and symbols.</p>
            </div>
          </header>
          <form onSubmit={handlePwSave} className="admin-settings-form">
            <label className="admin-settings-field">
              <span>Current password</span>
              <input
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                required
              />
            </label>
            <label className="admin-settings-field">
              <span>New password</span>
              <input
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                required
                minLength={8}
              />
            </label>
            <label className="admin-settings-field">
              <span>Confirm new password</span>
              <input
                type="password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm(p => ({ ...p, confirm: e.target.value }))}
                required
                minLength={8}
              />
            </label>
            <div className="admin-settings-actions">
              <button type="submit" className="admin-btn admin-btn-primary" disabled={savingPw}>
                {savingPw ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
                {savingPw ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        </section>

        {/* MFA */}
        <section className="admin-card admin-settings-card admin-settings-security">
          <header className="admin-settings-card-head">
            <div>
              <h2 className="admin-card-title">Two-factor authentication</h2>
              <p className="admin-settings-sub">
                {mfaStatus?.enabled
                  ? 'MFA is active. Every login requires a code from your authenticator.'
                  : 'Admin accounts are required to enable MFA for stronger protection.'}
              </p>
            </div>
            <span className={`admin-mfa-status ${mfaStatus?.enabled ? 'is-on' : 'is-off'}`}>
              {mfaStatus?.enabled ? 'Enabled' : 'Not enabled'}
            </span>
          </header>

          {newBackupCodes && (
            <div className="admin-mfa-backup-box">
              <div className="admin-mfa-backup-head">
                <strong>Save your backup codes</strong>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={copyCodes}>
                  <Copy size={13} /> Copy all
                </button>
              </div>
              <p className="admin-settings-sub">
                Each code works once if you lose access to your authenticator. Store them somewhere safe.
              </p>
              <ul className="admin-mfa-backup-list">
                {newBackupCodes.map((c) => <li key={c}><code>{c}</code></li>)}
              </ul>
              <button type="button" className="admin-btn admin-btn-outline" onClick={() => setNewBackupCodes(null)}>
                I've saved them
              </button>
            </div>
          )}

          {!mfaStatus?.enabled && !mfaSetup && (
            <div className="admin-mfa-actions">
              <button type="button" className="admin-btn admin-btn-primary" onClick={beginMfaSetup} disabled={busy}>
                <ShieldCheck size={14} /> Enable MFA
              </button>
            </div>
          )}

          {mfaSetup && (
            <div className="admin-mfa-setup">
              <p className="admin-settings-sub">
                Scan the QR with Google Authenticator, Authy, 1Password, etc. Then enter the 6-digit code.
              </p>
              <img src={mfaSetup.qrDataUrl} alt="MFA QR" className="admin-mfa-qr" />
              <div className="admin-mfa-secret">
                <span>Manual key</span>
                <code>{mfaSetup.secret}</code>
              </div>
              <div className="admin-settings-field">
                <span>6-digit code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                />
              </div>
              <div className="admin-mfa-actions">
                <button type="button" className="admin-btn admin-btn-primary" onClick={completeMfaSetup} disabled={busy}>
                  {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                  Confirm & enable
                </button>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => { setMfaSetup(null); setMfaCode(''); }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mfaStatus?.enabled && (
            <div className="admin-mfa-manage">
              <div className="admin-mfa-manage-row">
                <div>
                  <strong>Backup codes</strong>
                  <p className="admin-settings-sub">
                    {mfaStatus.backupCodesRemaining} unused. Regenerate to invalidate old ones.
                  </p>
                </div>
              </div>
              <div className="admin-settings-field">
                <span>Enter a fresh 6-digit code to confirm</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                />
              </div>
              <div className="admin-mfa-actions">
                <button type="button" className="admin-btn admin-btn-outline" onClick={regenerateBackupCodes} disabled={busy}>
                  <RefreshCcw size={14} /> Regenerate backup codes
                </button>
                {mfaStatus.required ? (
                  <span className="admin-mfa-required-note">
                    MFA is required for admins and cannot be turned off.
                  </span>
                ) : confirmDisable ? (
                  <>
                    <button type="button" className="admin-btn admin-btn-danger" onClick={disableMfa} disabled={busy}>
                      Confirm disable
                    </button>
                    <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setConfirmDisable(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setConfirmDisable(true)}>
                    Disable MFA
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
