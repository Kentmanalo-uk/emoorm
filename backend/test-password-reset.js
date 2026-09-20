/**
 * Password reset / session invalidation checks.
 *
 * Runs against the dev database and cleans up after itself. The email module
 * is stubbed before the service loads, so nothing leaves this machine and no
 * Resend quota is spent — the transport itself is covered separately by
 * test:email-transport.
 *
 *   node test-password-reset.js      (or: npm run test:password-reset)
 */
const crypto = require('crypto');
const path = require('path');

// ---------------------------------------------------------------------------
// Stub the email module before anything requires it, and keep what was sent.
// ---------------------------------------------------------------------------
const emailPath = require.resolve('./src/utils/email');
require(emailPath);
const sent = [];
require.cache[emailPath].exports = {
  sendMail: async () => ({ messageId: 'stub', delivered: false, transport: 'stub' }),
  sendPasswordResetEmail: async ({ user, token, resetUrl }) => {
    sent.push({ kind: 'reset', to: user.email, token, resetUrl });
    return { messageId: 'stub', delivered: false, transport: 'stub' };
  },
  sendPasswordChangedEmail: async ({ user }) => {
    sent.push({ kind: 'changed', to: user.email });
    return { messageId: 'stub', delivered: false, transport: 'stub' };
  },
  isSmtpConfigured: () => false,
  isResendConfigured: () => false,
};

const prisma = require('./src/config/database');
const authService = require('./src/services/auth.service');
const userRepository = require('./src/repositories/user.repository');
const { generateTokens, verifyAccessToken } = require('./src/utils/jwt');
const { comparePassword, hashPassword } = require('./src/utils/password');

const STAMP = Date.now();
const EMAIL = `pwreset-${STAMP}@example.test`;
const OLD_PASSWORD = 'OldPassw0rd!';
const NEW_PASSWORD = 'BrandNewPassw0rd!';

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const section = (title) => console.log(`\n${title}`);

