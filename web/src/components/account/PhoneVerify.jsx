import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { SealCheck, ChatCircleText } from '@phosphor-icons/react';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import './PhoneVerify.css';

/**
 * Prove the mobile number with a code by SMS. Shops see that a buyer's
 * number is verified; cash on delivery may require it. Hidden until SMS is
 * set up on the server.
 */
export default function PhoneVerify({ frame = (body) => body }) {
  const { user, updateUser } = useAuthStore();
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState(user?.contactNumber || '');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get('/auth/phone/config').then((res) => { if (!cancelled) setEnabled(Boolean(res.data?.enabled)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!enabled) return null;

  const verified = user?.phoneVerifiedAt && user.phoneVerifiedNumber === user.contactNumber;
  if (verified && !sentTo) {
    return frame(<p className="pv-done"><SealCheck size={16} weight="fill" /> {user.phoneVerifiedNumber} is verified</p>);
  }

  const send = async () => {
    setBusy(true);
    try {
      const res = await axios.post('/auth/phone/send', { number });
      setSentTo(res.data.sentTo);
      toast.success(`Code sent to ${res.data.sentTo}`);
    } catch (err) {
      toast.error(err.message || 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    try {
      const res = await axios.post('/auth/phone/verify', { code });
      updateUser({ ...user, ...res.data });
      setSentTo('');
      setCode('');
      toast.success('Your number is verified');
    } catch (err) {
      toast.error(err.message || 'Could not verify the code');
    } finally {
      setBusy(false);
    }
  };

  return frame(
    <div className="pv">
      <p className="pv-help"><ChatCircleText size={16} /> Verify your mobile number by SMS. Shops trust cash-on-delivery orders from verified numbers.</p>
      {!sentTo ? (
        <div className="pv-row">
          <input value={number} inputMode="tel" maxLength={13} placeholder="09171234567" onChange={(e) => setNumber(e.target.value)} aria-label="Mobile number to verify" />
          <button type="button" onClick={send} disabled={busy || !/^09\d{9}$/.test(number.replace(/[\s-]/g, ''))}>Send code</button>
        </div>
      ) : (
        <div className="pv-row">
          <input value={code} inputMode="numeric" maxLength={6} placeholder="6-digit code" onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} aria-label="Code from the SMS" autoComplete="one-time-code" />
          <button type="button" onClick={verify} disabled={busy || code.length !== 6}>Verify</button>
          <button type="button" className="pv-link" onClick={() => setSentTo('')} disabled={busy}>Change number</button>
        </div>
      )}
    </div>
  );
}
