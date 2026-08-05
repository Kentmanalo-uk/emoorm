import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, Save, Eye, EyeOff, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import useAuthStore from '../store/authStore';
import { API_CONFIG } from '../config/api';
import './ProfileSettings.css';

const initialProfileState = (user) => ({
  fullName: user?.fullName || '',
  contactNumber: user?.contactNumber || '',
  barangay: user?.barangay || '',
  address: user?.address || '',
  profilePhoto: user?.profilePhoto || '',
});

export default function ProfileSettings() {
  const { user, updateUser } = useAuthStore();
  const [municipalities, setMunicipalities] = useState([]);

  const [form, setForm] = useState(() => initialProfileState(user));
  const original = useMemo(() => initialProfileState(user), [user]);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // Password form
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    setForm(initialProfileState(user));
  }, [user]);

  useEffect(() => {
    axios.get('/municipalities')
      .then((r) => setMunicipalities(r.data || []))
      .catch(() => { });
  }, []);

  const municipalityName = useMemo(() => {
    const id = user?.municipalityId || user?.municipality?.id;
    if (!id) return user?.municipality?.name || '—';
    return municipalities.find((m) => m.id === id)?.name || user?.municipality?.name || '—';
  }, [user, municipalities]);

  const isDirty = useMemo(
    () => Object.keys(form).some((k) => (form[k] || '') !== (original[k] || '')),
    [form, original],
  );

  const validate = () => {
    if (!form.fullName || form.fullName.trim().length < 2) {
      toast.error('Please enter your full name');
      return false;
    }
    if (form.contactNumber) {
      const digits = form.contactNumber.replace(/\D/g, '');
      if (!/^09\d{9}$/.test(digits)) {
        toast.error('Contact number must be 11 digits starting with 09');
        return false;
      }
    }
    return true;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        contactNumber: form.contactNumber?.trim() || null,
        barangay: form.barangay?.trim() || null,
        address: form.address?.trim() || null,
        profilePhoto: form.profilePhoto || null,
      };
      const res = await axios.put('/auth/profile', payload);
      const updated = res.data ?? res;
      if (updateUser) updateUser({ ...user, ...updated });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setForm(original);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Photo must be under 5 MB');
      return;
    }
    if (!/^image\/(jpe?g|png|webp)$/.test(file.type)) {
      toast.error('Only JPEG, PNG, or WebP images allowed');
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      // Use raw fetch so the browser sets multipart/form-data with a proper boundary.
      // (The shared axios instance defaults Content-Type: application/json, which breaks uploads.)
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      const resp = await fetch(`${API_CONFIG.BASE_URL}/upload/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.success) {
        throw new Error(json?.message || `Upload failed (${resp.status})`);
      }
      const url = json?.data?.url;
      if (!url) throw new Error('Upload succeeded but no URL returned');
      setForm((f) => ({ ...f, profilePhoto: url }));
      toast.success('Photo uploaded — click Save to apply');
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemovePhoto = () => setForm((f) => ({ ...f, profilePhoto: '' }));

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pw.currentPassword || !pw.newPassword || !pw.confirmPassword) {
      toast.error('Fill in all password fields');
      return;
    }
    if (pw.newPassword === pw.currentPassword) {
      toast.error('New password must be different from current password');
      return;
    }
    if (pw.newPassword !== pw.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    const rules = [
      { re: /.{8,}/, msg: 'Password must be at least 8 characters' },
      { re: /[A-Z]/, msg: 'Password must contain an uppercase letter' },
      { re: /[a-z]/, msg: 'Password must contain a lowercase letter' },
      { re: /[0-9]/, msg: 'Password must contain a number' },
      { re: /[!@#$%^&*(),.?":{}|<>]/, msg: 'Password must contain a special character' },
    ];
    for (const r of rules) {
      if (!r.re.test(pw.newPassword)) {
        toast.error(r.msg);
        return;
      }
    }
    setChangingPw(true);
    try {
      await axios.post('/auth/change-password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
        confirmPassword: pw.confirmPassword,
      });
      toast.success('Password changed');
      setPw({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed');
    } finally {
      setChangingPw(false);
    }
  };

  const photoUrl = resolveImg(form.profilePhoto);
  const initials = (user?.fullName || user?.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="profile-page-wrap ps-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">Account Settings</h1>
      </header>

      {/* ── Profile card ─────────────────────────────────── */}
      <form className="ps-card" onSubmit={handleSave}>
        <div className="ps-card-head">
          <h2 className="ps-card-title">Profile Information</h2>
          <span className="ps-card-hint">
            {isDirty ? 'You have unsaved changes' : 'Everything is up to date'}
          </span>
        </div>

        <div className="ps-photo-row">
          <div className="ps-photo">
            {photoUrl ? (
              <img src={photoUrl} alt={form.fullName} />
            ) : (
              <span className="ps-photo-fallback">{initials}</span>
            )}
            {uploading && (
              <div className="ps-photo-uploading">
                <Loader2 size={20} className="ps-spin" />
              </div>
            )}
          </div>
          <div className="ps-photo-actions">
            <button
              type="button"
              className="ps-btn ps-btn-outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              <Camera size={15} />
              {photoUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {photoUrl && (
              <button
                type="button"
                className="ps-btn ps-btn-ghost"
                onClick={handleRemovePhoto}
                disabled={uploading}
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhoto}
              style={{ display: 'none' }}
            />
            <p className="ps-photo-hint">JPG, PNG, or WebP. Max 5 MB.</p>
          </div>
        </div>

        <div className="ps-grid">
          <label className="ps-field">
            <span className="ps-label">Full name</span>
            <input
              name="fullName"
              value={form.fullName}
              onChange={handleChange}
              placeholder="Juan Dela Cruz"
              maxLength={80}
              required
              className="ps-input"
            />
          </label>

          <label className="ps-field">
            <span className="ps-label">Email</span>
            <input value={user?.email || ''} disabled className="ps-input" />
            <span className="ps-help">Email cannot be changed.</span>
          </label>

          <label className="ps-field">
            <span className="ps-label">Contact number</span>
            <input
              name="contactNumber"
              value={form.contactNumber}
              onChange={handleChange}
              placeholder="09171234567"
              inputMode="numeric"
              maxLength={13}
              className="ps-input"
            />
            <span className="ps-help">Format: 11 digits starting with 09</span>
          </label>

          <label className="ps-field">
            <span className="ps-label">Municipality</span>
            <input value={municipalityName} disabled className="ps-input" />
            <span className="ps-help">Contact support to change your municipality.</span>
          </label>

          <label className="ps-field">
            <span className="ps-label">Barangay</span>
            <input
              name="barangay"
              value={form.barangay}
              onChange={handleChange}
              placeholder="Barangay Poblacion"
              maxLength={60}
              className="ps-input"
            />
          </label>

          <label className="ps-field ps-field-full">
            <span className="ps-label">Delivery address</span>
            <textarea
              name="address"
              value={form.address}
              onChange={handleChange}
              placeholder="Street, house number, landmarks…"
              rows={3}
              maxLength={300}
              className="ps-input ps-textarea"
            />
            <span className="ps-help">{(form.address || '').length} / 300</span>
          </label>
        </div>

        <footer className="ps-actions">
          <button
            type="button"
            className="ps-btn ps-btn-ghost"
            onClick={handleReset}
            disabled={!isDirty || saving}
          >
            Discard changes
          </button>
          <button
            type="submit"
            className="ps-btn ps-btn-primary"
            disabled={!isDirty || saving}
          >
            {saving ? <><Loader2 size={15} className="ps-spin" /> Saving…</> : <><Save size={15} /> Save changes</>}
          </button>
        </footer>
      </form>

      {/* ── Password card ────────────────────────────────── */}
      <form className="ps-card" onSubmit={handleChangePassword}>
        <div className="ps-card-head">
          <h2 className="ps-card-title">Change Password</h2>
          <span className="ps-card-hint">Choose a strong, unique password.</span>
        </div>

        <div className="ps-grid">
          <PasswordField
            label="Current password"
            value={pw.currentPassword}
            visible={showPw.current}
            onToggle={() => setShowPw((s) => ({ ...s, current: !s.current }))}
            onChange={(v) => setPw((p) => ({ ...p, currentPassword: v }))}
          />
          <PasswordField
            label="New password"
            value={pw.newPassword}
            visible={showPw.next}
            onToggle={() => setShowPw((s) => ({ ...s, next: !s.next }))}
            onChange={(v) => setPw((p) => ({ ...p, newPassword: v }))}
            help="Min 8 chars, with upper, lower, number & special character."
          />
          <PasswordField
            label="Confirm new password"
            value={pw.confirmPassword}
            visible={showPw.confirm}
            onToggle={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
            onChange={(v) => setPw((p) => ({ ...p, confirmPassword: v }))}
          />
        </div>

        <footer className="ps-actions">
          <button
            type="submit"
            className="ps-btn ps-btn-primary"
            disabled={changingPw || !pw.currentPassword || !pw.newPassword || !pw.confirmPassword}
          >
            {changingPw ? <><Loader2 size={15} className="ps-spin" /> Updating…</> : <>Update password</>}
          </button>
        </footer>
      </form>

      {/* ── Account meta ─────────────────────────────────── */}
      <div className="ps-card ps-card-meta">
        <div className="ps-card-head">
          <h2 className="ps-card-title">Account</h2>
        </div>
        <div className="ps-meta-grid">
          <MetaRow label="Role" value={user?.role?.replace(/_/g, ' ') || '—'} />
          <MetaRow
            label="Status"
            value={
              <span className="ps-badge ps-badge-active">
                <CheckCircle size={12} /> Active
              </span>
            }
          />
          <MetaRow
            label="Member since"
            value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-PH', {
              year: 'numeric', month: 'long', day: 'numeric',
            }) : '—'}
          />
        </div>
      </div>
    </div>
  );
}

function PasswordField({ label, value, visible, onToggle, onChange, help }) {
  return (
    <label className="ps-field">
      <span className="ps-label">{label}</span>
      <div className="ps-input-wrap">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ps-input"
          autoComplete="new-password"
        />
        <button type="button" className="ps-input-eye" onClick={onToggle} tabIndex={-1}>
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {help && <span className="ps-help">{help}</span>}
    </label>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="ps-meta-row">
      <span className="ps-meta-label">{label}</span>
      <span className="ps-meta-value">{value}</span>
    </div>
  );
}
