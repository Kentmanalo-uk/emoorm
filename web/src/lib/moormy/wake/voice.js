import {
  SAMPLE_RATE, mfcc, dtw, frameEnergies, HOP_SAMPLES, FRAME_SAMPLES,
} from './dsp';

/**
 * "Teach Moormy your voice": the three sayings a person records, and the
 * matching that listens for them. Pure functions plus a small listener that
 * is fed audio; the microphone itself is in listener.js.
 *
 * Only fingerprints (MFCC frames) are kept, on this device; never the audio.
 */

// A saying of "Hey Moormy" lasts about half a second to a second and a half.
export const MIN_MS = 350;
export const MAX_MS = 1800;
const SPEECH_OVER_FLOOR_DB = 12; // a frame this much louder than the room is speech
const HANGOVER_FRAMES = 18; // 180 ms of quiet ends a burst
const MIN_LOUD_DB = -55; // quieter than this is never speech

/**
 * The speech in a recording, without the silence around it.
 * @returns {Float32Array|null} null when no stretch of speech is found
 */
export const trimSilence = (samples) => {
  const e = frameEnergies(samples);
  if (!e.length) return null;
  const sorted = [...e].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const loud = (v) => v > Math.max(MIN_LOUD_DB, floor + SPEECH_OVER_FLOOR_DB);
  const first = e.findIndex(loud);
  if (first < 0) return null;
  let last = e.length - 1;
  while (last > first && !loud(e[last])) last -= 1;
  const from = Math.max(0, (first - 5) * HOP_SAMPLES);
  const to = Math.min(samples.length, last * HOP_SAMPLES + FRAME_SAMPLES + 5 * HOP_SAMPLES);
  return samples.subarray(from, to);
};

const msOf = (samples) => (samples.length / SAMPLE_RATE) * 1000;

/**
 * Check one recorded saying.
 * @returns {{ ok: boolean, reason?: string, frames?: Float32Array[] }}
 */
export const takeSaying = (samples) => {
  const speech = trimSilence(samples);
  if (!speech) return { ok: false, reason: 'quiet' };
  const ms = msOf(speech);
  if (ms < MIN_MS) return { ok: false, reason: 'short' };
  if (ms > MAX_MS) return { ok: false, reason: 'long' };
  return { ok: true, frames: mfcc(speech) };
};

/**
 * Three sayings -> what is kept: their fingerprints and how close a new
 * saying must be. The threshold comes from how alike the three are to each
 * other (with room to spare), so a careful speaker gets a tight one.
 * @param {Float32Array[][]} sayings - the frames of each saying (3)
 * @returns {{ ok: boolean, reason?: string, voice?: Object }}
 */
export const learnVoice = (sayings) => {
  if (sayings.length < 3) return { ok: false, reason: 'need3' };
  const pairs = [];
  for (let i = 0; i < sayings.length; i += 1) {
    for (let j = i + 1; j < sayings.length; j += 1) pairs.push(dtw(sayings[i], sayings[j]));
  }
  const worst = Math.max(...pairs);
  // Too different from each other: they were not the same phrase.
  if (!Number.isFinite(worst) || worst > 22) return { ok: false, reason: 'inconsistent' };
  return {
    ok: true,
    voice: {
      version: 1,
      templates: sayings.map((f) => f.map((v) => Array.from(v, (x) => Math.round(x * 1000) / 1000))),
      // Room for how differently a person says it another time (synthetic
      // takes differ little, real ones more): at least 12, at most 22. A
      // different phrase lands far above it (about 50 in the tests).
      threshold: Math.max(12, Math.min(22, worst * 1.6 + 4)),
      createdAt: new Date().toISOString(),
    },
  };
};

/** How close a saying is to the learned voice (lower is closer). */
export const distanceTo = (voice, frames) => Math.min(...voice.templates.map((t) => dtw(frames, t.map((v) => Float32Array.from(v)))));

/**
 * Listens to a stream of 16 kHz chunks for a burst of speech the length of
 * the phrase, and checks each burst against the voice. The room's noise floor
 * is followed as it changes.
 *
 *   const m = createMatcher(voice, { onWake });
 *   m.push(float32Chunk) ... m.reset()
 */
export const createMatcher = (voice, { onWake, onHeard, sensitivity = 1 } = {}) => {
  const templates = voice.templates.map((t) => t.map((v) => Float32Array.from(v)));
  const threshold = voice.threshold * sensitivity;
  let floor = -60; // dB, followed slowly
  let carry = new Float32Array(0);
  let burst = [];
  let quiet = 0;
  let inBurst = false;
  let pre = []; // a little audio from before a burst begins

  const finish = () => {
    const samples = new Float32Array(burst.reduce((n, b) => n + b.length, 0));
    let o = 0;
    for (const b of burst) { samples.set(b, o); o += b.length; }
    burst = [];
    const speech = trimSilence(samples) || samples;
    const ms = msOf(speech);
    if (ms < MIN_MS || ms > MAX_MS) {
      onHeard?.({ ms: Math.round(ms), distance: null, threshold, matched: false });
      return null;
    }
    const frames = mfcc(speech);
    let best = Infinity;
    for (const t of templates) best = Math.min(best, dtw(frames, t));
    const matched = best <= threshold;
    onHeard?.({ ms: Math.round(ms), distance: Math.round(best * 10) / 10, threshold, matched });
    if (matched) onWake?.({ distance: best, threshold });
    return best;
  };

  const push = (chunk) => {
    const data = new Float32Array(carry.length + chunk.length);
    data.set(carry);
    data.set(chunk, carry.length);
    let start = 0;
    for (; start + FRAME_SAMPLES <= data.length; start += HOP_SAMPLES) {
      const frame = data.subarray(start, start + HOP_SAMPLES);
      let s = 0;
      for (let i = start; i < start + FRAME_SAMPLES; i += 1) s += data[i] ** 2;
      const db = 10 * Math.log10(s / FRAME_SAMPLES + 1e-12);
      const speech = db > Math.max(MIN_LOUD_DB, floor + SPEECH_OVER_FLOOR_DB);
      if (!speech) floor = floor * 0.995 + db * 0.005; // follow the room while quiet
      if (speech && db < floor) floor = db;
      if (speech) {
        if (!inBurst) { inBurst = true; burst = [...pre]; }
        quiet = 0;
        burst.push(Float32Array.from(frame));
      } else if (inBurst) {
        burst.push(Float32Array.from(frame));
        quiet += 1;
        if (quiet >= HANGOVER_FRAMES) { inBurst = false; finish(); }
      } else {
        pre.push(Float32Array.from(frame));
        if (pre.length > 10) pre.shift();
      }
      // A burst far too long (talking, music): drop it.
      if (inBurst && burst.length * HOP_SAMPLES > (MAX_MS + 1500) * (SAMPLE_RATE / 1000)) { inBurst = false; burst = []; }
    }
    carry = data.slice(start);
  };

  const reset = () => { carry = new Float32Array(0); burst = []; inBurst = false; quiet = 0; pre = []; };

  return { push, reset, get floor() { return floor; } };
};

// ── Kept on this device ─────────────────────────────────────────────────────

const KEY = 'emoorm-moormy-voice';

export const loadVoice = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && v.version === 1 && Array.isArray(v.templates) && v.templates.length >= 3 ? v : null;
  } catch {
    return null;
  }
};
export const saveVoice = (voice) => {
  try { localStorage.setItem(KEY, JSON.stringify(voice)); return true; } catch { return false; }
};
export const forgetVoice = () => {
  try { localStorage.removeItem(KEY); } catch { /* nothing kept */ }
};
