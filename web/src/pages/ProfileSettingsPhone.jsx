import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  UserCircle, EnvelopeSimple, Phone, House, MapPin, ShieldCheck, LockKey, CalendarBlank,
  SignOut, Camera, CircleNotch as Loader2, Database,
} from '@phosphor-icons/react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { useMunicipalities } from '../hooks/useReferenceData';
import { fetchIdentityStatus } from '../lib/identity';
import {
  cleanUsername, fullNameProblem, usernameProblem, contactProblem, passwordProblem,
  uploadProfilePhoto, homeAddressLine,
} from '../lib/profileForm';
import { SettingsList, SettingsRow } from '../components/seller/SettingsList';
import PhoneSaveBar from '../components/seller/PhoneSaveBar';
import PhAddressPicker from '../components/common/PhAddressPicker';
import PasswordField from '../components/account/PasswordField';
import AccountData from '../components/account/AccountData';
import PushSetting from '../components/account/PushSetting';
import PhoneVerify from '../components/account/PhoneVerify';
import UserAvatar from '../components/ui/UserAvatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Skeleton from '../components/ui/Skeleton';
import './ProfileSettings.css';
import './ProfileSettingsPhone.css';
import { afterSignOutPath } from '../lib/afterSignOut';

/**
 * Settings on phones: the account's parts as lists showing what is set now,
 * each part on a page of its own (/profile/settings/<part>) with Cancel and
 * Save changes. Delivery addresses and the ID check keep their own pages.
 */
const PARTS = {
  profile: 'Name & photo',
  contact: 'Contact number',
  address: 'Home address',
  password: 'Change password',
  data: 'Your data',
};

const partPath = (part) => `/profile/settings/${part}`;

const IDENTITY_VALUES = {
  VERIFIED: 'Verified',
  PENDING: 'We are checking your ID',
  FAILED: 'Not verified yet · Try again',
  NOT_VERIFIED: 'Not verified yet',
};

/**
 * @param {String|null} part
 * @param {Boolean} fresh - The saved account has been read: a part's page
 *   waits for it, so its fields start from what is saved.
 */
export default function PhoneSettings({ part, fresh }) {
  if (!part) return <SettingsHub />;
  const Page = { profile: ProfilePart, contact: ContactPart, address: AddressPart, password: PasswordPart, data: DataPart }[part];
  if (!Page) return <Navigate to="/profile/settings" replace />;
  if (!fresh) {
    return (
      <div className="profile-page-wrap pst-part" aria-busy="true">
        <header className="profile-page-header">
          <h1 className="profile-page-title">{PARTS[part]}</h1>
        </header>
        <div className="ps-card">
          <Skeleton.Text lines={3} height={14} />
        </div>
      </div>
    );
  }
  return <Page title={PARTS[part]} />;
}

