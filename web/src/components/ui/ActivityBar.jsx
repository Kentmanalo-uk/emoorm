import { useEffect, useState } from 'react';
import { useActivityCount } from '../../lib/activity';
import './ActivityBar.css';

// Quick actions finish before this, so they do not flash the bar.
const SHOW_AFTER_MS = 180;
// Once shown it stays a moment, so it reads as movement rather than a flicker.
const MIN_SHOWN_MS = 450;

/**
 * A thin moving line along the top of the screen while an action (a save, a
 * send, an upload) is running: every button's work shows it is happening.
 */
export default function ActivityBar() {
  const running = useActivityCount() > 0;
  const [shown, setShown] = useState(false);
  const [shownAt, setShownAt] = useState(0);

  useEffect(() => {
    if (running && !shown) {
      const timer = setTimeout(() => {
        setShown(true);
        setShownAt(Date.now());
      }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (!running && shown) {
      const timer = setTimeout(() => setShown(false), Math.max(0, MIN_SHOWN_MS - (Date.now() - shownAt)));
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [running, shown, shownAt]);

  return <div className={`ui-activity${shown ? ' is-on' : ''}`} aria-hidden="true" />;
}
