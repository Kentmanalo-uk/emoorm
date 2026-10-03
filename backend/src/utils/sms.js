/**
 * Text messages, through Semaphore (semaphore.co, a Philippine SMS gateway).
 *
 * Off until SEMAPHORE_API_KEY is set (optionally SEMAPHORE_SENDER_NAME, a
 * sender name registered with Semaphore). For trying the flow locally,
 * SMS_DEV_LOG=1 writes the text to the server log instead (never in
 * production).
 */
const enabled = () => Boolean(process.env.SEMAPHORE_API_KEY)
  || (process.env.SMS_DEV_LOG === '1' && process.env.NODE_ENV !== 'production');

/** 09171234567 → 639171234567, the form Semaphore takes. */
const toInternational = (number) => `63${String(number).replace(/^0/, '')}`;

const sendSms = async (number, message) => {
  if (process.env.SEMAPHORE_API_KEY) {
    const body = new URLSearchParams({
      apikey: process.env.SEMAPHORE_API_KEY,
      number: toInternational(number),
      message,
      ...(process.env.SEMAPHORE_SENDER_NAME ? { sendername: process.env.SEMAPHORE_SENDER_NAME } : {}),
    });
    const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body });
    if (!res.ok) throw new Error(`SMS not sent (${res.status})`);
    return true;
  }
  if (enabled()) {
    console.warn(`[sms:dev] to ${number}: ${message}`);
    return true;
  }
  throw new Error('SMS is not set up');
};

module.exports = { enabled, sendSms };
