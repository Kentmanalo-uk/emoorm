import { useEffect } from 'react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';
import { inAndroidApp } from '../lib/inApp';

/*
 * Inside the Android app only: tells the server the app is in use on this
 * phone, once when it opens and again when someone signs in, so the super
 * admin can see installs per version and who uses the app. The phone keeps a
 * random install id in the app's own storage (a new one after a reinstall);
 * nothing else about the phone is sent besides what the app's user agent
 * already says (app version, Android version, phone model).
 */

const KEY = 'emoorm-install-id';
let launched = false;

const installId = () => {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return null;
  }
};

export default function AppInstallPing() {
  const userId = useAuthStore((s) => s.user?.id || null);

  useEffect(() => {
    if (!inAndroidApp()) return;
    const id = installId();
    if (!id) return;
    const launch = !launched;
    launched = true;
    axios.post('/app/ping', { installId: id, launch }, { quiet: true }).catch(() => {});
  }, [userId]);

  return null;
}
