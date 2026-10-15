import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { leftLabel } from '../../../lib/availability';

/**
 * A countdown to `until` ("Confirm in 2h 10m"), refreshed every 30 seconds
 * (web/src/components/ui/TimeLeft.jsx). Renders nothing once the time has
 * passed. `prefix` says what ends; `style` is the line's text style.
 */
export default function TimeLeft({ until, prefix = 'Ends in', style }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until || new Date(until).getTime() <= now) return null;
  return (
    <Text style={style} accessibilityRole="timer">
      {prefix} {leftLabel(until, now)}
    </Text>
  );
}
