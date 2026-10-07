import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowCircleUp, X } from '@phosphor-icons/react';
import { appUpdateAvailable, release } from '../lib/appRelease';
import './AppUpdateBar.css';

/*
 * Inside the Android app on an older version: a small card saying a new one
 * is out, with Update (the /app page: what's new, then the download) and a
 * close button that hides it for the rest of the day. Not on /app itself,
 * which says the same in its own button.
 */

const KEY = 'emoorm-app-update-later';
// Today on this phone, e.g. 2026-10-07.
const today = () => new Date().toLocaleDateString('en-CA');

const laterToday = () => {
  try {
    return localStorage.getItem(KEY) === `${release.version}|${today()}`;
  } catch {
    return false;
  }
};

export default function AppUpdateBar() {
  const { pathname } = useLocation();
  const [hidden, setHidden] = useState(laterToday);

  if (hidden || pathname === '/app' || !appUpdateAvailable()) return null;

  const later = () => {
    try {
      localStorage.setItem(KEY, `${release.version}|${today()}`);
    } catch {
      /* hidden for this visit only */
    }
    setHidden(true);
  };

  return (
    <div className="app-update" role="status">
      <ArrowCircleUp size={26} weight="fill" className="app-update-icon" aria-hidden="true" />
      <div className="app-update-text">
        <strong>Update available</strong>
        <span>{`E-MOORM ${release.version} is ready`}</span>
      </div>
      <Link to="/app" className="app-update-go" onClick={() => setHidden(true)}>Update</Link>
      <button type="button" className="app-update-close" onClick={later} aria-label="Later">
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}
