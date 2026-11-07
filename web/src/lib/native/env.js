/*
 * What the native-feeling navigation (lib/native) needs to know about where
 * it is running.
 */

/** Opened from the home screen as an app (iPhone "Add to Home Screen", an installed PWA). */
export const isStandalone = () => typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);

/** The phone layout (the same width the rest of the site switches at). */
export const isPhoneWidth = () => typeof window !== 'undefined'
  && window.matchMedia?.('(max-width: 768px)').matches;

export const wantsLessMotion = () => typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const hasViewTransitions = () => typeof document !== 'undefined'
  && typeof document.startViewTransition === 'function';

/** The page has somewhere to go back to inside the app (React Router counts the entries). */
export const hasAppHistory = () => typeof window !== 'undefined' && window.history.state?.idx > 0;
