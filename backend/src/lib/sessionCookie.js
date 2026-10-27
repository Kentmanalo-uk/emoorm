const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * The website keeps its refresh token in an httpOnly cookie, out of reach of
 * the page's scripts: an injected script can read localStorage, but not this.
 *
 * The website asks for it with an `X-Session: cookie` header. For such a
 * request, a refresh token in the answer (sign-in, two-step code, Google, QR
 * sign-in, renewal...) is set as the cookie and taken out of the JSON (app.js
 * moves it), and renewing or signing out reads the cookie when the body has
 * no token. The Android app and older pages send the token in the body as
 * before.
 *
 * Accounts set aside for Switch account each keep their own cookie
 * (`emoorm_rt_<user id>`), so switching never shows the page a token either
 * (auth.controller sessions endpoints).
 */
const NAME = 'emoorm_rt';
const KEPT_PREFIX = 'emoorm_rt_';
const keptName = (userId) => `${KEPT_PREFIX}${String(userId).replace(/[^A-Za-z0-9-]/g, '')}`;
const path = () => `${config.apiPrefix}/auth`;

/** Does this request want cookie sessions? (the website does) */
const wants = (req) => String(req.get('x-session') || '').toLowerCase() === 'cookie';

/** Every cookie on the request, by name. */
const all = (req) => {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 1) continue;
    const name = part.slice(0, at).trim();
    try {
      out[name] = decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      out[name] = part.slice(at + 1).trim();
    }
  }
  return out;
};

const read = (req, name = NAME) => all(req)[name] || null;

const options = (token) => {
  const exp = jwt.decode(token)?.exp;
  const maxAge = exp ? Math.max(0, exp * 1000 - Date.now()) : 30 * 24 * 60 * 60 * 1000;
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict',
    path: path(),
    maxAge,
  };
};

const set = (res, token, name = NAME) => res.cookie(name, token, options(token));

const clear = (res, name = NAME) => res.clearCookie(name, {
  httpOnly: true, secure: config.nodeEnv === 'production', sameSite: 'strict', path: path(),
});

/** The user ids of the accounts set aside in this browser (from their cookies). */
const keptUserIds = (req) => Object.keys(all(req))
  .filter((n) => n.startsWith(KEPT_PREFIX))
  .map((n) => n.slice(KEPT_PREFIX.length))
  .filter(Boolean);

module.exports = { NAME, keptName, wants, read, set, clear, keptUserIds, all };
