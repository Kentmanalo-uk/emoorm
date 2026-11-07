/**
 * Continue with Facebook: the Facebook side of it.
 *
 * The website sends the person to Facebook's login dialog, and Facebook
 * sends them back to the site's /facebook-return page with a one-time code.
 * Here that code is swapped (with the app secret) for an access token, and
 * the token for who they are: their id for this app, their name and their
 * email. Nothing is stored about Facebook beyond that id.
 */
const crypto = require('crypto');
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

const GRAPH = 'https://graph.facebook.com/v21.0';
const RETURN_PATH = '/facebook-return';

const enabled = () => Boolean(config.facebook.appId && config.facebook.appSecret);

/** The site's own addresses Facebook may send people back to (as in the Meta app). */
const returnOrigins = () => {
  const origins = new Set();
  try {
    const site = new URL(config.frontendUrl);
    origins.add(site.origin);
    const bare = site.hostname.replace(/^www\./, '');
    origins.add(`${site.protocol}//${bare}${site.port ? `:${site.port}` : ''}`);
    origins.add(`${site.protocol}//www.${bare}${site.port ? `:${site.port}` : ''}`);
  } catch { /* no site address: nothing is allowed */ }
  if (config.nodeEnv !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:5173');
  }
  return origins;
};

/** Only this site's /facebook-return, exactly: no other page, no query. */
const isReturnUri = (uri) => {
  if (typeof uri !== 'string' || uri.length > 300) return false;
  try {
    const u = new URL(uri);
    return u.pathname === RETURN_PATH && !u.search && !u.hash && returnOrigins().has(u.origin);
  } catch {
    return false;
  }
};

/** A Graph API call; any failure reads as a failed sign-in, never a crash. */
const graph = async (path, params) => {
  let res;
  let body;
  try {
    res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(10000) });
    body = await res.json().catch(() => ({}));
  } catch {
    throw new ApiError('Facebook did not answer. Please try again.', 502);
  }
  if (!res.ok || body?.error) {
    throw new ApiError('Facebook sign-in failed. Please try again.', 401);
  }
  return body;
};

/**
 * The person a Facebook login code belongs to.
 * @returns {Promise<{ facebookId: string, email: string|null, fullName: string, profilePhoto: null }>}
 */
const exchangeCodeForProfile = async (code, redirectUri) => {
  if (!enabled()) throw new ApiError('Facebook sign-in is not available yet', 503);
  if (typeof code !== 'string' || !code || code.length > 2000) {
    throw new ApiError('Facebook sign-in code is missing', 400);
  }
  if (!isReturnUri(redirectUri)) throw new ApiError('Facebook sign-in came back to the wrong page', 400);

  const { appId, appSecret } = config.facebook;
  const token = await graph('/oauth/access_token', {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
  if (!token?.access_token) throw new ApiError('Facebook sign-in failed. Please try again.', 401);

  // appsecret_proof: the token alone is not enough to use it, only with
  // this server's secret.
  const proof = crypto.createHmac('sha256', appSecret).update(token.access_token).digest('hex');
  const me = await graph('/me', {
    fields: 'id,name,email',
    access_token: token.access_token,
    appsecret_proof: proof,
  });
  if (!me?.id) throw new ApiError('Facebook sign-in failed. Please try again.', 401);

  return {
    facebookId: String(me.id),
    email: typeof me.email === 'string' && me.email.includes('@') ? me.email.trim().toLowerCase() : null,
    fullName: typeof me.name === 'string' ? me.name.trim() : '',
    // Facebook's picture links expire, so none is kept: the person picks a
    // photo or an avatar on E-MOORM as anyone else does.
    profilePhoto: null,
  };
};

/** What the website needs to send people to Facebook (nothing secret). */
const publicConfig = () => (enabled() ? { enabled: true, appId: config.facebook.appId } : { enabled: false });

module.exports = {
  enabled, exchangeCodeForProfile, publicConfig, isReturnUri, RETURN_PATH,
};