/** The list of parts. */
function SettingsHub() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [addresses, setAddresses] = useState(null);
  const [identity, setIdentity] = useState(null);
  const [signOutOpen, setSignOutOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get('/addresses')
      .then((res) => { if (!cancelled) setAddresses(res.data || []); })
      .catch(() => { if (!cancelled) setAddresses([]); });
    fetchIdentityStatus()
      .then((res) => { if (!cancelled) setIdentity(res || { status: 'NOT_VERIFIED' }); })
      .catch(() => { if (!cancelled) setIdentity({ status: 'NOT_VERIFIED' }); });
    return () => { cancelled = true; };
  }, []);

  const home = homeAddressLine(user);
  const defaultAddress = addresses && (addresses.find((a) => a.isDefault) || addresses[0]);
  const delivery = addresses === null
    ? 'Loading…'
    : defaultAddress
      ? [
        defaultAddress.label,
        [defaultAddress.street, defaultAddress.barangay, defaultAddress.municipality?.name].filter(Boolean).join(', '),
      ].filter(Boolean).join(' · ') + (addresses.length > 1 ? ` (+${addresses.length - 1} more)` : '')
      : 'Add where your orders go';
  const idStatus = identity?.status || 'NOT_VERIFIED';
  const idNeeded = identity && idStatus !== 'VERIFIED' && idStatus !== 'PENDING';
  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—';

  return (
    <div className="profile-page-wrap pst">
      <header className="profile-page-header">
        <h1 className="profile-page-title">Account Settings</h1>
      </header>

      <section className="pf-m-section pf-m-list pst-group">
        <h2>Profile</h2>
        <SettingsList label="Profile">
          <SettingsRow
            to={partPath('profile')}
            icon={UserCircle}
            label="Name & photo"
            value={[user?.fullName, user?.username && `@${user.username}`].filter(Boolean).join(' · ')}
          />
          <SettingsRow icon={EnvelopeSimple} label="Email" value={user?.email || '—'} />
          <SettingsRow
            to={partPath('contact')}
            icon={Phone}
            label="Contact number"
            value={user?.contactNumber || 'Add your number'}
            missing={!user?.contactNumber}
          />
          <SettingsRow
            to={partPath('address')}
            icon={House}
            label="Home address"
            value={home || 'Add your address'}
            missing={!user?.barangay || !user?.address}
          />
        </SettingsList>
      </section>

      {/* Where orders go: a card of its own, apart from the account's address. */}
      <section className="pf-m-section pf-m-list pst-group">
        <h2>Delivery addresses</h2>
        <SettingsList label="Delivery addresses">
          <SettingsRow
            to="/profile/addresses"
            icon={MapPin}
            label={defaultAddress ? 'Default address' : 'My addresses'}
            value={delivery}
            missing={addresses !== null && !defaultAddress}
          />
        </SettingsList>
      </section>

      <section className="pf-m-section pf-m-list pst-group">
        <h2>Security</h2>
        <SettingsList label="Security">
          <SettingsRow
            to="/profile/verification"
            icon={ShieldCheck}
            label="Verify your identity"
            value={identity ? IDENTITY_VALUES[idStatus] || IDENTITY_VALUES.NOT_VERIFIED : 'Loading…'}
            missing={Boolean(idNeeded)}
            tag={idNeeded && identity?.requiredForCheckout !== false ? 'Needed to check out' : null}
          />
          <SettingsRow to={partPath('password')} icon={LockKey} label="Password" value="Change your password" />
        </SettingsList>
      </section>

      <section className="pf-m-section pf-m-list pst-group">
        <h2>Account</h2>
        <SettingsList label="Account">
          <SettingsRow icon={CalendarBlank} label="Member since" value={memberSince} />
          <SettingsRow to={partPath('data')} icon={Database} label="Your data" value="Download a copy, or delete your account" />
        </SettingsList>
      </section>

      <PushSetting frame={(row) => (
        <section className="pf-m-section pst-group pst-push">
          <h2>Notifications</h2>
          {row}
        </section>
      )}
      />

      <button type="button" className="pf-m-signout" onClick={() => setSignOutOpen(true)}>
        <SignOut size={18} weight="bold" /> Log out
      </button>

      <ConfirmDialog
        open={signOutOpen}
        title="Log out?"
        message="You will need to log in again to place orders and see your account."
        confirmLabel="Log out"
        danger
        onConfirm={() => { setSignOutOpen(false); logout(); navigate(afterSignOutPath('/login'), { replace: true }); }}
        onCancel={() => setSignOutOpen(false)}
      />
    </div>
  );
}

/**
 * A part's page: its fields in one card, Cancel and Save changes pinned at
 * the bottom. The title moves up into the back bar.
 */
function PartPage({ title, children, onSave, saving, canSave }) {
  const navigate = useNavigate();
  // Back to where the part was opened from (the list, the Profile card…).
  const leave = () => {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/profile/settings', { replace: true });
  };
  return (
    <div className="profile-page-wrap pst-part">
      <header className="profile-page-header">
        <h1 className="profile-page-title">{title}</h1>
      </header>
      <form
        className="ps-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave && !saving) onSave(leave);
        }}
      >
        {children}
      </form>
      <PhoneSaveBar onCancel={leave} onSave={() => onSave(leave)} saving={saving} canSave={canSave} />
    </div>
  );
}

