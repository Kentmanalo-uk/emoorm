import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BellRinging } from '@phosphor-icons/react';
import { pushState, turnPushOn, turnPushOff } from '../../lib/push';
import './PushSetting.css';

/** "Notifications on this device": orders, messages and replies, even with the site closed. */
export default function PushSetting({ frame = (row) => row }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    pushState().then((s) => { if (!cancelled) setState(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  if (!state?.available) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      if (state.on) {
        await turnPushOff();
        toast.success('Notifications off for this device');
      } else {
        await turnPushOn(state.publicKey);
        toast.success('Notifications on for this device');
      }
      setState(await pushState());
    } catch (err) {
      toast.error(err.message || 'Could not change notifications');
    } finally {
      setBusy(false);
    }
  };

  return frame(
    <div className="push-setting">
      <BellRinging size={20} weight="fill" />
      <span className="push-setting-text">
        <b>Notifications on this device</b>
        <small>{state.blocked ? 'Blocked in this browser. Allow notifications for this site in its settings.' : 'Orders, messages and replies, even when Emoorm is closed.'}</small>
      </span>
      <label className="push-switch">
        <input type="checkbox" checked={Boolean(state.on)} disabled={busy || state.blocked} onChange={toggle} aria-label="Notifications on this device" />
        <span />
      </label>
    </div>
  );
}
