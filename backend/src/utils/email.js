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

/* ── Account and seller lifecycle emails ─────────────────────────────── */

const appUrl = (path = '') => `${String(config.frontendUrl || '').replace(/\/$/, '')}${path}`;

const button = (href, label) => `
    <p style="text-align:center;margin:28px 0;">
      <a href="${escapeHtml(href)}"
         style="display:inline-block;background:#059669;color:#ffffff;
                text-decoration:none;font-weight:600;padding:12px 24px;
                border-radius:8px;font-size:14px;">
        ${escapeHtml(label)}
      </a>
    </p>`;

const heading = (textContent) => `
    <h1 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#111827;">${escapeHtml(textContent)}</h1>`;

const para = (htmlContent) => `
    <p style="margin:0 0 16px;color:#374151;">${htmlContent}</p>`;

const footer = `
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">
      Emoorm will never ask you for your password, OTP or PIN.
    </p>`;

/**
 * Sent once, right after an account is created. A typed-email sign-up gets
 * `confirmUrl` and the email asks first of all to confirm the address; a
 * Google sign-up (already confirmed by Google) gets none.
 */
const sendWelcomeEmail = async ({ user, confirmUrl = null }) => {
  const name = user.fullName || 'there';
  const shopUrl = appUrl('/products');
  const verifyUrl = appUrl('/profile/verification');
  const sellUrl = appUrl('/seller/apply');
  const subject = confirmUrl ? 'Welcome to Emoorm! Please confirm your email' : 'Welcome to Emoorm!';

  const text = [
    `Hi ${name},`,
    '',
    "Welcome to Emoorm, Oriental Mindoro's local online marketplace.",
    ...(confirmUrl
      ? [
        'First, please confirm this is your email address (the link works for 48 hours):',
        confirmUrl,
        '',
        "If you didn't create an Emoorm account, you can ignore this email.",
      ]
      : ['Your account is ready.']),
    'Here is how to get started:',
    '',
    `- Browse fresh produce, local delicacies and crafts: ${shopUrl}`,
    `- Verify your identity once so you can check out: ${verifyUrl}`,
    `- Have something to sell? Open your own shop: ${sellUrl}`,
    '',
    'Salamat, and happy shopping!',
    '— The Emoorm team',
  ].join('\n');

  const html = layout(`
    ${heading(`Welcome to Emoorm, ${name}!`)}
    ${confirmUrl ? `
    ${para('Please confirm this is your email address. The link works for 48 hours.')}
    ${button(confirmUrl, 'Confirm my email')}
    ${para("If you didn't create an Emoorm account, you can ignore this email.")}` : ''}
    ${para(`${confirmUrl ? 'Emoorm' : 'Your account is ready. Emoorm'} connects you with farmers, fishers, artisans and food producers across Oriental Mindoro, all in one place.`)}
    <ul style="margin:0 0 16px;padding-left:20px;color:#374151;">
      <li style="margin-bottom:6px;">Browse fresh produce, local delicacies and handmade crafts.</li>
      <li style="margin-bottom:6px;"><a href="${escapeHtml(verifyUrl)}" style="color:#059669;">Verify your identity</a> once so you can check out.</li>
      <li>Have something to sell? <a href="${escapeHtml(sellUrl)}" style="color:#059669;">Open your own shop</a>.</li>
    </ul>
    ${confirmUrl ? '' : button(shopUrl, 'Start shopping')}
    ${para('Salamat, and happy shopping!')}
    ${footer}
  `);

  return sendMail({ to: user.email, subject, html, text });
};

/** A fresh confirmation link, asked for from the profile ("Resend email"). */
const sendEmailConfirmationEmail = async ({ user, confirmUrl }) => {
  const name = user.fullName || 'there';
  const subject = 'Confirm your Emoorm email';
  const text = [
    `Hi ${name},`,
    '',
    'Please confirm this is your email address (the link works for 48 hours):',
    confirmUrl,
    '',
    "If you didn't ask for this, you can ignore this email.",
    '— The Emoorm team',
  ].join('\n');
  const html = layout(`
    ${heading('Confirm your email')}
    ${para(`Hi ${escapeHtml(name)}, please confirm this is your email address. The link works for 48 hours.`)}
    ${button(confirmUrl, 'Confirm my email')}
    ${para("If you didn't ask for this, you can ignore this email.")}
    ${footer}
  `);
  return sendMail({ to: user.email, subject, html, text });
};

/** Confirms a seller application was received and is waiting for review. */
const sendSellerApplicationReceivedEmail = async ({ user, shopName }) => {
  const name = user.fullName || 'there';
  const statusUrl = appUrl('/seller/apply');
  const subject = 'We received your Emoorm seller application';

  const text = [
    `Hi ${name},`,
    '',
    `Thank you for applying to sell on Emoorm as "${shopName}".`,
    'Your application has been sent to the administrator of your shop\'s municipality for review.',
    'We will email you as soon as it is approved or if anything needs to change.',
    '',
    `Check your application status: ${statusUrl}`,
    '',
    '— The Emoorm team',
  ].join('\n');

  const html = layout(`
    ${heading('Application received')}
    ${para(`Hi ${escapeHtml(name)}, thank you for applying to sell on Emoorm as <strong>${escapeHtml(shopName)}</strong>.`)}
    ${para("Your application has been sent to the administrator of your shop's municipality for review. We will email you as soon as it is approved, or if anything needs to change.")}
    ${button(statusUrl, 'View application status')}
    ${footer}
  `);

  return sendMail({ to: user.email, subject, html, text });
};

