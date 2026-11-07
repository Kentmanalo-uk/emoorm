// Which service sends a text, and in what shape: httpSMS (your own phone)
// or Semaphore. The providers' answers are stubbed; nothing is sent.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const KEYS = ['SMS_PROVIDER', 'HTTPSMS_API_KEY', 'HTTPSMS_FROM', 'SEMAPHORE_API_KEY', 'SEMAPHORE_SENDER_NAME', 'SMS_DEV_LOG'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
const realFetch = global.fetch;
const realError = console.error;

const set = (env) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
};
afterEach(() => {
  set(saved);
  for (const k of KEYS) if (saved[k] === undefined) delete process.env[k];
  global.fetch = realFetch;
  console.error = realError;
});

const sms = require('../src/utils/sms');

const stub = (status, body) => {
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
};

test('off until a provider is set up', () => {
  set({});
  assert.equal(sms.provider(), null);
  assert.equal(sms.enabled(), false);
  set({ HTTPSMS_API_KEY: 'k' });
  assert.equal(sms.provider(), null, 'httpSMS needs the phone number too');
});

test('httpSMS: the phone\'s number and the recipient as +63, the key in x-api-key', async () => {
  set({ HTTPSMS_API_KEY: 'hk', HTTPSMS_FROM: '09151231234' });
  assert.equal(sms.provider(), 'httpsms');
  const calls = stub(200, { status: 'success', data: { id: 'm1', status: 'pending' } });
  assert.equal(await sms.sendSms('09171234567', 'Your code is 123456'), true);
  assert.equal(calls[0].url, 'https://api.httpsms.com/v1/messages/send');
  assert.equal(calls[0].opts.headers['x-api-key'], 'hk');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { from: '+639151231234', to: '+639171234567', content: 'Your code is 123456' });
});

test('httpSMS refusing a text is an error, logged without the message', async () => {
  set({ HTTPSMS_API_KEY: 'hk', HTTPSMS_FROM: '+639151231234' });
  const logged = [];
  console.error = (line) => logged.push(line);
  stub(400, { status: 'error', message: 'The phone is offline' });
  await assert.rejects(sms.sendSms('09171234567', 'Your code is 123456'), /SMS not sent/);
  assert.match(logged[0], /httpSMS did not send to 0917\*\*\*: The phone is offline/);
  assert.ok(!logged[0].includes('123456'));
});

test('both set: httpSMS unless SMS_PROVIDER says Semaphore', () => {
  set({ HTTPSMS_API_KEY: 'hk', HTTPSMS_FROM: '09151231234', SEMAPHORE_API_KEY: 'sk' });
  assert.equal(sms.provider(), 'httpsms');
  set({
    HTTPSMS_API_KEY: 'hk', HTTPSMS_FROM: '09151231234', SEMAPHORE_API_KEY: 'sk', SMS_PROVIDER: 'semaphore',
  });
  assert.equal(sms.provider(), 'semaphore');
});

test('Semaphore: a 200 that refuses the text is still an error', async () => {
  set({ SEMAPHORE_API_KEY: 'sk' });
  console.error = () => {};
  stub(200, { error: 'Your current balance is insufficient' });
  await assert.rejects(sms.sendSms('09171234567', 'hello'), /SMS not sent/);
  stub(200, [{ message_id: 1, status: 'Pending' }]);
  assert.equal(await sms.sendSms('09171234567', 'hello'), true);
});
