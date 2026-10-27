import { useEffect, useMemo, useRef, useState } from 'react';

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

// The dialogs open now, the newest last: only the top one takes Tab and
// Escape, so a confirm over a sheet closes alone.
const open = [];

/**
 * The keyboard for a dialog or sheet, the same in every one: while
 * `active`, focus moves into it, Tab and Shift+Tab stay inside it, Escape
 * closes it (`onClose`, when given), and on closing focus goes back to where
 * it was (the button that opened it). Put the returned ref on the dialog.
 *
 *   const ref = useFocusTrap(isOpen, { onClose });
 *   <div role="dialog" aria-modal="true" ref={ref}>…
 *
 * `modal: false`: a panel beside the page (the chat dock, a card a pin
 * opens on hover): Escape closes it, but focus is neither moved into it nor
 * held there.
 */
export default function useFocusTrap(active, { onClose, modal = true } = {}) {
  // A callback ref (with .current, as an object ref has): the trap starts
  // when the dialog is on the page, also when it appears a frame after
  // `active` (sheets that mount on the next frame were never trapped).
  const [node, setNode] = useState(null);
  const ref = useMemo(() => {
    const attach = (el) => {
      attach.current = el;
      setNode(el);
    };
    attach.current = null;
    return attach;
  }, []);
  // The latest close handler, without restarting the trap when it changes.
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!active || !node) return undefined;
    const box = node;
    const before = document.activeElement;
    const me = {};
    open.push(me);
    const onTop = () => open[open.length - 1] === me;

    const items = () => [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    // Into the dialog, unless something in it already has focus (autoFocus).
    if (modal && !box.contains(document.activeElement)) {
      const first = items()[0];
      if (first) first.focus({ preventScroll: true });
      else {
        if (!box.hasAttribute('tabindex')) box.setAttribute('tabindex', '-1');
        box.focus({ preventScroll: true });
      }
    }

    const onKey = (e) => {
      if (!onTop()) return;
      if (e.key === 'Escape' && closeRef.current) {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !modal) return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      // On the dialog itself (focused when it opened), or outside it: Tab
      // goes to the first item, Shift+Tab to the last, never out.
      if (!list.includes(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
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
      const at = open.indexOf(me);
      if (at >= 0) open.splice(at, 1);
      if (modal && before && typeof before.focus === 'function' && document.contains(before)) {
        before.focus({ preventScroll: true });
      }
    };
  }, [active, modal, node]);

  return ref;
}
