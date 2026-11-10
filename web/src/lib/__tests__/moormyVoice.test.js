import { describe, expect, it } from 'vitest';
import { mfcc, dtw, SAMPLE_RATE } from '../moormy/wake/dsp';
import {
  takeSaying, learnVoice, createMatcher, trimSilence, distanceTo,
} from '../moormy/wake/voice';

// A made-up "phrase": a sequence of voiced sounds (a few harmonics each), the
// way a word is a sequence of vowels and consonants. Same notes = same phrase.
const phrase = (notes, { speed = 1, gain = 0.3, noise = 0, seed = 1 } = {}) => {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const parts = notes.map(([hz, ms]) => {
    const n = Math.round((ms / speed / 1000) * SAMPLE_RATE);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / SAMPLE_RATE;
      const env = Math.sin((Math.PI * i) / n);
      out[i] = gain * env * (Math.sin(2 * Math.PI * hz * t) + 0.5 * Math.sin(4 * Math.PI * hz * t) + 0.25 * Math.sin(6 * Math.PI * hz * t)) + noise * rand();
    }
    return out;
  });
  const total = parts.reduce((n, p) => n + p.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
};
const silence = (ms, noise = 0.002, seed = 7) => {
  let s = seed;
  return Float32Array.from({ length: Math.round((ms / 1000) * SAMPLE_RATE) }, () => { s = (s * 16807) % 2147483647; return noise * (s / 2147483647 - 0.5); });
};
const join = (...parts) => {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

const HEY_MOORMY = [[220, 180], [520, 160], [300, 220], [760, 200]];
const OTHER = [[880, 200], [180, 250], [1200, 200], [400, 150]];

describe('Moormy voice matching (MFCC + DTW)', () => {
  it('the same phrase said slower, faster or louder is closer than another phrase', () => {
    const a = mfcc(phrase(HEY_MOORMY));
    const slow = mfcc(phrase(HEY_MOORMY, { speed: 0.85, gain: 0.6, seed: 3 }));
    const fast = mfcc(phrase(HEY_MOORMY, { speed: 1.15, gain: 0.15, seed: 5 }));
    const other = mfcc(phrase(OTHER));
    expect(dtw(a, slow)).toBeLessThan(dtw(a, other));
    expect(dtw(a, fast)).toBeLessThan(dtw(a, other));
    expect(dtw(a, a)).toBeCloseTo(0, 5);
    // Far too different in length: no match at all.
    expect(dtw(a, a.slice(0, 10))).toBe(Infinity);
  });

  it('trims the silence around a saying, and refuses quiet, short and long ones', () => {
    const rec = join(silence(400), phrase(HEY_MOORMY), silence(500));
    const trimmed = trimSilence(rec);
    expect(trimmed.length).toBeLessThan(rec.length);
    expect(trimmed.length).toBeGreaterThan(phrase(HEY_MOORMY).length * 0.8);
    expect(takeSaying(silence(1500)).reason).toBe('quiet');
    expect(takeSaying(join(silence(300), phrase([[400, 150]]), silence(300))).reason).toBe('short');
    expect(takeSaying(join(silence(200), phrase([...HEY_MOORMY, ...HEY_MOORMY, ...HEY_MOORMY]), silence(200))).reason).toBe('long');
    expect(takeSaying(rec).ok).toBe(true);
  });

  it('learns from three sayings, and refuses three different ones', () => {
    const takes = [1, 0.92, 1.08].map((speed, i) => takeSaying(join(silence(300), phrase(HEY_MOORMY, { speed, seed: i + 2 }), silence(300))).frames);
    const learned = learnVoice(takes);
    expect(learned.ok).toBe(true);
    expect(learned.voice.templates).toHaveLength(3);
    expect(learned.voice.threshold).toBeGreaterThan(0);
    // No audio is kept: only numbers per 10 ms frame.
    expect(JSON.stringify(learned.voice).length).toBeLessThan(200000);
    expect(distanceTo(learned.voice, mfcc(phrase(HEY_MOORMY, { speed: 0.95 })))).toBeLessThanOrEqual(learned.voice.threshold);
    expect(distanceTo(learned.voice, mfcc(phrase(OTHER)))).toBeGreaterThan(learned.voice.threshold);

    const mixed = [HEY_MOORMY, OTHER, [[1500, 300], [150, 300]]].map((n) => takeSaying(join(silence(300), phrase(n), silence(300))).frames);
    expect(learnVoice(mixed).ok).toBe(false);
    expect(learnVoice(takes.slice(0, 2)).reason).toBe('need3');
  });

  it('hears the phrase in a stream with a noisy room around it, once; ignores another phrase', () => {
    const takes = [1, 0.9, 1.1].map((speed, i) => takeSaying(join(silence(300), phrase(HEY_MOORMY, { speed, seed: i + 11 }), silence(300))).frames);
    const { voice } = learnVoice(takes);
    const wakes = [];
    const m = createMatcher(voice, { onWake: (w) => wakes.push(w) });
    const stream = join(
      silence(1500, 0.01), phrase(OTHER, { noise: 0.01 }), silence(800, 0.01),
      phrase(HEY_MOORMY, { speed: 1.05, noise: 0.01, seed: 99 }), silence(900, 0.01),
    );
    // Fed in microphone-sized pieces.
    for (let i = 0; i < stream.length; i += 2048) m.push(stream.subarray(i, i + 2048));
    expect(wakes).toHaveLength(1);
    expect(wakes[0].distance).toBeLessThanOrEqual(wakes[0].threshold);
  });
});
