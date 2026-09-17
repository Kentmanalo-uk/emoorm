import { useEffect, useState, useSyncExternalStore } from 'react';

const COMPACT_QUERY = '(max-width: 1024px)';

const subscribe = (onChange) => {
  const media = window.matchMedia(COMPACT_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const getSnapshot = () => window.matchMedia(COMPACT_QUERY).matches;

/** True on tablet/phone widths, where the Seller/Admin sidebar becomes a drawer. */
export function useCompactLayout() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/**
 * Open/close state for the Seller/Admin navigation drawer on small screens.
 * Closes on navigation and Escape, and locks page scroll while open.
 */
export function useMobileNav(pathname) {
  const [openPath, setOpenPath] = useState(null);
  const open = openPath !== null && openPath === pathname;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpenPath(null); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return {
    open,
    show: () => setOpenPath(pathname),
    hide: () => setOpenPath(null),
    toggle: () => setOpenPath((current) => (current === pathname ? null : pathname)),
  };
}
