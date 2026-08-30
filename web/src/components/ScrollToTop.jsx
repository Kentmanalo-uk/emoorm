import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// SPA route changes don't reset scroll position by default — jump to top on every navigation.
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
