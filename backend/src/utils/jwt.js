const jwt = require('jsonwebtoken');
const config = require('../config/env');

/**
 * Generate JWT Access Token
 * @param {Object} payload - Data to encode in token
 * @returns {String} JWT token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

/**
 * Generate JWT Refresh Token
 * @param {Object} payload - Data to encode in token
 * @returns {String} JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
};

/**
 * Verify JWT Access Token
 * @param {String} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyAccessToken = (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }

  // Step-up tokens ('mfa-verify', 'mfa-setup', 'google-profile') are signed
  // with this same secret, so without this check they verified as ordinary
  // sessions — and an admin who had entered only a password, but not their
  // second factor, was already holding a fully privileged bearer token. That
  // made MFA decorative: the step-up token reached every authenticated route,
  // including the one that re-enrols the MFA secret.
  //
  // Session tokens from generateTokens() never carry `type`, so rejecting any
  // typed token invalidates nothing that is legitimately in circulation.
  if (decoded?.type) {
    throw new Error('Invalid or expired token');
  }

  return decoded;
};

/**
 * Verify JWT Refresh Token
 * @param {String} token - JWT refresh token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret);
  } catch (error) {
    throw new Error('Invalid or expired refresh token');
  }
};

/**
 * Generate both access and refresh tokens
 * @param {Object} user - User object
 * @returns {Object} Object containing accessToken and refreshToken
 */
const generateTokens = (user) => {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    municipalityId: user.municipalityId,
    // Lets a password change invalidate sessions that already exist.
    // Defaults to 0 so a caller that fetched the user through a select
    // without this column still mints a token that validates.
    tokenVersion: user.tokenVersion ?? 0,
  };

  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

/**
 * Short-lived JWT used to bind a partially authenticated user to a
 * follow-up MFA step. `type` is one of 'mfa-verify' | 'mfa-setup'.
 */
const generateMfaToken = (user, type) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, type },
    config.jwt.secret,
    { expiresIn: '10m' }
  );
};

const verifyMfaToken = (token, expectedType) => {
  const decoded = jwt.verify(token, config.jwt.secret);
  if (!decoded?.type || (expectedType && decoded.type !== expectedType)) {
    throw new Error('Invalid MFA token');
  }
  return decoded;
};

/**
 * Short-lived JWT that binds a first-time Google sign-in to the follow-up
 * "complete your profile" step, without persisting the user until they
 * submit the rest of their details.
 */
const generateGoogleProfileToken = (profile) => {
  return jwt.sign(
    {
      googleId: profile.googleId,
      email: profile.email,
      fullName: profile.fullName,
      profilePhoto: profile.profilePhoto,
      type: 'google-profile',
    },
    config.jwt.secret,
    { expiresIn: '15m' }
  );
};

const verifyGoogleProfileToken = (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new Error('Invalid or expired Google sign-in session');
  }
  if (decoded?.type !== 'google-profile') {
    throw new Error('Invalid Google sign-in session');
  }
  return decoded;
};

/**
 * "Continue with Google" in the Android app (apk/) runs in the phone's
 * browser, since Google blocks its sign-in inside the app's web view. The
 * app starts it with a PKCE-style challenge (SHA-256 of a secret only the app
 * holds); these two short-lived JWTs carry that challenge through Google and
 * back:
 *  - the OAuth `state` sent to Google (the challenge, 10 minutes);
 *  - the one-time pass handed back to the app after Google (the verified
 *    Google profile and the challenge, 5 minutes). Only the app's secret
 *    turns it into a session, so a pass caught on the way is useless.
 * Typed, so neither is ever accepted as a session token.
 */
const verifyTyped = (token, type) => {
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch {
    throw new Error('Invalid or expired Google sign-in');
  }
  if (decoded?.type !== type) throw new Error('Invalid Google sign-in');
  return decoded;
};

const generateGoogleAppState = (challenge) => jwt.sign(
  { challenge, type: 'google-app-state' },
  config.jwt.secret,
  { expiresIn: '10m' }
);

const verifyGoogleAppState = (token) => verifyTyped(token, 'google-app-state');

const generateGoogleAppTicket = (profile, challenge) => jwt.sign(
  {
    googleId: profile.googleId,
    email: profile.email,
    fullName: profile.fullName,
    profilePhoto: profile.profilePhoto,
    challenge,
    type: 'google-app-ticket',
  },
  config.jwt.secret,
  { expiresIn: '5m' }
);

const verifyGoogleAppTicket = (token) => verifyTyped(token, 'google-app-ticket');

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokens,
  generateMfaToken,
  verifyMfaToken,
  generateGoogleProfileToken,
  verifyGoogleProfileToken,
  generateGoogleAppState,
  verifyGoogleAppState,
  generateGoogleAppTicket,
  verifyGoogleAppTicket,
};
