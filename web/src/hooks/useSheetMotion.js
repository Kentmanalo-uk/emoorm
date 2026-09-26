import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Open / close motion for bottom sheets on phones.
 *
 * Sheets opt in with two class names, styled in index.css:
 *   ui-sheet-backdrop  — the dimmed layer (fades in; fades out when closing)
 *   ui-sheet-panel     — the sheet itself (slides up; slides down when closing)
 * and add `is-closing` to the backdrop while the sheet leaves.
 *
 * On wider screens and with reduced motion nothing is delayed, so desktop
 * dialogs close exactly as before.
 */
export const SHEET_CLOSE_MS = 240;

const animatesSheets = () => typeof window !== 'undefined'
  && window.matchMedia('(max-width: 768px)').matches
  && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * For sheets shown by an `open` prop: keeps them mounted while they slide
 * away after `open` turns false.
 *   const { mounted, closing } = useSheetPresence(open);
 *   if (!mounted) return null;
 */
export function useSheetPresence(open) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    if (!animatesSheets()) {
      setMounted(false);
      return undefined;
    }
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, SHEET_CLOSE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { mounted: open || mounted, closing: !open && closing };
}

/**
 * For sheets the parent removes when they close: plays the slide-down first,
 * then calls onClose with the same arguments.
 *   const [closing, close] = useSheetClose(onClose);
 */
export function useSheetClose(onClose) {
  const [closing, setClosing] = useState(false);
  const timer = useRef(null);
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => () => clearTimeout(timer.current), []);

  const close = useCallback((...args) => {
    if (!animatesSheets()) {
      latest.current?.(...args);
      return;
    }
    setClosing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current?.(...args), SHEET_CLOSE_MS);
  }, []);

  return [closing, close];
}
