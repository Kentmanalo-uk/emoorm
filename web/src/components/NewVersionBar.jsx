import { ArrowsClockwise } from '@phosphor-icons/react';
import { useNewBuild, applyNewBuild } from '../lib/freshness';
import { inAndroidApp } from '../lib/inApp';
import './AppUpdateBar.css';

/*
 * The website was updated while this page was open: a small card offering
 * to refresh. In a browser only; inside the Android app the page reloads
 * itself as soon as it is safe (lib/freshness.js), so there is nothing to
 * ask.
 */
export default function NewVersionBar() {
  const newBuild = useNewBuild();
  if (!newBuild || inAndroidApp()) return null;

  return (
    <div className="app-update" role="status">
      <ArrowsClockwise size={26} weight="fill" className="app-update-icon" aria-hidden="true" />
      <div className="app-update-text">
        <strong>E-MOORM was updated</strong>
        <span>Refresh to get the latest version</span>
      </div>
      <button type="button" className="app-update-go" onClick={applyNewBuild}>Refresh</button>
    </div>
  );
}
