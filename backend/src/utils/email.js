const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const config = require('../config/env');

const SANDBOX_SENDER = 'onboarding@resend.dev';

let cachedResend = null;
let cachedTransporter = null;
let cachedTransporterKind = null;
let warnedSandbox = false;

const isResendConfigured = () => Boolean(config.resend?.apiKey);

const isSmtpConfigured = () =>
  Boolean(config.email?.host && config.email?.user && config.email?.password);

const buildJsonTransporter = () =>
  nodemailer.createTransport({ jsonTransport: true });

const getResend = () => {
  if (!cachedResend) cachedResend = new Resend(config.resend.apiKey);
  return cachedResend;
};

/**
 * Resend's shared sandbox sender only delivers to the address that owns the
 * Resend account. Every other recipient is accepted by the API and then
 * quietly dropped, which looks identical to success from in here — so say it
 * out loud once, rather than leaving someone to wonder why the reset email
 * never arrives.
 */
const warnIfSandboxSender = (from) => {
  if (warnedSandbox || !String(from).includes(SANDBOX_SENDER)) return;
  warnedSandbox = true;
  console.warn(
    `[email] Sender is ${SANDBOX_SENDER} (Resend's sandbox).\n` +
    '        Mail will ONLY reach the address that owns your Resend account.\n' +
    '        Every other recipient is accepted and silently discarded.\n' +
    '        To send to real users: verify a domain at https://resend.com/domains,\n' +
    '        then set RESEND_FROM="E-MOORM <noreply@yourdomain>".'
  );
};

/**
 * Build (and cache) an SMTP or dev transporter.
 *   - Real SMTP when SMTP_HOST/USER/PASSWORD are configured.
 *   - Otherwise a local "JSON" transport that captures the message in memory
 *     so dev flows work offline. The reset link is printed to the server
 *     console by the controller in that case.
 */
const getTransporter = () => {
  if (cachedTransporter) {
    return { transporter: cachedTransporter, kind: cachedTransporterKind };
  }

  if (isSmtpConfigured()) {
    cachedTransporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.password,
      },
    });
    cachedTransporterKind = 'smtp';
  } else {
    cachedTransporter = buildJsonTransporter();
    cachedTransporterKind = 'json';
    console.log(
      '[email] No transport configured — using in-memory JSON transport. ' +
      'Emails will be logged to the console only. ' +
      'Set RESEND_API_KEY (or SMTP_HOST/SMTP_USER/SMTP_PASSWORD) to send real messages.'
    );
  }

  return { transporter: cachedTransporter, kind: cachedTransporterKind };
};

/**
 * Send one message. Prefers Resend's HTTP API, falls back to SMTP, then to the
 * in-memory dev transport.
 *
 * @returns {Promise<{ messageId: string|null, delivered: boolean, transport: string }>}
 *          `delivered` means the provider accepted the message — not that it
 *          reached an inbox.
 * @throws  {Error} when a configured transport rejects the message. Callers
 *          that must not fail on a send error catch it themselves.
 */
const sendMail = async ({ to, subject, html, text }) => {
  const from = config.resend?.from || config.email?.from || 'noreply@emoorm.com';

  if (isResendConfigured()) {
    warnIfSandboxSender(from);

    const { data, error } = await getResend().emails.send({
      from,
      to: [to],
      subject,
      html,
      text,
    });

    // The SDK reports failures in `error` rather than by throwing, so an
    // unchecked call here would record every rejected send as a success.
    if (error) {
      const err = new Error(error.message || 'Resend rejected the message');
      err.name = error.name || 'ResendError';
      throw err;
    }

    return { messageId: data?.id || null, delivered: true, transport: 'resend' };
  }

  const { transporter, kind } = getTransporter();

  const info = await transporter.sendMail({ from, to, subject, text, html });

  if (kind === 'json') {
    console.log(`[email] (dev) queued message for ${to}: ${subject}`);
  }

  return {
    messageId: info.messageId,
    delivered: kind === 'smtp',
    transport: kind,
  };
};

