// "Continue with Google" in the apps comes back to the app's own link: the
// Android app's (shop.emoorm.app), the iPhone app's, or Expo Go's while
// testing. The server takes app links only; anything else gets the Android
// app's link, never a website.
const crypto = require('crypto');
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const config = require('../src/config/env');
const authService = require('../src/services/auth.service');
const { generateGoogleAppState } = require('../src/utils/jwt');

after(() => h.prisma.$disconnect());

const challenge = crypto.createHash('sha256').update(crypto.randomBytes(48).toString('base64url')).digest('base64url');
const EXPO_GO = 'exp://10.0.8.115:8081/--/google-signin';
const ANDROID = 'shop.emoorm.app:/google-signin';

const withCallback = (url, fn) => {
  const saved = config.google.appCallbackUrl;
  config.google.appCallbackUrl = url;
  try { return fn(); } finally { config.google.appCallbackUrl = saved; }
};

test('the website page carries an app return link to the sign-in page', () => withCallback('', () => {
  const url = new URL(authService.googleAppStartUrl(challenge, EXPO_GO));
  assert.equal(url.pathname, '/app-google');
  assert.equal(url.searchParams.get('challenge'), challenge);
  assert.equal(url.searchParams.get('return'), EXPO_GO);

  for (const ret of ['shop.emoorm.app://google-signin', 'emoorm://google-signin', 'com.emoorm.marketplace://google-signin']) {
    assert.equal(new URL(authService.googleAppStartUrl(challenge, ret)).searchParams.get('return'), ret);
  }
}));

test('a website, or a link with its own query, is not taken as the return link', () => withCallback('', () => {
  for (const ret of ['https://evil.example/steal', 'javascript:alert(1)', 'exp://x/--/google-signin?ticket=1', 'exp://x#y', 'nonsense']) {
    const url = new URL(authService.googleAppStartUrl(challenge, ret));
    assert.equal(url.searchParams.get('return'), null, ret);
  }
  // Without one: the page as before (the Android app's link).
  assert.equal(new URL(authService.googleAppStartUrl(challenge)).searchParams.get('return'), null);
}));

test('a bad request goes back to the app that asked, or the Android app', () => withCallback('', () => {
  assert.equal(authService.googleAppStartUrl('short', EXPO_GO), `${EXPO_GO}?error=invalid_request`);
  assert.equal(authService.googleAppStartUrl('short', 'https://evil.example/'), `${ANDROID}?error=invalid_request`);
}));

test("the server's own Google redirect keeps the return link in its state", async () => {
  // Google said no: back to the app that asked, with "cancelled".
  const state = generateGoogleAppState(challenge, EXPO_GO);
  assert.equal(await authService.googleAppFinishUrl({ error: 'access_denied', state }), `${EXPO_GO}?error=cancelled`);
  // An old state without one: the Android app.
  const old = generateGoogleAppState(challenge);
  assert.equal(await authService.googleAppFinishUrl({ error: 'access_denied', state: old }), `${ANDROID}?error=cancelled`);
  // A forged state: the Android app, "expired".
  assert.equal(await authService.googleAppFinishUrl({ code: 'x', state: 'not-a-token' }), `${ANDROID}?error=expired`);
});
