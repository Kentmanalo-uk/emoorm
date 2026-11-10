/**
 * What Moormy can work on the screen: its buttons, links, tabs, boxes and
 * fields, by what they say (their labels, as a screen reader reads them).
 * Sent with each request as context.screen; the server matches what was
 * said against it and proposes pressing or typing in one (backend/src/moormy).
 *
 * Never listed: Moormy's own controls, hidden or disabled ones, password
 * and card fields. Never sent: what is typed in a field (labels only).
 */

const SELECTOR = [
  'a[href]', 'button', 'summary', 'select', 'textarea',
  'input:not([type="hidden"]):not([type="password"]):not([type="file"])',
  '[role="button"]', '[role="tab"]', '[role="link"]', '[role="menuitem"]', '[role="option"]',
  '[role="switch"]', '[role="checkbox"]', '[role="radio"]',
].join(',');

// Her own controls, and what is not there for anyone.
const SKIP_INSIDE = '.mmg-panel, .mmg-mini, .mmg-dock, .mmg-tab, .mmg-glow, [aria-hidden="true"], [inert]';
// Card and secret fields.
const PRIVATE = /\b(cc-|card|cvv|cvc|otp|pin|password|passcode)\b/i;

const MAX_ITEMS = 160;
const MAX_BELOW = 60; // past the bottom of the screen
const MAX_SAME = 3; // the same label (a grid's "Add to cart"s)

const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 80);

/** What an element is called: its aria-label, its label, its text, its title. */
export const nameOf = (el) => {
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return clean(aria);
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const text = by.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ');
    if (text.trim()) return clean(text);
  }
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    const label = el.labels?.[0]?.textContent;
    if (label && label.trim()) return clean(label);
    return clean(el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '');
  }
  const text = el.innerText || el.textContent || '';
  if (text.trim()) return clean(text);
  return clean(el.getAttribute('title') || el.querySelector('img[alt]')?.getAttribute('alt') || '');
};

const kindOf = (el) => {
  const role = el.getAttribute('role');
  const tag = el.tagName;
  if (role === 'tab') return 'tab';
  if (role === 'checkbox' || role === 'radio' || role === 'switch') return 'check';
  if (tag === 'SELECT') return 'select';
  if (tag === 'TEXTAREA') return 'input';
  if (tag === 'INPUT') return ['checkbox', 'radio'].includes(el.type) ? 'check' : (['submit', 'button', 'reset'].includes(el.type) ? 'button' : 'input');
  if (tag === 'A' || role === 'link') return 'link';
  return 'button';
};

const isPrivate = (el) => PRIVATE.test(`${el.getAttribute('autocomplete') || ''} ${el.getAttribute('name') || ''} ${el.id || ''} ${el.getAttribute('aria-label') || ''}`)
  && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

const isOn = (el) => el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true'
  || el.getAttribute('aria-selected') === 'true' || el.checked === true;

/**
 * The screen as Moormy reads it.
 * @returns {{ items: Array<{ i, label, kind, on }>, refs: Map<number, Element> }}
 */
export const collectScreen = (root = typeof document !== 'undefined' ? document : null) => {
  const refs = new Map();
  if (!root) return { items: [], refs };
  const vh = window.innerHeight || 800;
  const found = [];
  for (const el of root.querySelectorAll(SELECTOR)) {
    if (el.closest(SKIP_INSIDE) || el.disabled || el.getAttribute('aria-disabled') === 'true' || isPrivate(el)) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    const style = window.getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    const label = nameOf(el);
    if (!label) continue;
    found.push({
      el, label, kind: kindOf(el), on: isOn(el), top: rect.top, left: rect.left, inView: rect.bottom > 0 && rect.top < vh,
    });
  }
  // What is on the screen first (top to bottom), then a little of what is below.
  const inView = found.filter((x) => x.inView).sort((a, b) => a.top - b.top || a.left - b.left);
  const below = found.filter((x) => !x.inView && x.top >= vh).sort((a, b) => a.top - b.top).slice(0, MAX_BELOW);
  const seen = new Map();
  const items = [];
  for (const x of [...inView, ...below]) {
    const key = `${x.kind}|${x.label.toLowerCase()}`;
    const n = seen.get(key) || 0;
    if (n >= MAX_SAME) continue;
    seen.set(key, n + 1);
    const i = items.length;
    refs.set(i, x.el);
    items.push({
      i, label: x.label, kind: x.kind, on: x.on,
    });
    if (items.length >= MAX_ITEMS) break;
  }
  return { items, refs };
};

/** The element with this label and kind on the screen now, or null (a tap from the chat, later). */
export const findOnScreen = (label, kind) => {
  const { items, refs } = collectScreen();
  const want = String(label || '').toLowerCase();
  const hit = items.find((x) => x.label.toLowerCase() === want && (!kind || x.kind === kind))
    || items.find((x) => x.label.toLowerCase() === want);
  return hit ? refs.get(hit.i) : null;
};

/** A short pink-and-green ring on what she pressed, so it is seen. */
const flash = (el) => {
  el.classList.add('mmg-target');
  setTimeout(() => el.classList.remove('mmg-target'), 1600);
};

/** Press an element as a tap would: brought into view, lit, clicked. */
export const pressOn = (el) => {
  if (!el?.isConnected) return false;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  flash(el);
  el.click();
  return true;
};

/** Type into a field (or choose in a list) the way the page's own code hears it. */
export const fillIn = (el, value) => {
  if (!el?.isConnected) return false;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  flash(el);
  const text = String(value ?? '');
  if (el.tagName === 'SELECT') {
    const want = text.toLowerCase();
    const option = [...el.options].find((o) => o.text.trim().toLowerCase() === want)
      || [...el.options].find((o) => o.text.trim().toLowerCase().includes(want));
    if (!option) return false;
    el.value = option.value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  // React keeps its own copy of a field's value: set it through the
  // element's own setter so the page's onChange hears it.
  const win = typeof window !== 'undefined' ? window : null;
  const proto = win && (el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement : win.HTMLInputElement)?.prototype;
  const setter = proto && el instanceof proto.constructor ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
  el.focus?.({ preventScroll: true });
  if (setter) setter.call(el, text);
  else el.value = text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
};

/** Scroll the page: a screen up or down, or to the top or bottom. */
export const scrollPage = (dir = 'down') => {
  const h = Math.round(window.innerHeight * 0.8);
  if (dir === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
  else if (dir === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  else window.scrollBy({ top: dir === 'up' ? -h : h, behavior: 'smooth' });
};
