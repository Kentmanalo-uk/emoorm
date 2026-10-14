import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Focus what a "Delivery places and fees" panel was opened from (its
 * data-dpl-focus), once React has drawn the page again; "Add a place" or the
 * section title when that is gone.
 */
export const focusLater = (key) => {
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-dpl-focus="${key}"]`)
      || document.querySelector('[data-dpl-focus="add"]')
      || document.getElementById('dpl-title');
    el?.focus();
  });
};

/**
 * The one inline panel open in the section: { kind, place }. open(next,
 * from): `from` is the data-dpl-focus of what opened it; focus goes back
 * there when the panel closes.
 */
export default function useInlinePanel() {
  const [panel, setPanel] = useState(null);
  const from = useRef(null);
  const open = useCallback((next, trigger) => {
    from.current = trigger || null;
    setPanel(next);
  }, []);
  const close = useCallback(() => setPanel(null), []);
  useEffect(() => {
    if (panel || !from.current) return;
    const key = from.current;
    from.current = null;
    focusLater(key);
  }, [panel]);
  return { panel, open, close };
}
