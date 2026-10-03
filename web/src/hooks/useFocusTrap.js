import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Keyboard focus for a dialog or sheet: while `active`, focus moves into it,
 * Tab and Shift+Tab stay inside it, and on closing it goes back to where it
 * was (the button that opened it). Put the returned ref on the dialog.
 */
export default function useFocusTrap(active) {
  const ref = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const box = ref.current;
    if (!box) return undefined;
    const before = document.activeElement;

    const items = () => [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    // Into the dialog, unless something in it already has focus (autoFocus).
    if (!box.contains(document.activeElement)) {
      const first = items()[0];
      if (first) first.focus({ preventScroll: true });
      else {
        if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
        box.focus({ preventScroll: true });
      }
    }

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (before && typeof before.focus === 'function' && document.contains(before)) {
        before.focus({ preventScroll: true });
      }
    };
  }, [active]);

  return ref;
}
