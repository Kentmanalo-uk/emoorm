import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, UserCircle, X } from '@phosphor-icons/react';
import useAuthStore from '../store/authStore';
import './SavedAccounts.css';

export default function SavedAccounts() {
  const navigate = useNavigate();
  const { getCachedAccounts, switchCachedAccount, removeCachedAccount } = useAuthStore();
  const [accounts, setAccounts] = useState([]);
  const [selectedEmail, setSelectedEmail] = useState('');

  useEffect(() => {
    const saved = getCachedAccounts();
    setAccounts(saved);
    setSelectedEmail(saved[0]?.email || '');
  }, [getCachedAccounts]);

  const selected = accounts.find((account) => account.email === selectedEmail);

  const handleLogin = () => {
    if (!selected || !switchCachedAccount(selected)) return;
    const role = selected.role;
    navigate(role === 'SELLER' ? '/seller' : role === 'SUPER_ADMIN' || role === 'MUNICIPAL_ADMIN' ? '/admin' : '/', { replace: true });
  };

  const handleRemove = (event, email) => {
    event.stopPropagation();
    removeCachedAccount(email);
    const remaining = getCachedAccounts();
    setAccounts(remaining);
    if (selectedEmail === email) setSelectedEmail(remaining[0]?.email || '');
  };

  return (
    <main className="saved-accounts-page">
      <header className="saved-accounts-header">
        <Link to="/login" className="saved-accounts-back"><ArrowLeft size={18} /> Back to login</Link>
        <Link to="/" className="saved-accounts-brand"><img src="/brand-icon.png" alt="Emoorm" /> <strong>emoorm</strong></Link>
      </header>
      <section className="saved-accounts-card">
        <div className="saved-accounts-intro">
          <span className="saved-accounts-kicker">Welcome back</span>
          <h1>Choose an account</h1>
          <p>Select a saved account to continue on this device.</p>
        </div>
        {accounts.length > 0 ? (
          <>
            <div className="saved-accounts-list" role="radiogroup" aria-label="Saved accounts">
              {accounts.map((account) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedEmail === account.email}
                  className={`saved-account-option ${selectedEmail === account.email ? 'is-selected' : ''}`}
                  key={account.email}
                  onClick={() => setSelectedEmail(account.email)}
                >
                  {account.profilePhoto ? <img src={account.profilePhoto} alt="" /> : <UserCircle size={38} weight="fill" />}
                  <span className="saved-account-copy"><strong>{account.fullName || account.email}</strong><small>{account.email}</small></span>
                  <X size={17} className="saved-account-remove" aria-label={`Remove ${account.email}`} onClick={(event) => handleRemove(event, account.email)} />
                </button>
              ))}
            </div>
            <button type="button" className="saved-accounts-login" disabled={!selected} onClick={handleLogin}>Log in <ArrowRight size={18} /></button>
          </>
        ) : (
          <div className="saved-accounts-empty">No saved accounts on this device yet.</div>
        )}
        <div className="saved-accounts-divider"><span>New to Emoorm?</span></div>
        <Link to="/register" className="saved-accounts-signup">Sign up <ArrowRight size={18} /></Link>
      </section>
    </main>
  );
}
