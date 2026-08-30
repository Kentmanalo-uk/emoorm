import React, { useEffect, useState } from 'react';
import { ShieldCheck, Key as KeyRound, User, FloppyDisk as Save, CircleNotch as Loader2, ArrowsClockwise as RefreshCcw, Copy } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import '../components/admin/AdminLayout.css';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import './AdminSettings.css';

export default function AdminSettings() {
  const { user, updateUser } = useAuthStore();
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
        <p className="admin-page-subtitle">Manage your admin profile, password, and security.</p>
      </div>

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