/** The application was approved and the shop is live. */
const sendSellerApprovedEmail = async ({ user, storeName }) => {
  const name = user.fullName || 'there';
  const centerUrl = appUrl('/seller');
  const productsUrl = appUrl('/seller/products');
  const fulfillmentUrl = appUrl('/seller/fulfillment');
  const shop = storeName || 'your shop';
  const subject = `Your shop "${shop}" is approved on Emoorm`;

  const text = [
    `Hi ${name},`,
    '',
    `Good news: your seller application was approved and ${shop} is now open on Emoorm.`,
    '',
    'Next steps:',
    `- Set your delivery fee, pickup and payment options: ${fulfillmentUrl}`,
    `- Add your first products: ${productsUrl}`,
    '',
    `Open Seller Center: ${centerUrl}`,
    '',
    '— The Emoorm team',
  ].join('\n');

  const html = layout(`
    ${heading('Your shop is approved!')}
    ${para(`Hi ${escapeHtml(name)}, good news: your seller application was approved and <strong>${escapeHtml(shop)}</strong> is now open on Emoorm.`)}
    ${para('A few things to do next:')}
    <ol style="margin:0 0 16px;padding-left:20px;color:#374151;">
      <li style="margin-bottom:6px;"><a href="${escapeHtml(fulfillmentUrl)}" style="color:#059669;">Set your delivery fee, pickup and payment options</a>.</li>
      <li><a href="${escapeHtml(productsUrl)}" style="color:#059669;">Add your first products</a>. New listings are reviewed before buyers see them.</li>
    </ol>
    ${button(centerUrl, 'Open Seller Center')}
    ${footer}
  `);

  return sendMail({ to: user.email, subject, html, text });
};

/** The application was not approved; says why and how to re-apply. */
const sendSellerRejectedEmail = async ({ user, reason }) => {
  const name = user.fullName || 'there';
  const applyUrl = appUrl('/seller/apply');
  const subject = 'Update on your Emoorm seller application';

  const text = [
    `Hi ${name},`,
    '',
    'Your seller application was not approved this time.',
    '',
    `Reason from the reviewer: ${reason}`,
    '',
    `You can update your details and apply again: ${applyUrl}`,
    '',
    '— The Emoorm team',
  ].join('\n');

  const html = layout(`
    ${heading('Your application needs changes')}
    ${para(`Hi ${escapeHtml(name)}, your seller application was not approved this time.`)}
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
      <p style="margin:0 0 4px;color:#9a3412;font-size:13px;font-weight:600;">Reason from the reviewer</p>
      <p style="margin:0;color:#7c2d12;font-size:14px;white-space:pre-wrap;">${escapeHtml(reason)}</p>
    </div>
    ${para('You can update your details and apply again.')}
    ${button(applyUrl, 'Update and re-apply')}
    ${footer}
  `);

  return sendMail({ to: user.email, subject, html, text });
};

/* ── Order emails ─────────────────────────────────────────────────────── */

const money = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAY_LABEL = { COD: 'Cash on delivery / pickup', GCASH: 'GCash (QR)', QRPH: 'QR Ph', BANK_TRANSFER: 'Bank transfer' };

/** How the order reaches the buyer, in words. */
const handOverText = (order) => (order.fulfillmentMethod === 'PICKUP'
  ? 'Pickup at the shop'
  : order.courierName ? `Delivery by ${order.courierName}` : 'Delivery by the seller');

