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

export function setLanguage(code) {
  if (!LANGUAGES.some((l) => l.code === code)) return;
  localStorage.setItem(STORAGE_KEY, code);

  if (code === PAGE_LANG) {
    clearCookie('googtrans');
  } else {
    setCookie('googtrans', `/${PAGE_LANG}/${code}`);
  }
  // Google Translate reads the cookie at load; reload for a clean re-render.
  window.location.reload();
}

export function loadGoogleTranslate() {
  if (loaded) return;
  loaded = true;

  ensureContainer();

  window.googleTranslateElementInit = function googleTranslateElementInit() {
    if (!window.google?.translate?.TranslateElement) return;
    // eslint-disable-next-line no-new
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
