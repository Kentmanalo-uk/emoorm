import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { DownloadSimple, Trash, CircleNotch as Loader2, WarningCircle } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { downloadBlob } from '../../lib/csv';
import useAuthStore from '../../store/authStore';
import PasswordField from './PasswordField';
import './AccountData.css';

/**
 * "Your data" in Account Settings: download a copy of the account, or delete
 * it. Deleting closes the account at once and erases it 30 days later; the
 * server says first whether anything (an order on its way, an open return)
 * has to finish, and whether the password or the email confirms it.
 */
export default function AccountData() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState(null);
  const [proof, setProof] = useState('');
  const [showProof, setShowProof] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    setDownloading(true);
    try {
      const blob = await axios.get('/account/export', { responseType: 'blob' });
      downloadBlob(`emoorm-my-data-${new Date().toISOString().slice(0, 10)}.json`, blob);
      toast.success('Your data was downloaded');
    } catch {
      toast.error('Could not download your data. Try again in a while.');
    } finally {
      setDownloading(false);
    }
  };

  const startDelete = async () => {
    setOpen(true);
    setError('');
    setCheck(null);
    try {
      const res = await axios.get('/account/deletion');
      setCheck(res.data);
    } catch (err) {
      setError(err.message || 'Could not check your account. Try again.');
    }
  };

  const confirmDelete = async (e) => {
    e.preventDefault();
    if (!check || busy) return;
    setBusy(true);
    setError('');
    try {
      await axios.post('/account/delete', check.confirmWith === 'email' ? { email: proof } : { password: proof });
      logout();
      toast.success('Your account was deleted. We sent the details to your email.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Could not delete your account. Try again.');
      setBusy(false);
    }
  };

  const blocked = Boolean(check && (!check.allowed || check.blockers.length));

  return (
    <div className="ad">
      <div className="ad-row">
        <div className="ad-text">
          <h3 className="ad-title">Download your data</h3>
          <p className="ad-desc">A copy of your profile, addresses, orders, messages and reviews, as one file.</p>
        </div>
        <button type="button" className="ps-btn ps-btn-outline ad-btn" onClick={download} disabled={downloading}>
          {downloading ? <Loader2 size={15} className="ps-spin" /> : <DownloadSimple size={15} weight="bold" />}
          {downloading ? 'Preparing…' : 'Download'}
        </button>
      </div>

      <div className="ad-row">
        <div className="ad-text">
          <h3 className="ad-title">Delete account</h3>
          <p className="ad-desc">You are signed out everywhere at once. After 30 days your account is erased for good.</p>
        </div>
        {!open && (
          <button type="button" className="ps-btn ad-btn ad-btn-danger" onClick={startDelete}>
            <Trash size={15} weight="bold" /> Delete
          </button>
        )}
      </div>

      {open && (
        <form className="ad-form" onSubmit={confirmDelete}>
          {!check && !error && (
            <p className="ad-desc"><Loader2 size={14} className="ps-spin" /> Checking your account…</p>
          )}
          {check && !check.allowed && (
            <p className="ad-note"><WarningCircle size={16} weight="fill" /> Admin accounts cannot be deleted here. Ask the super admin to remove your access first.</p>
          )}
          {check?.allowed && check.blockers.length > 0 && (
            <div className="ad-note">
              <WarningCircle size={16} weight="fill" />
              <div>
                <strong>Finish these first:</strong>
                <ul>{check.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            </div>
          )}
          {check && !blocked && (
            <>
              <ul className="ad-list">
                <li>Your orders, messages, reviews and addresses are erased.</li>
                <li>Orders you finished at other shops stay in their records, without your name, address or number.</li>
                <li>Changed your mind? Contact us within 30 days.</li>
              </ul>
              {check.confirmWith === 'email' ? (
                <label className="ps-field">
                  <span className="ps-label">Type your email to confirm</span>
                  <input
                    type="email"
                    className="ps-input"
                    value={proof}
                    onChange={(e) => setProof(e.target.value)}
                    autoComplete="off"
                  />
                </label>
              ) : (
                <PasswordField
                  label="Enter your password to confirm"
                  value={proof}
                  visible={showProof}
                  onToggle={() => setShowProof((v) => !v)}
                  onChange={setProof}
                />
              )}
            </>
          )}
          {error && <p className="ad-error" role="alert">{error}</p>}
          <div className="ad-actions">
            <button type="button" className="ps-btn ps-btn-ghost" onClick={() => { setOpen(false); setProof(''); }} disabled={busy}>
              Cancel
            </button>
            {check && !blocked && (
              <button type="submit" className="ps-btn ad-btn-solid-danger" disabled={busy || !proof.trim()}>
                {busy ? <><Loader2 size={15} className="ps-spin" /> Deleting…</> : 'Delete my account'}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
