/**
 * Optional error tracking. With SENTRY_DSN set and the @sentry/node package
 * installed, every server-side failure (5xx) and every crash is sent to
 * Sentry with the route and the signed-in user's id (no other personal
 * data). Without either, this does nothing: errors are still logged by the
 * error handler.
 */
let Sentry = null;

if (process.env.SENTRY_DSN) {
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  } catch (err) {
    console.warn(`[errors] SENTRY_DSN is set but @sentry/node could not load (${err.message}); errors are only logged.`);
    Sentry = null;
  }
}

/** Report a request failure (5xx only). */
const reportError = (err, req, statusCode) => {
  if (!Sentry || statusCode < 500) return;
  Sentry.withScope((scope) => {
    scope.setTag('status', String(statusCode));
    if (req) {
      scope.setTag('route', `${req.method} ${req.baseUrl || ''}${req.route?.path || req.path || ''}`);
      if (req.user?.id) scope.setUser({ id: req.user.id });
    }
    Sentry.captureException(err);
  });
};

/** Report a failure outside a request (a job, a crash). */
const reportCrash = (err, context = {}) => {
  if (!Sentry) return;
  Sentry.withScope((scope) => {
    Object.entries(context).forEach(([k, v]) => scope.setTag(k, String(v)));
    Sentry.captureException(err);
  });
};

/** Let queued reports leave before the process exits. */
const flush = (ms = 2000) => (Sentry ? Sentry.flush(ms).catch(() => false) : Promise.resolve(true));

module.exports = { reportError, reportCrash, flush, enabled: () => Boolean(Sentry) };
