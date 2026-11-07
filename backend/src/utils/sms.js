/**
 * Text messages (sign-in codes, number checks), through one of:
 *
 *   httpSMS    httpsms.com (open source, NdoleStudio/httpsms): your own
 *              Android phone and SIM send the texts. Set HTTPSMS_API_KEY
 *              (httpsms.com/settings) and HTTPSMS_FROM, the phone's number
 *              as the httpSMS app registered it (09171234567 or +63...).
 *   Semaphore  semaphore.co, a Philippine SMS gateway (paid credits). Set
 *              SEMAPHORE_API_KEY, and optionally SEMAPHORE_SENDER_NAME.
 *
 * SMS_PROVIDER=httpsms|semaphore picks one when both are set; otherwise
 * httpSMS when it is set up, else Semaphore. Off until one is. For trying
 * the flow locally, SMS_DEV_LOG=1 writes the text to the server log instead
 * (never in production).
 *
 * A text that the provider refuses throws, with the reason logged (never the
 * message itself, which holds the code, and never a key).
 */
const httpsmsReady = () => Boolean(process.env.HTTPSMS_API_KEY && process.env.HTTPSMS_FROM);
const semaphoreReady = () => Boolean(process.env.SEMAPHORE_API_KEY);

/** The provider in use, or null. */
const provider = () => {
  const wanted = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (wanted === 'httpsms' && httpsmsReady()) return 'httpsms';
  if (wanted === 'semaphore' && semaphoreReady()) return 'semaphore';
  if (httpsmsReady()) return 'httpsms';
  if (semaphoreReady()) return 'semaphore';
  return null;
};

const devLog = () => process.env.SMS_DEV_LOG === '1' && process.env.NODE_ENV !== 'production';
const enabled = () => Boolean(provider()) || devLog();

/** 09171234567 → 639171234567 (Semaphore's form). */
const toInternational = (number) => `63${String(number).replace(/^\+?63/, '').replace(/^0/, '')}`;
/** 09171234567 → +639171234567 (httpSMS's). */
const toE164 = (number) => `+${toInternational(String(number).replace(/[\s-]/g, ''))}`;

const masked = (number) => `${String(number).slice(0, 4)}***`;
const refused = (who, number, reason, status) => {
  console.error(`[sms] ${who} did not send to ${masked(number)}: ${reason}`);
  return new Error(`SMS not sent (${status})`);
};

// A gateway that never answers must not hold the request (and its socket)
// open: ten seconds, then it counts as not sent.
const TIMEOUT = 10000;

const viaHttpSms = async (number, message) => {
  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.HTTPSMS_API_KEY },
    body: JSON.stringify({ from: toE164(process.env.HTTPSMS_FROM), to: toE164(number), content: message }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  // Accepted (the phone sends it moments later), or refused with a reason.
  const answer = await res.json().catch(() => null);
  if (!res.ok || answer?.status === 'error') {
    throw refused('httpSMS', number, String(answer?.message || `HTTP ${res.status}`).slice(0, 300), res.status);
  }
  return true;
};

const viaSemaphore = async (number, message) => {
  const body = new URLSearchParams({
    apikey: process.env.SEMAPHORE_API_KEY,
    number: toInternational(number),
    message,
    ...(process.env.SEMAPHORE_SENDER_NAME ? { sendername: process.env.SEMAPHORE_SENDER_NAME } : {}),
  });
  const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT) });
  // Semaphore can answer 200 and still refuse the text (no credits, an
  // unapproved sender name, a bad number), with the reason in the body.
  const answer = await res.json().catch(() => null);
  const sent = Array.isArray(answer) ? answer : [];
  const failed = !res.ok || !sent.length
    || sent.some((m) => /fail|refund|reject/i.test(String(m?.status || '')));
  if (failed) {
    const reason = (answer && !Array.isArray(answer) && JSON.stringify(answer).slice(0, 300))
      || sent.map((m) => m?.status).join(', ') || `HTTP ${res.status}`;
    throw refused('Semaphore', number, reason, res.status);
  }
  return true;
};

const sendSms = async (number, message) => {
  const which = provider();
  if (which === 'httpsms') return viaHttpSms(number, message);
  if (which === 'semaphore') return viaSemaphore(number, message);
  if (devLog()) {
    console.warn(`[sms:dev] to ${number}: ${message}`);
    return true;
  }
  throw new Error('SMS is not set up');
};

module.exports = {
  enabled, sendSms, provider, toE164,
};
