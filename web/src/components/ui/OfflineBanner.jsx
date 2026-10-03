import { useEffect, useState } from 'react';
import { WifiSlash } from '@phosphor-icons/react';
import './OfflineBanner.css';

/** While the device is offline: pages already seen still open, from the copy kept then. */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="offline-banner" role="status">
      <WifiSlash size={15} weight="bold" /> You&apos;re offline. Showing what you saw before; ordering needs a connection.
    </div>
  );
}
