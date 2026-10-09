/**
 * Local development on a phone/tablet: the site is opened from the PC's LAN
 * address (e.g. http://10.0.8.115:5173), but VITE_API_URL / VITE_BACKEND_URL
 * point at "localhost", which on a phone means the phone itself.
 *
 * When that happens, reuse the host the page was opened from and keep the
 * configured port. Deployed URLs (a real domain) are left untouched.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/i;

// "www.emoorm.shop" and "emoorm.shop" are one site.
const bare = (host) => String(host || '').toLowerCase().replace(/^www\./, '');

export const forLocalNetwork = (url) => {
  if (typeof window === 'undefined' || !url) return url;
  try {
    const target = new URL(url, window.location.origin);
    // A deployed address for this same site, with or without "www.": use
    // the address the page was actually opened at. Calling the other one is
    // another origin to the browser, so the page's security policy blocks
    // every request and the site shows no data.
    if (!LOCAL_HOST.test(target.hostname)) {
      if (target.origin !== window.location.origin && bare(target.hostname) === bare(window.location.hostname)) {
        return `${window.location.origin}${target.pathname}${target.search}`.replace(/\/$/, '');
      }
      return url;
    }
    if (LOCAL_HOST.test(window.location.hostname)) return url;
    target.hostname = window.location.hostname;
    return target.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
};

export default forLocalNetwork;
