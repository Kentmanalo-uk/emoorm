import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle, CircleNotch, Info, Plus, X,
} from '@phosphor-icons/react';
import useAuthStore from '../../store/authStore';
import {
  forgetAccount, loadSavedAccounts, setCurrentAside, switchToAccount, useSavedAccounts,
} from '../../lib/savedAccounts';
import { useSheetPresence } from '../../hooks/useSheetMotion';
import useFocusTrap from '../../hooks/useFocusTrap';
import UserAvatar from '../ui/UserAvatar';
import ConfirmDialog from '../ui/ConfirmDialog';
import './SwitchAccountSheet.css';

/*
 * Settings → Switch account (shopping apps' account switcher), as the app has
 * it (mobile/src/components/SwitchAccountSheet.js): the accounts saved in
 * this browser, the signed-in one ticked. Pick another to switch to it (no
 * password while its session lasts); Remove takes one off this browser (and
 * ends its kept session); Add another account keeps the current one signed
 * in and opens the login. An account whose session ended opens the login
 * with its email filled in.
 *
 * A bottom sheet on phones, a dialog on computers.
 */

const ROLE_LABEL = {
  SELLER: 'Seller', BUYER: 'Buyer', MUNICIPAL_ADMIN: 'Municipal admin', SUPER_ADMIN: 'Super admin',
};
const ADMIN_ROLES = ['MUNICIPAL_ADMIN', 'SUPER_ADMIN'];

const maskEmail = (email) => {
  const [name, domain] = String(email || '').split('@');
  if (!domain) return email || '';
  return `${name.slice(0, 3)}${name.length > 3 ? '***' : ''}@${domain}`;
};

/**
 * The login form (pages/Login.jsx) starts empty: once it is on screen, its
 * email field is filled the way typing would fill it, so its own state has it.
 */
const prefillLoginEmail = (email) => {
  if (!email || typeof document === 'undefined') return;
  const started = Date.now();
  const fill = () => {
    const input = document.querySelector('input[name="email"]#email');
    if (!input) {
      if (Date.now() - started < 4000) setTimeout(fill, 80);
      return;
    }
    if (input.value) return;
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setValue) setValue.call(input, email);
    else input.value = email;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('input[name="password"]')?.focus({ preventScroll: true });
  };
  setTimeout(fill, 60);
};

/**
 * @param {Boolean} open
 * @param {Function} onClose
 */
export default function SwitchAccountSheet({ open, onClose }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const signIn = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const { accounts, ready } = useSavedAccounts();
  const [busy, setBusy] = useState(null);
  const [removing, setRemoving] = useState(null);
  const { mounted, closing } = useSheetPresence(open);
  // Escape closes it (not while an account is being removed).
  const trapRef = useFocusTrap(open && !removing, { onClose });

  useEffect(() => { if (open) loadSavedAccounts(); }, [open]);

  // The signed-in account first, then the others as saved.
  const list = user?.id && !accounts.some((a) => a.id === user.id)
    ? [{
      id: user.id, fullName: user.fullName, email: user.email, profilePhoto: user.profilePhoto, role: user.role,
    }, ...accounts]
    : [...accounts].sort((a, b) => (a.id === user?.id ? -1 : b.id === user?.id ? 1 : 0));

  // Set the signed-in account aside (still signed in, kept here) and open the
  // login: for another account, or one whose session ended.
  const loginAs = async (email) => {
    const params = new URLSearchParams({ redirect: '/profile' });
    if (email) params.set('email', email);
    const to = `/login?${params}`;
    onClose?.();
    // The session moves to its own cookie on the server first, then this
    // browser signs out here (so the login page opens signed out).
    if (user) await setCurrentAside(() => logout(to, { forget: false }));
    navigate(to, { replace: true });
    prefillLoginEmail(email);
  };

  const pick = async (account) => {
    if (busy || account.id === user?.id) return;
    setBusy(account.id);
    const res = await switchToAccount(account.id, { signIn });
    setBusy(null);
    const name = account.fullName || account.email;
    if (!res.ok) {
      toast(`Log in to ${name} again. Its session in this browser has ended.`);
      loginAs(res.email);
      return;
    }
    toast.success(`Switched to ${res.user.fullName || res.user.email}`);
    onClose?.();
    // An admin to the admin pages; from the Seller Center to the other
    // account's (a seller's); everyone else to their Profile.
    const inSeller = pathname === '/seller' || pathname.startsWith('/seller/');
    if (ADMIN_ROLES.includes(res.user.role)) navigate('/admin', { replace: true });
    else if (inSeller && res.user.role === 'SELLER') navigate('/seller', { replace: true });
    else navigate('/profile', { replace: true });
  };

  const remove = () => {
    const account = removing;
    setRemoving(null);
    if (!account) return;
    forgetAccount(account.id);
    toast(`${account.fullName || account.email} was removed from this browser`);
  };

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <div
          className={`sas-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`}
          onClick={() => !busy && onClose?.()}
          role="presentation"
        >
          <div
            ref={trapRef}
            className="sas-panel ui-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sas-title"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="sas-grip" aria-hidden="true" />
            <div className="sas-head">
              <h2 id="sas-title">Switch account</h2>
              <button type="button" className="sas-close" onClick={onClose} aria-label="Close">
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="sas-body">
              <p className="sas-note">
                <Info size={18} weight="fill" aria-hidden="true" />
                <span>Accounts saved in this browser stay signed in, so you can switch between them without a password.</span>
              </p>

              <ul className="sas-list" role="radiogroup" aria-label="Saved accounts">
                {list.map((a) => {
                  const current = a.id === user?.id;
                  const needsLogin = !current && !ready.has(a.id);
                  const name = a.fullName || a.email;
                  return (
                    <li key={a.id} className={`sas-account${current ? ' is-current' : ''}`}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={current}
                        aria-busy={busy === a.id}
                        className="sas-account-main"
                        onClick={() => pick(a)}
                        disabled={Boolean(busy) && busy !== a.id}
                      >
                        <span className="sas-avatar">
                          <UserAvatar src={a.profilePhoto} name={name} alt="" fallbackClassName="sas-avatar-initial" />
                        </span>
                        <span className="sas-account-text">
                          <strong>{name}</strong>
                          <span>
                            {[ROLE_LABEL[a.role] || 'Buyer', maskEmail(a.email)].filter(Boolean).join(' · ')}
                            {needsLogin ? ' · Log in again' : ''}
                          </span>
                        </span>
                        {busy === a.id && <CircleNotch size={20} className="sas-spin" aria-label="Switching" />}
                        {current && <CheckCircle size={22} weight="fill" className="sas-check" aria-hidden="true" />}
                      </button>
                      {!current && (
                        <button
                          type="button"
                          className="sas-remove"
                          onClick={() => setRemoving(a)}
                          disabled={Boolean(busy)}
                          aria-label={`Remove ${name} from this browser`}
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              <button type="button" className="sas-add" onClick={() => loginAs('')} disabled={Boolean(busy)}>
                <span className="sas-add-icon" aria-hidden="true"><Plus size={20} /></span>
                <span>Add another account</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={`Remove ${removing?.fullName || removing?.email || 'this account'} from this browser?`}
        message="It will be signed out here. You can add it again by logging in."
        confirmLabel="Remove"
        danger
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}
