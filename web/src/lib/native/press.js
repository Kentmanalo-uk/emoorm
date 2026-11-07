import '../../styles/native-touch.css';

/*
 * A pressed look under the finger, as in a phone app.
 *
 * iPhone Safari applies :active only when the page listens for touches; this
 * listens (passively: it never holds a scroll up) and, on each touch, marks
 * the thing being pressed with data-press="shrink|row|card|dim", which
 * styles/native-touch.css turns into a pressed look while it is :active.
 * Using :active keeps the browser's own timing: a touch that turns into a
 * scroll drops it.
 *
 * Only things with no pressed look of their own are marked. Their own
 * `:active` rules are read from the page's stylesheets (as they arrive with
 * each page), so the two never stack. A part of the page can opt out with
 * data-no-press.
 *
 * Starts itself when imported (once); never throws.
 */

const TAPPABLE = [
  'a[href]', 'button', '[role="button"]', '[role="link"]', '[role="tab"]',
  '[role="menuitem"]', '[role="option"]', 'summary',
  'input[type="button"]', 'input[type="submit"]', 'input[type="reset"]',
].join(',');
const INERT = ':disabled, [aria-disabled="true"]';

// ── The page's own :active rules ─────────────────────────────────────────

const scanned = new WeakSet();
const own = new Set();
let ownSelector = '';

/** Split a selector list at its top-level commas. */
const splitList = (text) => {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(from, i));
      from = i + 1;
    }
  }
  out.push(text.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
};

/**
 * `.list .row:active .icon` → `.list .row`: the element that is pressed.
 * :active itself becomes :is(*) so the rest stays a valid selector.
 */
const pressedPart = (selector) => {
  const at = selector.search(/:active(?![\w-])/);
  if (at < 0) return null;
  let depth = 0;
  let end = selector.length;
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (i > at && depth === 0 && /[\s>+~]/.test(c)) { end = i; break; }
  }
  return selector.slice(0, end).replace(/:active(?![\w-])/g, ':is(*)');
};

const readRules = (rules) => {
  for (const rule of rules) {
    if (rule.selectorText) {
      // Ours (data-press) are the pressed look this adds, not the page's.
      if (rule.selectorText.includes(':active') && !rule.selectorText.includes('data-press')) {
        for (const sel of splitList(rule.selectorText)) {
          const part = pressedPart(sel);
          if (!part || own.has(part)) continue;
          // Pseudo-elements (scrollbars) and the like are not selectable.
          try { document.documentElement.matches(part); own.add(part); } catch { /* skip */ }
        }
      }
    } else if (rule.cssRules) {
      readRules(rule.cssRules); // @media, @supports, @layer
    }
  }
};

/** Read stylesheets not read yet (each page brings its own). */
const readSheets = () => {
  const before = own.size;
  for (const sheet of document.styleSheets) {
    if (scanned.has(sheet)) continue;
    scanned.add(sheet);
    try { readRules(sheet.cssRules); } catch { /* another site's (fonts) */ }
  }
  if (own.size !== before) ownSelector = [...own].join(',');
};

const hasOwnLook = (el) => {
  if (!ownSelector) return false;
  try { return el.matches(ownSelector); } catch { return false; }
};

// ── What kind of press ───────────────────────────────────────────────────

const filled = (cs) => {
  const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
  if (!m) return false;
  const [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (a < 0.5) return false;
  // White and near-white are a surface, not a button.
  return !(r > 238 && g > 238 && b > 238);
};

/**
 * shrink: buttons and icon buttons (and filled, button-like links);
 * row: a wide, low list row (tinted, as a table cell);
 * card: a big tappable block (a product, a shop);
 * dim: anything else (text links, small icons).
 */
const kindOf = (el) => {
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const wide = window.innerWidth || box.width;
  const buttonish = el.matches('button, [role="button"], input');
  const isFilled = filled(cs);
  if (box.width < wide * 0.6 && box.height <= 64 && (buttonish || isFilled)) return 'shrink';
  if (isFilled && box.height <= 56) return 'shrink';
  if (box.width >= wide * 0.7 && box.height <= 96 && cs.boxShadow === 'none') return 'row';
  if (box.width >= 96 && box.height >= 96) return 'card';
  return 'dim';
};

// ── The listener ─────────────────────────────────────────────────────────

let marked = null;

const onTouchStart = (event) => {
  try {
    if (event.touches && event.touches.length > 1) return;
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const el = target ? target.closest(TAPPABLE) : null;
    if (marked && marked !== el) {
      marked.removeAttribute('data-press');
      marked = null;
    }
    if (!el || el === marked) return;
    if (el.matches(INERT) || el.closest('[data-no-press]')) return;
    readSheets();
    if (hasOwnLook(el)) return;
    el.setAttribute('data-press', kindOf(el));
    marked = el;
  } catch {
    /* no pressed look this time */
  }
};

let started = false;

export function startPressFeedback() {
  if (started || typeof document === 'undefined') return;
  started = true;
  try {
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    // Read the first page's stylesheets while idle, so the first touch is quick.
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
    idle(() => { try { readSheets(); } catch { /* later */ } });
  } catch {
    /* no pressed looks */
  }
}

startPressFeedback();
