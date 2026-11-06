import { useCallback, useEffect, useRef } from 'react';

/**
 * A menu or card that opens when the mouse rests on it and closes a moment
 * after the mouse leaves, the way the notifications card does. Touch and
 * the keyboard still open it by clicking, so only mouse pointers count.
 *
 * `dismiss()` closes it after a choice (a link in it, the trigger itself)
 * and keeps it shut until the mouse has left, so it does not spring open
 * again under a pointer that has not moved. `hovering()` is true while
 * the mouse is over it: a click then keeps it open rather than toggling
 * it shut under the pointer.
 */
export default function useHoverMenu(setOpen, { openDelay = 70, closeDelay = 160 } = {}) {
  const timer = useRef(0);
  const shut = useRef(false);
  const inside = useRef(false);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerEnter = useCallback((e) => {
    if (e.pointerType !== 'mouse') return;
    inside.current = true;
    window.clearTimeout(timer.current);
    if (shut.current) return;
    timer.current = window.setTimeout(() => setOpen(true), openDelay);
  }, [setOpen, openDelay]);

  const onPointerLeave = useCallback((e) => {
    if (e.pointerType !== 'mouse') return;
    inside.current = false;
    shut.current = false;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), closeDelay);
  }, [setOpen, closeDelay]);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    if (inside.current) shut.current = true;
    setOpen(false);
  }, [setOpen]);

  const hovering = useCallback(() => inside.current, []);

  return { hoverProps: { onPointerEnter, onPointerLeave }, dismiss, hovering };
}
