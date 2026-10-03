/**
 * setInterval for keeping something fresh from the server, but only while
 * the page is in view: a hidden tab or a phone in a pocket does not keep
 * asking. Coming back into view checks once straight away.
 *
 * @param {Function} fn - what to run (sync or async; errors are its own)
 * @param {Number} ms - how often while the page is visible
 * @returns {Function} stop
 */
export function pollWhileVisible(fn, ms) {
  const run = () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    fn();
  };
  const timer = setInterval(run, ms);
  const onVisible = () => {
    if (!document.hidden) fn();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
