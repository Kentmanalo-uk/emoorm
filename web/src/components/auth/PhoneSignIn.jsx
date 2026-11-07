import { useEffect, useRef, useState } from 'react';
import axios from '../../lib/axios';
import { BusyLabel } from '../ui/Spinner';

/**
 * Continue with mobile number: the number, then the 6-digit code texted to
 * it. `onAnswer` gets the server's answer (signed in, two-step sign-in, or
 * complete your account), the same shape as a Google sign-in's.
 */
const RESEND_AFTER = 60;

export default function PhoneSignIn({ onAnswer, onBack }) {
  const [number, setNumber] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const codeRef = useRef(null);

  // The resend countdown.
  useEffect(() => {
    if (!wait) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const messageOf = (err, fallback) => err?.response?.data?.message || err?.message || fallback;

  const sendCode = async (e) => {
    e?.preventDefault();
    setError('');
    const clean = number.replace(/[\s-]/g, '').replace(/^\+63/, '0');
    if (!/^09\d{9}$/.test(clean)) {
      setError('Enter a mobile number like 09171234567');
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post('/auth/phone/login/send', { number: clean });
      setNumber(clean);
      setSentTo(res.data?.sentTo || clean);
      setCode('');
      setWait(RESEND_AFTER);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(messageOf(err, 'The code could not be sent. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from the text');
      return;
    }
    setBusy(true);
    try {
      const res = await axios.post('/auth/phone/login', { number, code: code.trim() });
      onAnswer(res.data);
    } catch (err) {
      setError(messageOf(err, 'That code did not work. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (!sentTo) {
    return (
      <form onSubmit={sendCode} className="login-form auth-phone">
        <div className="login-form-group">
          <label htmlFor="phone-number" className="login-form-label">Mobile number</label>
          <input
            id="phone-number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className={`login-form-input ${error ? 'login-form-input-error' : ''}`}
            placeholder="09171234567"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <span className="auth-phone-hint">We'll text you a 6-digit code. Standard rates may apply.</span>
        </div>
        {error && <div className="login-form-error-message" role="alert">{error}</div>}
        <button type="submit" className="login-form-submit" disabled={busy}>
          {busy ? <BusyLabel>Sending…</BusyLabel> : 'Send code'}
        </button>
        <button type="button" className="auth-phone-back" onClick={onBack}>Other ways to sign in</button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="login-form auth-phone">
      <p className="auth-phone-sent">
        We texted a code to <strong>{sentTo}</strong>.
        {' '}
        <button type="button" className="auth-phone-link" onClick={() => { setSentTo(''); setError(''); }}>Change</button>
      </p>
      <div className="login-form-group">
        <label htmlFor="phone-code" className="login-form-label">6-digit code</label>
        <input
          id="phone-code"
          ref={codeRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className={`login-form-input auth-phone-code ${error ? 'login-form-input-error' : ''}`}
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </div>
      {error && <div className="login-form-error-message" role="alert">{error}</div>}
      <button type="submit" className="login-form-submit" disabled={busy}>
        {busy ? <BusyLabel>Checking…</BusyLabel> : 'Continue'}
      </button>
      <button type="button" className="auth-phone-back" onClick={sendCode} disabled={busy || wait > 0}>
        {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
      </button>
    </form>
  );
}