/** Download a copy of the account, or delete it: no Save bar, each acts at once. */
function DataPart({ title }) {
  return (
    <div className="profile-page-wrap pst-part">
      <header className="profile-page-header">
        <h1 className="profile-page-title">{title}</h1>
      </header>
      <div className="ps-card">
        <AccountData />
      </div>
    </div>
  );
}

/** Saves some of the account's fields; the account in the app follows. */
const useProfileSave = () => {
  const { user, updateUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const save = async (payload, done, message = 'Saved') => {
    setSaving(true);
    try {
      const res = await axios.put('/auth/profile', payload);
      updateUser({ ...user, ...(res.data ?? res) });
      toast.success(message);
      done();
    } catch (err) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };
  return { user, saving, save };
};

function ProfilePart({ title }) {
  const { user, saving, save } = useProfileSave();
  const original = {
    fullName: user?.fullName || '',
    username: user?.username || '',
    profilePhoto: user?.profilePhoto || '',
  };
  const [form, setForm] = useState(original);
  const [uploading, setUploading] = useState(false);
  const [verified, setVerified] = useState(false);
  const fileRef = useRef(null);

  // A new name undoes the ID check: say so before it is saved.
  useEffect(() => {
    let cancelled = false;
    fetchIdentityStatus()
      .then((res) => { if (!cancelled) setVerified(res?.status === 'VERIFIED'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const nameChanged = form.fullName.trim() !== original.fullName.trim();
  const dirty = nameChanged || form.username !== original.username || form.profilePhoto !== original.profilePhoto;

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProfilePhoto(file);
      setForm((f) => ({ ...f, profilePhoto: url }));
    } catch (err) {
      toast.error(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onSave = (done) => {
    const problem = fullNameProblem(form.fullName) || usernameProblem(form.username);
    if (problem) {
      toast.error(problem);
      return;
    }
    const payload = { fullName: form.fullName.trim(), profilePhoto: form.profilePhoto || null };
    if (form.username !== original.username) payload.username = form.username.trim();
    save(payload, done, 'Profile updated');
  };

  return (
    <PartPage title={title} onSave={onSave} saving={saving} canSave={dirty && !uploading}>
      <div className="ps-photo-row">
        <div className="ps-photo">
          <UserAvatar
            src={form.profilePhoto}
            name={(form.fullName || user?.email || '?').trim().charAt(0).toUpperCase()}
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
            {form.profilePhoto ? 'Change photo' : 'Upload photo'}
          </button>
          {form.profilePhoto && (
            <button
              type="button"
              className="ps-btn ps-btn-ghost"
              onClick={() => setForm((f) => ({ ...f, profilePhoto: '' }))}
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
            hidden
          />
          <p className="ps-photo-hint">JPG, PNG, or WebP. Max 5 MB.</p>
        </div>
      </div>

      <div className="ps-grid">
        <label className="ps-field">
          <span className="ps-label">Full name</span>
          <input
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            placeholder="Juan Dela Cruz"
            maxLength={80}
            autoComplete="name"
            className="ps-input"
          />
          <span className={`ps-help${verified && nameChanged ? ' pst-warn' : ''}`}>
            {verified && nameChanged
              ? 'Your ID check was made with your current name. Saving a new name means verifying again.'
              : 'Use the name on your government ID.'}
          </span>
        </label>

        <label className="ps-field">
          <span className="ps-label">Username</span>
          <div className="ps-input-wrap ps-input-prefixed">
            <span className="ps-input-prefix" aria-hidden="true">@</span>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: cleanUsername(e.target.value) }))}
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
      </div>
    </PartPage>
  );
}

function ContactPart({ title }) {
  const { user, saving, save } = useProfileSave();
  const original = user?.contactNumber || '';
  const [value, setValue] = useState(original);

  const onSave = (done) => {
    const problem = contactProblem(value.trim());
    if (problem) {
      toast.error(problem);
      return;
    }
    save({ contactNumber: value.trim() || null }, done, 'Contact number saved');
  };

  return (
    <PartPage title={title} onSave={onSave} saving={saving} canSave={value.trim() !== original.trim()}>
      <label className="ps-field">
        <span className="ps-label">Mobile number</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="09171234567"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={13}
          className="ps-input"
        />
        <span className="ps-help">11 digits starting with 09. Sellers and riders use it to reach you about your orders.</span>
      </label>
      <PhoneVerify />
    </PartPage>
  );
}

function AddressPart({ title }) {
  const { user, saving, save } = useProfileSave();
  const { municipalities, isLoading: municipalitiesLoading } = useMunicipalities();
  const [address, setAddress] = useState(() => ({
    province: 'Oriental Mindoro',
    provinceCode: '',
    municipalityId: user?.municipalityId || '',
    municipalityName: user?.municipality?.name || '',
    municipalityCode: '',
    barangay: user?.barangay || '',
    barangayCode: '',
    street: user?.address || '',
  }));
  const [errors, setErrors] = useState({});

  const saved = [user?.municipalityId || '', (user?.barangay || '').trim(), (user?.address || '').trim()];
  const now = [address.municipalityId || '', address.barangay.trim(), address.street.trim()];
  const dirty = now.some((v, i) => v !== saved[i]);

  const onSave = (done) => {
    if (!address.barangay.trim()) {
      setErrors({ barangay: 'Choose your barangay.' });
      return;
    }
    // The town stays (support changes it): the barangay and street are saved.
    save({
      province: 'Oriental Mindoro',
      barangay: address.barangay.trim(),
      address: address.street.trim(),
    }, done, 'Home address saved');
  };

  return (
    <PartPage title={title} onSave={onSave} saving={saving} canSave={dirty}>
      <PhAddressPicker
        value={address}
        onChange={(next) => {
          setAddress((prev) => ({ ...prev, ...next }));
          setErrors({});
        }}
        dbMunicipalities={municipalities}
        dbLoading={municipalitiesLoading}
        errors={errors}
        lockTown
        townHint="Contact support to change your municipality."
      />
      <p className="pst-note">
        Orders go to your delivery addresses. Your Home delivery address, if it was saved from this one, is updated too.
      </p>
    </PartPage>
  );
}

function PasswordPart({ title }) {
  const { setTokens } = useAuthStore();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [saving, setSaving] = useState(false);

  const onSave = async (done) => {
    const problem = passwordProblem(pw);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post('/auth/change-password', pw);
      // The change signs out every device, this one included: keep this one
      // signed in with the replacement tokens.
      if (res?.data?.accessToken) setTokens(res.data.accessToken, res.data.refreshToken);
      toast.success('Password changed. Other devices have been signed out.');
      done();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PartPage
      title={title}
      onSave={onSave}
      saving={saving}
      canSave={Boolean(pw.currentPassword && pw.newPassword && pw.confirmPassword)}
    >
      <div className="ps-grid">
        <PasswordField
          label="Current password"
          value={pw.currentPassword}
          visible={show.current}
          onToggle={() => setShow((s) => ({ ...s, current: !s.current }))}
          onChange={(v) => setPw((p) => ({ ...p, currentPassword: v }))}
        />
        <PasswordField
          label="New password"
          value={pw.newPassword}
          visible={show.next}
          onToggle={() => setShow((s) => ({ ...s, next: !s.next }))}
          onChange={(v) => setPw((p) => ({ ...p, newPassword: v }))}
          help="Min 8 chars, with upper, lower, number & special character."
        />
        <PasswordField
          label="Confirm new password"
          value={pw.confirmPassword}
          visible={show.confirm}
          onToggle={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
          onChange={(v) => setPw((p) => ({ ...p, confirmPassword: v }))}
        />
      </div>
    </PartPage>
  );
}
