#!/usr/bin/env node
/**
 * Mint a password reset link for a local account and print it.
 *
 *   node scripts/reset-link.js someone@example.com
 *
 * For testing the reset screen when email cannot be delivered — which is the
 * normal state until a sending domain is verified, since Resend's sandbox only
 * delivers to the account owner's own address.
 *
 * This is the same token the email would have carried: it is generated here,
 * only its SHA-256 is stored, and it expires in an hour like any other. That
 * is safe to print because it requires shell and database access, which is
 * strictly more than an attacker sending an HTTP request has — but it is
 * refused outright in production, where that reasoning stops holding.
 */
const crypto = require('crypto');
const config = require('../src/config/env');
const prisma = require('../src/config/database');

const email = process.argv[2];

async function main() {
  if (config.nodeEnv === 'production') {
    console.error('\nRefusing to run in production.\n');
    process.exit(1);
  }

  if (!email) {
    console.error('\nUsage: node scripts/reset-link.js someone@example.com\n');
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, fullName: true, role: true, isActive: true, deletedAt: true },
  });

  if (!user) {
    console.error(`\nNo account with that email. The app would return its usual generic`);
    console.error('message here and send nothing, which is how it avoids confirming');
    console.error('whether an address is registered.\n');
    process.exit(1);
  }
  if (user.deletedAt) {
    console.error('\nThat account is deleted — a real reset request would be ignored.\n');
    process.exit(1);
  }

  // Mirrors auth.service.forgotPassword exactly, minus the email.
  const token = crypto.randomBytes(32).toString('hex');
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const expiry = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetToken: hashed, passwordResetExpiry: expiry },
  });

  const base = String(config.frontendUrl).replace(/\/$/, '');
  console.log(`\n  account : ${user.fullName} <${user.email}> (${user.role})`);
  console.log(`  expires : ${expiry.toLocaleString()}`);
  console.log(`\n  ${base}/reset-password?token=${token}\n`);
  console.log('  Any reset link issued for this account before now is void.\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\nFailed:', err.message, '\n');
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
