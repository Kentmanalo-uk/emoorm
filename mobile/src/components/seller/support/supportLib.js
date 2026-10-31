import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { t, themed } from '../../../theme';

/*
 * What the Seller Center's "Admin messages" share (web/src/components/
 * support/SupportChat.jsx, mode "user"): poll timings, labels, the status
 * badges' colours and the times as the website prints them.
 */

export const THREAD_POLL_MS = 5000;
export const LIST_POLL_MS = 15000;

export const TOPIC_LABELS = {
  IDENTITY_VERIFICATION: 'Identity verification',
  GENERAL: 'General help',
  DIRECT: 'Direct message',
};

// .sc-badge-open / -resolved / -closed / -rated
export const BADGE = themed(() => ({
  OPEN: { backgroundColor: t.primary[50], color: t.primary[700] },
  RESOLVED: { backgroundColor: t.success[100], color: t.success[800] },
  CLOSED: { backgroundColor: t.neutral[200], color: t.neutral[600] },
  RATED: { backgroundColor: t.warning[100], color: t.warning[800] },
}));

/** "3:05 PM" today, "Oct 9" before (the website's formatTime). */
export const formatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

/** The case's title: its subject, else who holds it. */
export const titleFor = (c) => c.subject || (c.topic === 'DIRECT'
  ? `${c.municipality?.name || 'Municipal'} Admin`
  : `${c.municipality?.name || 'Municipal'} Support`);

/** Runs `fn` now and every `ms` while the app is in front (the website's pollWhileVisible). */
export function usePoll(fn, ms, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => saved.current(), ms);
    };
    const stop = () => { clearInterval(timer); timer = null; };
    saved.current();
    start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { saved.current(); start(); } else stop();
    });
    return () => { stop(); sub.remove(); };
  }, [ms, enabled]);
}
