// The word list a chat message is checked against (utils/badWords).
//
// The two halves matter in opposite directions. Missing a swear costs an
// admin nothing -- the message was delivered either way. Inventing one puts
// an innocent seller in a moderation queue and, three times over, shuts
// their chat. So the "leaves ordinary words alone" half is the one worth
// being strict about.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findBadWords, hasBadWords, normalise } = require('../src/utils/badWords');

test('it finds Tagalog swearing, which is how people here actually swear', () => {
  for (const line of [
    'putang ina mo',
    'tangina naman',
    'ang gago mo talaga',
    'bobo ka ba',
    'ulol',
    'tarantado kang bata ka',
    'punyeta ang bagal',
  ]) {
    assert.ok(hasBadWords(line), `should flag: ${line}`);
  }
});

test('it finds English swearing', () => {
  for (const line of ['fuck this', 'what a bitch', 'you asshole', 'this is shit']) {
    assert.ok(hasBadWords(line), `should flag: ${line}`);
  }
});

test('it sees through the obvious dodges', () => {
  // Letters swapped for numbers, and the letter-mashing of an angry person.
  assert.ok(hasBadWords('g4g0 ka'), 'leet');
  assert.ok(hasBadWords('gagooooo'), 'repeated letters');
  assert.ok(hasBadWords('T4NG1N4'), 'leet and shouting');
  assert.ok(hasBadWords('p u t a n g i n a') === false, 'spaced letters are not worth guessing at');
});

test('it leaves ordinary words that contain a swear alone', () => {
  // This is the half that protects innocent people. Every one of these is
  // a word a shop might plausibly write.
  for (const line of [
    'maganda ang reputasyon ng tindahan namin',
    'our reputation matters to us',
    'tanggap po namin ang GCash',
    'bukas po kami ng tanghali',
    'nakita ko ang titig niya',
    'please pass the order to the rider',
    'first class ang quality nito',
    'I will assist you with the delivery',
    'shitake mushrooms po ito',
  ]) {
    assert.deepEqual(findBadWords(line), [], `should NOT flag: ${line}`);
  }
});

test('a swear in the same message as an innocent word is still found', () => {
  // The safe word takes itself out of the running, not the whole message.
  assert.ok(hasBadWords('maganda ang reputasyon namin pero gago ka'));
});

test('it reports which words matched, so an admin can judge the guess too', () => {
  const hits = findBadWords('gago at bobo');
  assert.ok(hits.includes('gago'));
  assert.ok(hits.includes('bobo'));
  assert.equal(new Set(hits).size, hits.length, 'no duplicates');
});

test('empty and odd input is simply not a match', () => {
  for (const value of ['', '   ', null, undefined, '12345', '!!!', '😀😀']) {
    assert.deepEqual(findBadWords(value), [], `should be empty for: ${JSON.stringify(value)}`);
  }
});

test('normalise keeps doubles, so ordinary words survive it', () => {
  assert.equal(normalise('Paalam'), 'paalam');
  assert.equal(normalise('GAGOOOOO'), 'gagoo');
  assert.equal(normalise('  hello   world  '), 'hello world');
});
