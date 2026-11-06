import {
  useEffect, useLayoutEffect, useRef, useState,
} from 'react';
import useHoverMenu from './useHoverMenu';

/** Closes an open card on a click outside it or on Escape. */
export function useCloseAway(ref, open, setOpen) {
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [ref, open, setOpen]);
}

/**
 * Puts the middle of the button a card opens from into --hc-x on `ref`
 * (the wrapper around the button and its card), measured from the
 * wrapper's edge: the wrapper is just the button's width, so that is half
 * of it. The card's arrow points there, and the card grows out of there.
 */
export function useArrowAt(ref, open) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    el.style.setProperty('--hc-x', `${Math.round(el.offsetWidth / 2)}px`);
  }, [ref, open]);
}

/** Open state for one header card: hover, click, outside click, Escape. */
export function useHeadCard() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { hoverProps, dismiss, hovering } = useHoverMenu(setOpen);
  useCloseAway(ref, open, setOpen);
  useArrowAt(ref, open);
  const toggle = () => setOpen((v) => (hovering() ? true : !v));
  return { open, ref, hoverProps, dismiss, toggle };
}
