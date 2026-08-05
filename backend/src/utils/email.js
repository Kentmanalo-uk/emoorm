const nodemailer = require('nodemailer');
const config = require('../config/env');

let cachedTransporter = null;
let cachedTransporterKind = null;

const isSmtpConfigured = () =>
  Boolean(config.email?.host && config.email?.user && config.email?.password);

const buildJsonTransporter = () =>
  nodemailer.createTransport({ jsonTransport: true });

/**
 * Build (and cache) a transporter.
 *   - Real SMTP when SMTP_HOST/USER/PASSWORD are configured.
 *   - Otherwise a local "JSON" transport that captures the message in-memory
 *     so dev flows work offline. The controller returns the reset token to
 *     the caller when NODE_ENV !== 'production'.
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
      '[email] SMTP not configured — using in-memory JSON transport. ' +
      'Emails will be logged to the console only. ' +
      'Set SMTP_HOST/SMTP_USER/SMTP_PASSWORD to send real messages.'
    );
  }

  return { transporter: cachedTransporter, kind: cachedTransporterKind };
};

const sendMail = async ({ to, subject, html, text }) => {
  const { transporter, kind } = getTransporter();

  const info = await transporter.sendMail({
    from: config.email?.from || 'noreply@emoorm.com',
    to,
    subject,
    text,
    html,
  });

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
    '— The Emoorm team',
  ].join('\n');

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
                max-width:560px;margin:0 auto;padding:32px 24px;color:#111827;line-height:1.55;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#059669;">emoorm</div>
      </div>
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
      <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">
        Reference token: ${escapeHtml(token.slice(0, 8))}…
      </p>
    </div>
  `;

  return sendMail({ to: user.email, subject, html, text });
};

module.exports = {
  sendMail,
  sendPasswordResetEmail,
  isSmtpConfigured,
};
