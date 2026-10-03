import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CircleNotch as Loader2, FloppyDisk as Save, CheckCircle, SignOut } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import { resolveImg } from '../lib/media';
import useAuthStore from '../store/authStore';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import './ProfileSettings.css';
import { useMunicipalities } from '../hooks/useReferenceData';
import { usePhoneLayout } from '../hooks/useMobileNav';
import useFreshAccount from '../hooks/useFreshAccount';
import UserAvatar from '../components/ui/UserAvatar';
import PhAddressPicker from '../components/common/PhAddressPicker';
import PasswordField from '../components/account/PasswordField';
import AccountData from '../components/account/AccountData';
import PushSetting from '../components/account/PushSetting';
import PhoneVerify from '../components/account/PhoneVerify';
import PhoneSettings from './ProfileSettingsPhone';
import { afterSignOutPath } from '../lib/afterSignOut';
import {
  cleanUsername, fullNameProblem, usernameProblem, contactProblem, passwordProblem, uploadProfilePhoto,
} from '../lib/profileForm';

const initialProfileState = (user) => ({
  fullName: user?.fullName || '',
  username: user?.username || '',
  contactNumber: user?.contactNumber || '',
  profilePhoto: user?.profilePhoto || '',
  // The home address, as the address picker takes it.
  municipalityId: user?.municipalityId || '',
  municipalityName: user?.municipality?.name || '',
  barangay: user?.barangay || '',
  street: user?.address || '',
});

// What a save would change (the picker also keeps codes, which are not saved).
const SAVED_FIELDS = ['fullName', 'username', 'contactNumber', 'profilePhoto', 'municipalityId', 'barangay', 'street'];

/**
 * /profile/settings. Phones: the settings as a list, each part on a page of
 * its own (/profile/settings/<part>). Computers: everything on one page.
 */
export default function ProfileSettingsPage() {
  const { part } = useParams();
  const isPhone = usePhoneLayout();
  // The account as saved now; the forms below start from it.
  const fresh = useFreshAccount();
  if (isPhone) return <PhoneSettings key={part || 'list'} part={part || null} fresh={fresh} />;
  if (part) return <Navigate to="/profile/settings" replace />;
  return <ProfileSettings />;
}

function ProfileSettings() {
  const { user, updateUser, logout, setTokens } = useAuthStore();
  const navigate = useNavigate();
  const [signOutOpen, setSignOutOpen] = useState(false);
  const { municipalities, isLoading: municipalitiesLoading } = useMunicipalities();

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

  const [addressErrors, setAddressErrors] = useState({});

  const isDirty = useMemo(
    () => SAVED_FIELDS.some((k) => (form[k] || '') !== (original[k] || '')),
    [form, original],
  );

  const validate = () => {
    const problem = fullNameProblem(form.fullName) || usernameProblem(form.username) || contactProblem(form.contactNumber);
    if (problem) {
      toast.error(problem);
      return false;
    }
    // A changed address needs its barangay (an older account without one
    // can still save its other details).
    const addressChanged = ['barangay', 'street'].some((k) => (form[k] || '') !== (original[k] || ''));
    if (addressChanged && !form.barangay?.trim()) {
      setAddressErrors({ barangay: 'Choose your barangay.' });
      toast.error('Choose your barangay');
      return false;
    }
    return true;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: name === 'username' ? cleanUsername(value) : value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        contactNumber: form.contactNumber?.trim() || null,
        province: 'Oriental Mindoro',
        barangay: form.barangay?.trim() || null,
        address: form.street?.trim() || null,
        profilePhoto: form.profilePhoto || null,
      };
      // Only send the username when it actually changed: sending the same
      // one back is a no-op server side, but there is no reason to risk it.
      if ((form.username || '') !== (original.username || '')) {
        payload.username = form.username.trim();
      }
      const res = await axios.put('/auth/profile', payload);
      const updated = res.data ?? res;
      if (updateUser) updateUser({ ...user, ...updated });
      toast.success('Profile updated');
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setForm(original);
    setAddressErrors({});
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(file);
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
    const problem = passwordProblem(pw);
    if (problem) {
      toast.error(problem);
      return;
    }
    setChangingPw(true);
    try {
      const res = await axios.post('/auth/change-password', {
        currentPassword: pw.currentPassword,
        newPassword: pw.newPassword,
        confirmPassword: pw.confirmPassword,
      });
      // The change invalidated this tab's tokens along with every other
      // device's. Adopt the replacements so the person who just changed
      // their password is not the one bounced to the login screen.
      if (res?.data?.accessToken) {
        setTokens(res.data.accessToken, res.data.refreshToken);
      }
      toast.success('Password changed. Other devices have been signed out.');
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
            <UserAvatar
              src={form.profilePhoto}
              name={initials}
              alt={form.fullName}
              fallbackClassName="ps-photo-fallback"
            />
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
            <span className="ps-label">Username</span>
            <div className="ps-input-wrap ps-input-prefixed">
              <span className="ps-input-prefix" aria-hidden="true">@</span>
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="juandelacruz"
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="ps-input"
              />
            </div>
            <span className="ps-help">3–20 characters: letters, numbers, dot or underscore</span>
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
          <PhoneVerify frame={(body) => <div className="ps-field ps-field-full">{body}</div>} />

          {/* The home address, from the address lists (province, town, barangay, street). */}
          <div className="ps-field ps-field-full ps-address">
            <PhAddressPicker
              value={form}
              onChange={(next) => {
                setForm((f) => ({ ...f, ...next }));
                setAddressErrors({});
              }}
              dbMunicipalities={municipalities}
              dbLoading={municipalitiesLoading}
              errors={addressErrors}
              lockTown
              townHint="Contact support to change your municipality."
            />
            <span className="ps-help">
              Your home address. Orders go to your <Link to="/profile/addresses">delivery addresses</Link>.
            </span>
          </div>
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

      {/* ── Notifications on this device (shown when push is set up) ── */}
      <PushSetting frame={(row) => (
        <div className="ps-card">
          <div className="ps-card-head">
            <h2 className="ps-card-title">Notifications</h2>
          </div>
          {row}
        </div>
      )}
      />

      {/* ── Your data ────────────────────────────────────── */}
      <div className="ps-card">
        <div className="ps-card-head">
          <h2 className="ps-card-title">Your Data</h2>
          <span className="ps-card-hint">A copy of your account, or delete it.</span>
        </div>
        <AccountData />
      </div>

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

        <footer className="ps-actions ps-actions-signout">
          <button type="button" className="ps-btn ps-btn-signout" onClick={() => setSignOutOpen(true)}>
            <SignOut size={15} weight="bold" /> Sign out
          </button>
        </footer>
      </div>

      <ConfirmDialog
        open={signOutOpen}
        title="Sign out?"
        message="You will need to sign in again to place orders and see your account."
        confirmLabel="Sign out"
        danger
        onConfirm={() => { setSignOutOpen(false); logout(); navigate(afterSignOutPath('/login'), { replace: true }); }}
        onCancel={() => setSignOutOpen(false)}
      />
    </div>
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
