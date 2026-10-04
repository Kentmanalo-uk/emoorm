import { useEffect, useState } from 'react';
import { leftLabel } from '../../lib/availability';

/**
 * A countdown to `until` ("Ends in 2h 10m"), refreshed every 30 seconds.
 * Renders nothing once the time has passed. `prefix` says what ends.
 */
export default function TimeLeft({ until, prefix = 'Ends in', className = '' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [until]);
  if (!until || new Date(until).getTime() <= now) return null;
  return (
    <span className={`time-left ${className}`.trim()} role="timer">
      {prefix} {leftLabel(until, now)}
    </span>
  );
}