async function main() {
  const municipality = await prisma.municipality.findFirst({ select: { id: true } });
  if (!municipality) throw new Error('No municipality in the database — run the seed first.');

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      password: await hashPassword(OLD_PASSWORD),
      fullName: 'Password Reset Probe',
      municipalityId: municipality.id,
      role: 'BUYER',
      isActive: true,
    },
    select: { id: true, email: true, role: true, municipalityId: true, tokenVersion: true },
  });

  try {
    // -----------------------------------------------------------------------
    section('1. A fresh account starts at version 0 and its tokens say so');
    check('tokenVersion defaults to 0', user.tokenVersion === 0, `got ${user.tokenVersion}`);

    const original = generateTokens(user);
    const decoded = verifyAccessToken(original.accessToken);
    check('access token carries the tokenVersion claim', decoded.tokenVersion === 0, `got ${decoded.tokenVersion}`);

    const refreshed = await authService.refreshToken(original.refreshToken);
    check('refresh works while the version matches', Boolean(refreshed?.accessToken));

    // -----------------------------------------------------------------------
    section('2. forgot-password stores only a hash, and emails the real token');
    sent.length = 0;
    await authService.forgotPassword(EMAIL);

    const resetMail = sent.find((m) => m.kind === 'reset');
    check('a reset email was sent', Boolean(resetMail));
    check('the email went to the right address', resetMail?.to === EMAIL);

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordResetToken: true, passwordResetExpiry: true },
    });
    const plain = resetMail?.token;
    check('a reset token was stored', Boolean(row.passwordResetToken));
    check(
      'the stored value is the SHA-256, never the token itself',
      row.passwordResetToken !== plain
        && row.passwordResetToken === crypto.createHash('sha256').update(plain).digest('hex'),
    );
    const ttlMinutes = Math.round((row.passwordResetExpiry - Date.now()) / 60000);
    check('it expires in about an hour', ttlMinutes > 50 && ttlMinutes <= 60, `got ${ttlMinutes} min`);
    check(
      'the reset link points at the configured frontend',
      typeof resetMail?.resetUrl === 'string' && resetMail.resetUrl.includes(`token=${plain}`),
    );

    // -----------------------------------------------------------------------
    section('3. An unknown address is indistinguishable from a known one');
    sent.length = 0;
    const ghost = await authService.forgotPassword(`nobody-${STAMP}@example.test`);
    check('no email is sent for an unregistered address', sent.length === 0);
    check('and nothing is leaked in the return value', ghost?.delivered === false);

    // -----------------------------------------------------------------------
    section('4. reset-password swaps the password and retires every session');
    sent.length = 0;
    await authService.resetPassword(plain, NEW_PASSWORD);

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { password: true, tokenVersion: true, passwordResetToken: true, passwordResetExpiry: true },
    });

    check('the new password works', await comparePassword(NEW_PASSWORD, after.password));
    check('the old password does not', !(await comparePassword(OLD_PASSWORD, after.password)));
    check('tokenVersion was bumped', after.tokenVersion === 1, `got ${after.tokenVersion}`);
    check('the reset token was cleared', after.passwordResetToken === null && after.passwordResetExpiry === null);
    check('the owner was told their password changed', sent.some((m) => m.kind === 'changed' && m.to === EMAIL));

    // -----------------------------------------------------------------------
    section('5. The session that existed before the reset is dead');
    let refreshRejected = false;
    try {
      await authService.refreshToken(original.refreshToken);
    } catch {
      refreshRejected = true;
    }
    check('the pre-reset refresh token is refused', refreshRejected);

    const staleClaim = verifyAccessToken(original.accessToken).tokenVersion ?? 0;
    check(
      'the pre-reset access token fails the middleware comparison',
      staleClaim !== after.tokenVersion,
      `claim ${staleClaim} vs stored ${after.tokenVersion}`,
    );

    // A token minted now, after the reset, must still work.
    const current = await userRepository.findById(user.id);
    check('findById exposes tokenVersion for minting', current.tokenVersion === 1, `got ${current.tokenVersion}`);
    const fresh = generateTokens(current);
    const freshOk = await authService.refreshToken(fresh.refreshToken);
    check('a token minted after the reset still works', Boolean(freshOk?.accessToken));

    // -----------------------------------------------------------------------
    section('6. A reset token is single use');
    let reuseRejected = false;
    try {
      await authService.resetPassword(plain, 'YetAnotherPassw0rd!');
    } catch (err) {
      reuseRejected = /invalid or expired/i.test(err.message);
    }
    check('replaying the same reset token is refused', reuseRejected);

    // -----------------------------------------------------------------------
    section('7. change-password signs out other devices but not the caller');
    sent.length = 0;
    const beforeChange = await userRepository.findById(user.id);
    const sessionA = generateTokens(beforeChange); // "another device"

    const returned = await authService.changePassword(user.id, NEW_PASSWORD, 'ThirdPassw0rd!');
    check('it hands back a replacement token pair', Boolean(returned?.accessToken && returned?.refreshToken));

    const afterChange = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    check('tokenVersion moved again', afterChange.tokenVersion === 2, `got ${afterChange.tokenVersion}`);
    check('the owner was emailed about it', sent.some((m) => m.kind === 'changed'));

    let otherDeviceRejected = false;
    try {
      await authService.refreshToken(sessionA.refreshToken);
    } catch {
      otherDeviceRejected = true;
    }
    check('the other device is signed out', otherDeviceRejected);

    const callerOk = await authService.refreshToken(returned.refreshToken);
    check('the caller stays signed in with the returned pair', Boolean(callerOk?.accessToken));

    // -----------------------------------------------------------------------
    section('8. A wrong current password changes nothing');
    let wrongRejected = false;
    try {
      await authService.changePassword(user.id, 'NotThePassword!', 'Whatever123!');
    } catch (err) {
      wrongRejected = err.statusCode === 401;
    }
    check('it is rejected with 401', wrongRejected);
    const untouched = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenVersion: true },
    });
    check('and the session counter did not move', untouched.tokenVersion === 2, `got ${untouched.tokenVersion}`);
  } finally {
    await prisma.user.deleteMany({ where: { email: { contains: String(STAMP) } } });
    console.log('\nCleaned up the probe account.');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nFATAL:', err);
  await prisma.user.deleteMany({ where: { email: { contains: String(STAMP) } } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
