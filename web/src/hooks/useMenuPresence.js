import { useEffect, useState } from 'react';

/** As long as the shrink-back in styles/menu-pop.css (0.06 s wait + 0.28 s). */
export const MENU_CLOSE_MS = 340;

/**
 * Keeps a pop-over menu on the page while it shrinks back into its button.
 *
 *   const menu = useMenuPresence(open);
 *   {menu.mounted && <div className={`x menu-pop${menu.closing ? ' is-closing' : ''}`}>…}
 *
 * `mounted` is true while the menu is open and for the length of its close;
 * `closing` is true only during the close. Opening again mid-close turns it
 * straight back.
 */
export default function useMenuPresence(open, ms = MENU_CLOSE_MS) {
  const [lingering, setLingering] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Closed this render: keep it on the page for the shrink.
  if (open !== wasOpen) {
    setWasOpen(open);
    setLingering(!open);
  }

  useEffect(() => {
    if (!lingering) return undefined;
    const t = setTimeout(() => setLingering(false), ms);
    return () => clearTimeout(t);
  }, [lingering, ms]);

  return { mounted: open || lingering, closing: !open && lingering };
}