const escapeHtml = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Shared chrome so every transactional email looks like the same product. */
const layout = (bodyHtml) => `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
              max-width:560px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.55;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#059669;">emoorm</div>
    </div>
    ${bodyHtml}
  </div>
`;

const sendPasswordResetEmail = async ({ user, token, resetUrl }) => {
  const subject = 'Reset your Emoorm password';
  const safeName = escapeHtml(user.fullName || 'there');
  const safeUrl = escapeHtml(resetUrl);

  const text = [
    `Hi ${user.fullName || 'there'},`,
    '',
    'We received a request to reset your Emoorm password.',
    'Click the link below (or paste it into your browser) to choose a new password. This link expires in 1 hour.',
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email — your password will stay the same.",
    '',
    'Emoorm will never ask you for your password, OTP or PIN.',
    '',
    '— The Emoorm team',
  ].join('\n');

  const html = layout(`
    <h1 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#111827;">
      Reset your password
    </h1>
    <p style="margin:0 0 16px;color:#374151;">
      Hi ${safeName}, we received a request to reset your Emoorm password.
      Use the button below to choose a new one. This link expires in <strong>1 hour</strong>.
    </p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${safeUrl}"
         style="display:inline-block;background:#059669;color:#ffffff;
                text-decoration:none;font-weight:600;padding:12px 24px;
                border-radius:8px;font-size:14px;">
        Reset password
      </a>
    </p>
    <p style="margin:0 0 12px;color:#6b7280;font-size:13px;">
      Or paste this link into your browser:
    </p>
    <p style="word-break:break-all;background:#f3f4f6;padding:10px 12px;border-radius:6px;
              font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#111827;">
      ${safeUrl}
    </p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">
      If you didn't request a password reset, you can safely ignore this email —
      your password will stay the same.
    </p>
    <p style="margin:12px 0 0;color:#6b7280;font-size:12px;">
      Emoorm will never ask you for your password, OTP or PIN.
    </p>
    <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">
      Reference token: ${escapeHtml(String(token).slice(0, 8))}…
    </p>
  `);

  return sendMail({ to: user.email, subject, html, text });
};

/**
 * Sent after a password actually changes. This is the tripwire: if someone
 * else reset the password, this email is the owner's first and only warning,
 * so it goes out on both the reset-by-email and the change-while-signed-in
 * paths.
 */
const sendPasswordChangedEmail = async ({ user }) => {
  const subject = 'Your Emoorm password was changed';
  const safeName = escapeHtml(user.fullName || 'there');
  const when = new Date().toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  });
  const supportUrl = `${String(config.frontendUrl).replace(/\/$/, '')}/help-center`;

  const text = [
    `Hi ${user.fullName || 'there'},`,
    '',
    `Your Emoorm password was changed on ${when} (Philippine time).`,
    'You have been signed out on all your other devices.',
    '',
    "If this was you, there's nothing else to do.",
    `If it wasn't, reset your password immediately and contact us: ${supportUrl}`,
    '',
    '— The Emoorm team',
  ].join('\n');

  const html = layout(`
    <h1 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#111827;">
      Your password was changed
    </h1>
    <p style="margin:0 0 16px;color:#374151;">
      Hi ${safeName}, your Emoorm password was changed on
      <strong>${escapeHtml(when)}</strong> (Philippine time).
      You have been signed out on all your other devices.
    </p>
    <p style="margin:0 0 16px;color:#374151;">
      If this was you, there's nothing else to do.
    </p>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;margin:20px 0;">
      <p style="margin:0;color:#991b1b;font-size:13px;">
        <strong>If this wasn't you</strong>, reset your password straight away and
        <a href="${escapeHtml(supportUrl)}" style="color:#991b1b;">contact support</a>.
      </p>
    </div>
    <p style="margin:16px 0 0;color:#6b7280;font-size:12px;">
      Emoorm will never ask you for your password, OTP or PIN.
    </p>
  `);

  return sendMail({ to: user.email, subject, html, text });
};

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  isSmtpConfigured,
  isResendConfigured,
};
