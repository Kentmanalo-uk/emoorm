import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from '@phosphor-icons/react';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import { isBottomNavTab } from '../../lib/navTabs';
import { usePwaInstall } from '../../lib/pwaInstall';
import { inAndroidApp } from '../../lib/inApp';
import './InstallAppBar.css';

const DISMISSED_KEY = 'emoorm-install-bar-dismissed';
const HIDE_FOR_MS = 14 * 24 * 60 * 60 * 1000;

const dismissedRecently = () => {
  try {
    const at = Number(localStorage.getItem(DISMISSED_KEY));
    return at > 0 && Date.now() - at < HIDE_FOR_MS;
  } catch {
    return false;
  }
};

/**
 * Phones, on the buyer pages with the bottom navigation: a small bar above
 * it offering the E-MOORM app. Install opens the app's download page (/app),
 * which hands Android phones the app and shows iPhones how to add E-MOORM to
 * the Home Screen. The x hides it for two weeks. Hidden inside the app, when
 * the site was added to the home screen, and on the Cart page (its own
 * checkout bar sits there).
 */
export default function InstallAppBar() {
  const isPhone = usePhoneLayout();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { installed } = usePwaInstall();
  const [dismissed, setDismissed] = useState(dismissedRecently);
  const show = isPhone && isBottomNavTab(pathname) && pathname !== '/cart'
    && !installed && !inAndroidApp() && !dismissed;

  // Pages leave room for it while it shows.
  useEffect(() => {
    document.body.classList.toggle('has-install-bar', show);
    return () => document.body.classList.remove('has-install-bar');
  }, [show]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Private browsing: it comes back next visit.
    }
    setDismissed(true);
  };

  return (
    <div className="install-bar" role="region" aria-label="Install the app">
      <img src="/icon-192x192.png" alt="" className="install-bar-icon" />
      <span className="install-bar-text">
        <strong>Install the E-MOORM app</strong>
        <span>Shop faster from your home screen</span>
      </span>
      <button type="button" className="install-bar-btn" onClick={() => navigate('/app')}>
        Install
      </button>
      <button type="button" className="install-bar-close" onClick={dismiss} aria-label="Hide install bar">
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
