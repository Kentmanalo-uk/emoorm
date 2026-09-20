#!/usr/bin/env node
/**
 * Diagnose the outgoing-mail setup.
 *
 *   node scripts/email-check.js                  # check only, sends nothing
 *   node scripts/email-check.js you@example.com  # also send one real test email
 *
 * Written because "the reset email never arrived" has several very different
 * causes — a rejected API key, an unverified sender, a recipient the sandbox
 * refuses — and they are indistinguishable from inside the app, which reports
 * the same generic success either way.
 *
 * The API key is read from the environment and never printed.
 */
const config = require('../src/config/env');
const { sendMail, isResendConfigured, isSmtpConfigured } = require('../src/utils/email');

const SANDBOX = 'onboarding@resend.dev';
const recipient = process.argv[2];

const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => console.log(`  ✗ ${m}`);
const info = (m) => console.log(`    ${m}`);

async function main() {
  console.log('\nOutgoing mail configuration\n');

  const from = config.resend?.from || config.email?.from || '(none)';
  console.log(`  transport : ${isResendConfigured() ? 'Resend HTTP API' : isSmtpConfigured() ? 'SMTP' : 'dev console only'}`);
  console.log(`  sender    : ${from}`);
  console.log(`  frontend  : ${config.frontendUrl}`);
  console.log('');

  if (!isResendConfigured() && !isSmtpConfigured()) {
    bad('No transport configured — mail is only written to the server console.');
    info('Set RESEND_API_KEY in backend/.env.');
    return;
  }

  // --- Is the key real? --------------------------------------------------
  //
  // Authentication is probed against the SEND endpoint, not /domains: a key
  // created with "Sending access" cannot list domains at all, so judging it
  // by /domains reports a perfectly good key as invalid. The payload is
  // deliberately incomplete — a key that authenticates gets a validation
  // error back, an unrecognised one gets an auth error, and neither sends.
  let domains = null;
  if (isResendConfigured()) {
    const auth = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resend.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const authBody = await auth.json().catch(() => ({}));
    const rejected = /api key/i.test(authBody.message || '');

    if (rejected) {
      bad(`Resend rejected the API key (HTTP ${auth.status}: ${authBody.message}).`);
      info('Nothing can send until this is fixed:');
      info('  1. Create a key at https://resend.com/api-keys (Sending access is enough).');
      info('  2. Put it in backend/.env as  RESEND_API_KEY=re_...');
      info('  3. Restart the backend so the file is re-read.');
      return;
    }

    ok('The API key authenticates.');

    // Listing domains needs broader permissions than sending does, so a
    // failure here is information, not a fault.
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${config.resend.apiKey}` },
    });
    if (res.ok) {
      domains = (await res.json().catch(() => ({}))).data || [];
    } else {
      info('(This key cannot list domains — that is normal for a send-only key.)');
    }
  }

  // --- Can it reach anyone? ----------------------------------------------
  const usingSandbox = String(from).includes(SANDBOX);
  const verified = (domains || []).filter((d) => d.status === 'verified');

  if (domains) {
    if (!domains.length) {
      info('No sending domains registered on this account.');
    } else {
      for (const d of domains) {
        const mark = d.status === 'verified' ? '✓' : '·';
        info(`${mark} ${d.name} — ${d.status}`);
      }
    }
  }

  if (usingSandbox) {
    bad('Sender is the shared sandbox address.');
    info('It ONLY delivers to the address that owns your Resend account.');
    info('Every other recipient is accepted and silently discarded — which is');
    info('why a password reset can look like it worked and reach nobody.');
    if (verified.length) {
      info('');
      info(`You already have a verified domain. Set RESEND_FROM="E-MOORM <noreply@${verified[0].name}>".`);
    } else {
      info('');
      info('To reach real users: add a domain at https://resend.com/domains,');
      info('publish the DKIM/SPF records, then set RESEND_FROM to an address on it.');
      info('Note: a *.resend.app address is for RECEIVING mail and cannot send.');
    }
  } else if (verified.some((d) => String(from).includes(d.name))) {
    ok('Sender is on a verified domain — it can reach any recipient.');
  } else {
    bad(`Sender "${from}" is not on a verified domain on this account.`);
    info('Resend will reject sends from it.');
  }

  // --- Optional live send -------------------------------------------------
  if (!recipient) {
    console.log('\nNo recipient given, so nothing was sent.');
    console.log('To send one real test email:  node scripts/email-check.js you@example.com\n');
    return;
  }

  console.log(`\nSending a test email to ${recipient} …`);
  try {
    const result = await sendMail({
      to: recipient,
      subject: 'E-MOORM email test',
      text: 'This is a test from scripts/email-check.js. If you can read this, password reset emails will work.',
      html: '<p>This is a test from <code>scripts/email-check.js</code>.</p>'
        + '<p>If you can read this, password reset emails will work.</p>',
    });
    ok(`Accepted by ${result.transport}${result.messageId ? ` (id ${result.messageId})` : ''}.`);
    if (usingSandbox) {
      info('Accepted is not delivered: with the sandbox sender this only lands');
      info('if the recipient is your own Resend account address.');
    }
  } catch (err) {
    bad(`Rejected: ${err.message}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('\nFailed:', err.message, '\n');
  process.exit(1);
});
