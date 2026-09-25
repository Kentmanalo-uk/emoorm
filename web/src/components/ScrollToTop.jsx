import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isAuthSheetPath } from '../lib/authSheet';

// SPA route changes don't reset scroll position by default — jump to top on every navigation.
// Phones: opening the Log in / Sign up sheet, and closing it back onto the
// page underneath, leave that page where it was scrolled to.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const prev = useRef(pathname);
  const underSheet = useRef(isAuthSheetPath(pathname) ? '/' : pathname);

  useEffect(() => {
    const from = prev.current;
    prev.current = pathname;
    const phone = window.matchMedia('(max-width: 768px)').matches;
    if (phone && isAuthSheetPath(pathname)) return;
    if (phone && isAuthSheetPath(from) && pathname === underSheet.current) return;
    underSheet.current = pathname;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
