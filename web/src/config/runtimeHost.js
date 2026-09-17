/**
 * Local development on a phone/tablet: the site is opened from the PC's LAN
 * address (e.g. http://10.0.8.115:5173), but VITE_API_URL / VITE_BACKEND_URL
 * point at "localhost", which on a phone means the phone itself.
 *
 * When that happens, reuse the host the page was opened from and keep the
 * configured port. Deployed URLs (a real domain) are left untouched.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

export const forLocalNetwork = (url) => {
  if (typeof window === 'undefined' || !url) return url;
  try {
    const target = new URL(url, window.location.origin);
    if (!LOCAL_HOST.test(target.hostname)) return url;
    if (LOCAL_HOST.test(window.location.hostname)) return url;
    target.hostname = window.location.hostname;
    return target.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
};

export default forLocalNetwork;