/** The items and totals as an email table (and as plain text lines). */
const orderSummary = (order, items) => {
  const rows = items.map((it) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;">${escapeHtml(it.productName)} <span style="color:#6b7280;">× ${Number(it.quantity)}</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#111827;font-size:14px;text-align:right;white-space:nowrap;">${money(it.subtotal)}</td>
      </tr>`).join('');
  const line = (label, value, bold = false) => `
      <tr>
        <td style="padding:6px 0;color:${bold ? '#111827' : '#6b7280'};font-size:${bold ? 15 : 13}px;${bold ? 'font-weight:700;' : ''}">${escapeHtml(label)}</td>
        <td style="padding:6px 0;color:#111827;font-size:${bold ? 15 : 13}px;text-align:right;${bold ? 'font-weight:700;' : ''}">${value}</td>
      </tr>`;
  const html = `
    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      ${rows}
      ${line('Subtotal', money(order.subtotal))}
      ${line(order.fulfillmentMethod === 'PICKUP' ? 'Pickup' : 'Delivery fee', Number(order.deliveryFee) > 0 ? money(order.deliveryFee) : 'Free')}
      ${Number(order.discountAmount) > 0 ? line('Discount', `−${money(order.discountAmount)}`) : ''}
      ${line('Total', money(order.total), true)}
    </table>
    <p style="margin:0 0 16px;color:#374151;font-size:13px;">
      <strong>${escapeHtml(handOverText(order))}</strong> · ${escapeHtml(PAY_LABEL[order.paymentMethod] || order.paymentMethod)}
    </p>`;
  const text = [
    ...items.map((it) => `- ${it.productName} × ${it.quantity}: ${money(it.subtotal)}`),
    `Total: ${money(order.total)}`,
    `${handOverText(order)} · ${PAY_LABEL[order.paymentMethod] || order.paymentMethod}`,
  ];
  return { html, text };
};

/**
 * To the shop owner: someone ordered. Who and what, with a button to the
 * order. The buyer's phone and street stay in the Seller Center.
 * @param {{ seller: {email, fullName}, store: {name}, order: Object, items: Array, buyerName: String, place: String|null, expiryHours: Number }} args
 */
const sendNewOrderEmail = async ({ seller, store, order, items, buyerName, place = null, expiryHours = 48 }) => {
  const subject = `New order ${order.orderNumber} for ${store.name}`;
  const url = appUrl('/seller/orders?status=PENDING');
  const summary = orderSummary(order, items);
  const from = `${buyerName || 'A buyer'}${place ? ` in ${place}` : ''}`;
  const text = [
    `Hi ${seller.fullName || 'there'},`,
    '',
    `${from} ordered from ${store.name}. Order ${order.orderNumber}:`,
    ...summary.text,
    '',
    `Confirm it within ${expiryHours} hours or it is cancelled automatically: ${url}`,
    '',
    '— Emoorm',
  ].join('\n');
  const html = layout(`
    ${heading('You have a new order!')}
    ${para(`<strong>${escapeHtml(from)}</strong> ordered from <strong>${escapeHtml(store.name)}</strong>. Order <strong>${escapeHtml(order.orderNumber)}</strong>:`)}
    ${summary.html}
    ${para(`Confirm it within ${expiryHours} hours, or it is cancelled automatically and the stock goes back to your shop.`)}
    ${button(url, 'View and confirm the order')}
    ${footer}
  `);
  return sendMail({ to: seller.email, subject, html, text });
};

/**
 * To the buyer: the shop accepted their order. A QR order is paid now (To
 * Pay); cash on delivery waits for the hand-over.
 * @param {{ buyer: {email, fullName}, store: {name}, order: Object, items: Array, payHours: Number }} args
 */
const sendOrderAcceptedEmail = async ({ buyer, store, order, items, payHours = 48 }) => {
  const payNow = order.paymentMethod !== 'COD' && ['PENDING', 'FAILED'].includes(order.paymentStatus);
  const subject = payNow
    ? `${store.name} accepted your order ${order.orderNumber}: please pay now`
    : `${store.name} accepted your order ${order.orderNumber}`;
  const url = appUrl(`/profile/orders?id=${encodeURIComponent(order.id)}`);
  const summary = orderSummary(order, items);
  const next = payNow
    ? `Pay ${money(order.total)} with the shop's ${PAY_LABEL[order.paymentMethod] || 'QR'} in To Pay, then send your reference number and screenshot within ${payHours} hours. The seller prepares your order once the payment is checked.`
    : order.fulfillmentMethod === 'PICKUP'
      ? "The seller is preparing your order. We'll let you know when it's ready to pick up."
      : `The seller is preparing your order. We'll let you know when it's on its way${order.courierName ? ` with ${order.courierName}` : ''}.`;
  const text = [
    `Hi ${buyer.fullName || 'there'},`,
    '',
    `Good news: ${store.name} accepted your order ${order.orderNumber}.`,
    ...summary.text,
    '',
    next,
    url,
    '',
    'Salamat for shopping local!',
    '— Emoorm',
  ].join('\n');
  const html = layout(`
    ${heading('Your order was accepted!')}
    ${para(`Good news, ${escapeHtml(buyer.fullName || 'there')}: <strong>${escapeHtml(store.name)}</strong> accepted your order <strong>${escapeHtml(order.orderNumber)}</strong>.`)}
    ${summary.html}
    ${payNow
    ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:14px 16px;margin:0 0 16px;">
        <p style="margin:0;color:#065f46;font-size:14px;">${escapeHtml(next)}</p>
      </div>`
    : para(escapeHtml(next))}
    ${button(url, payNow ? 'Pay now' : 'View my order')}
    ${para('Salamat for shopping local!')}
    ${footer}
  `);
  return sendMail({ to: buyer.email, subject, html, text });
};

module.exports = {
  escapeHtml,
  sendNewOrderEmail,
  sendOrderAcceptedEmail,
  sendMail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendWelcomeEmail,
  sendEmailConfirmationEmail,
  sendSellerApplicationReceivedEmail,
  sendSellerApprovedEmail,
  sendSellerRejectedEmail,
  isSmtpConfigured,
  isResendConfigured,
};
