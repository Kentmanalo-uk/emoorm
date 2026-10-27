// Google Website Translator loader + cookie-driven language switcher.
// Auto-translates the whole DOM — no per-string wrapping needed.

export const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'tl', label: 'Tagalog', short: 'TL' },
  { code: 'ceb', label: 'Bisaya', short: 'CEB' },
];

const PAGE_LANG = 'en';
const INCLUDED = LANGUAGES.map((l) => l.code).join(',');
const CONTAINER_ID = 'google_translate_element';
const STORAGE_KEY = 'emoorm.lang';

let loaded = false;

function ensureContainer() {
  if (document.getElementById(CONTAINER_ID)) return;
  const el = document.createElement('div');
  el.id = CONTAINER_ID;
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;visibility:hidden;';
  document.body.appendChild(el);
}

function setCookie(name, value, days = 365) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  const host = window.location.hostname;
  const base = `${name}=${value};expires=${d.toUTCString()};path=/`;
  document.cookie = base;
  document.cookie = `${base};domain=${host}`;
  // Google also reads a leading-dot domain cookie in some setups.
  if (host && !host.startsWith('.')) {
    document.cookie = `${base};domain=.${host}`;
  }
}

function clearCookie(name) {
  const host = window.location.hostname;
  const expired = 'expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
  document.cookie = `${name}=;${expired}`;
  document.cookie = `${name}=;${expired};domain=${host}`;
  if (host && !host.startsWith('.')) {
    document.cookie = `${name}=;${expired};domain=.${host}`;
  }
}

export function getCurrentLanguage() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && LANGUAGES.some((l) => l.code === stored)) return stored;
  const match = document.cookie.match(/googtrans=\/[a-z-]+\/([a-z-]+)/i);
  if (match && LANGUAGES.some((l) => l.code === match[1])) return match[1];
  return 'en';
}

// Fields the person typed into (not filled by the page), to tell whether a
// language change would throw away something they wrote. Search boxes do
// not count: a search is quickly typed again.
const typedInto = new WeakSet();
const isTextField = (el) => (el.tagName === 'TEXTAREA'
  || (el.tagName === 'INPUT' && !/^(hidden|checkbox|radio|file|submit|button|reset|range|color|search|image)$/i.test(el.type)));
const isSearch = (el) => /search/i.test(`${el.getAttribute('aria-label') || ''} ${el.getAttribute('placeholder') || ''} ${el.name || ''}`);
if (typeof document !== 'undefined') {
  document.addEventListener('input', (e) => {
    if (e.isTrusted && isTextField(e.target) && !isSearch(e.target)) typedInto.add(e.target);
  }, true);
}
const hasTypedWork = () => [...document.querySelectorAll('input, textarea')]
  .some((el) => typedInto.has(el) && el.value.trim() !== '');

/**
 * Switch the site's language. It reloads the page (Google's translator reads
 * its cookie at load), so when something typed is still on the page the
 * person is asked first. Resolves false when they keep the page as it is.
 */
export async function setLanguage(code) {
  if (!LANGUAGES.some((l) => l.code === code)) return false;
  if (hasTypedWork()) {
    const { confirmAction } = await import('./confirm');
    const go = await confirmAction({
      title: 'Change the language?',
      message: 'The page reloads in the new language, and what you have typed here will be lost.',
      confirmLabel: 'Change language',
      cancelLabel: 'Stay',
    });
    if (!go) return false;
  }
  localStorage.setItem(STORAGE_KEY, code);

  if (code === PAGE_LANG) {
    clearCookie('googtrans');
  } else {
    setCookie('googtrans', `/${PAGE_LANG}/${code}`);
  }
  // Google Translate reads the cookie at load; reload for a clean re-render.
  window.location.reload();
  return true;
}

export function loadGoogleTranslate() {
  if (loaded) return;
  loaded = true;

  ensureContainer();

  window.googleTranslateElementInit = function googleTranslateElementInit() {
    if (!window.google?.translate?.TranslateElement) return;
    new window.google.translate.TranslateElement(
      {
        pageLanguage: PAGE_LANG,
        includedLanguages: INCLUDED,
        autoDisplay: false,
      },
      CONTAINER_ID
    );
  };

  const src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement('script');
  s.src = src;
  s.async = true;
  document.body.appendChild(s);
}
