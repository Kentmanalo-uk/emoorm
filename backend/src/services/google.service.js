const { OAuth2Client } = require('google-auth-library');
const config = require('../config/env');
const { ApiError } = require('../middleware/errorHandler');

let cachedClient = null;

/**
 * The `postmessage` redirect_uri is a special value used by Google's
 * JavaScript library (and @react-oauth/google) for the popup auth-code flow.
 * The frontend never actually redirects to a URL — Google returns the code via
 * postMessage to the opener — so the backend must pass the same string when
 * exchanging the code for tokens.
 */
const POPUP_REDIRECT_URI = 'postmessage';

const getClient = (redirectUri = POPUP_REDIRECT_URI) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    throw new ApiError('Google sign-in is not configured on this server', 503);
  }
  if (!cachedClient) {
    cachedClient = new OAuth2Client(
      config.google.clientId,
      config.google.clientSecret,
      redirectUri
    );
  }
  return cachedClient;
};

/**
 * Verify a Google-issued ID token and return the normalised payload.
 */
const verifyIdToken = async (idToken) => {
  if (!idToken || typeof idToken !== 'string') {
    throw new ApiError('Google ID token is required', 400);
  }
  const client = getClient();
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: config.google.clientId,
    });
  } catch {
    throw new ApiError('Invalid Google credentials', 401);
  }
  const payload = ticket.getPayload();
  if (!payload) throw new ApiError('Invalid Google credentials', 401);

  const { sub, email, email_verified: emailVerified, name, picture } = payload;
  if (!sub || !email) {
    throw new ApiError('Google account is missing required profile data', 400);
  }
  if (!emailVerified) {
    throw new ApiError('Your Google email address is not verified', 401);
  }

  return {
    googleId: String(sub),
    email: String(email).toLowerCase(),
    fullName: name || null,
    profilePhoto: picture || null,
  };
};

/**
 * Exchange an authorization code (from the popup auth-code flow) for tokens
 * and return the verified profile.
 */
const exchangeCodeForProfile = async (code) => {
  if (!code || typeof code !== 'string') {
    throw new ApiError('Google authorization code is required', 400);
  }
  const client = getClient();
  let tokens;
  try {
    const response = await client.getToken({
      code,
      redirect_uri: POPUP_REDIRECT_URI,
    });
    tokens = response.tokens;
  } catch {
    throw new ApiError('Invalid Google authorization code', 401);
  }
  if (!tokens?.id_token) {
    throw new ApiError('Google did not return an ID token', 401);
  }
  return verifyIdToken(tokens.id_token);
};

module.exports = { verifyIdToken, exchangeCodeForProfile };

