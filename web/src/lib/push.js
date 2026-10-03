import axios from './axios';

/**
 * Browser push: turn notifications on or off for this browser. The server
 * sends each new notification to the browsers a person turned it on in.
 */
const supported = () => typeof window !== 'undefined'
  && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (base64) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** { available, on, blocked }: whether push can be used here, and is on. */
export async function pushState() {
  if (!supported()) return { available: false };
  const config = await axios.get('/push/config').then((r) => r.data).catch(() => null);
  if (!config?.enabled) return { available: false };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return { available: Boolean(reg), on: Boolean(sub) && Notification.permission === 'granted', blocked: Notification.permission === 'denied', publicKey: config.publicKey };
}

export async function turnPushOn(publicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked for this site. Allow them in the browser settings.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await axios.post('/push/subscribe', { subscription: sub.toJSON() });
}

export async function turnPushOff() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) return;
  await axios.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}
