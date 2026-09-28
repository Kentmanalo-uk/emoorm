/**
 * Small interface sounds, made in the browser (no audio files to load):
 * a soft chime when a notification pops up. Kept quiet and short.
 *
 * Browsers only let a page make sound after the person has touched it, so
 * the audio starts on the first tap or key press; a notification before
 * that is simply silent. On iPhones the sound mixes with whatever is
 * playing and follows the silent switch. `localStorage['emoorm-sounds'] =
 * 'off'` turns the sounds off.
 */

const MIN_GAP_S = 0.12;
let ctx = null;
let master = null;
// When the last sound played (the audio clock starts at 0 when it is made).
let lastAt = -Infinity;

const muted = () => {
  try {
    return localStorage.getItem('emoorm-sounds') === 'off';
  } catch {
    return false;
  }
};

const audio = () => {
  if (ctx) return ctx;
  const AudioCtx = typeof window === 'undefined' ? null : (window.AudioContext || window.webkitAudioContext);
  if (!AudioCtx) return null;
  try {
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
};

/** Starts (or restarts) the audio; called on the person's own taps and key presses. */
const unlock = () => {
  const c = audio();
  if (c && c.state !== 'running') c.resume().catch(() => {});
};

if (typeof window !== 'undefined') {
  try {
    // iPhones: mix with music instead of pausing it, and respect silent mode.
    if (navigator.audioSession) navigator.audioSession.type = 'ambient';
  } catch {
    // Not supported: the default session is fine.
  }
  for (const type of ['pointerdown', 'keydown', 'touchend']) {
    window.addEventListener(type, unlock, { passive: true, capture: true });
  }
}

/**
 * One bell-like note: a sine with a faint overtone, a quick attack and a
 * soft exponential fade.
 */
const note = (c, { freq, at, length = 0.3, gain = 0.1, type = 'sine', sparkle = 0.25 }) => {
  const partials = [[1, gain], [2.01, gain * sparkle]];
  for (const [ratio, level] of partials) {
    if (!level) continue;
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * ratio, at);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.linearRampToValueAtTime(level, at + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + (ratio === 1 ? length : length * 0.55));
    osc.connect(amp);
    amp.connect(master);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
};

const SOUNDS = {
  // Two notes going up (C6 → G6): done.
  success: (c, t) => {
    note(c, { freq: 1046.5, at: t, length: 0.22, gain: 0.08 });
    note(c, { freq: 1568, at: t + 0.085, length: 0.34, gain: 0.09 });
  },
  // Two softer, lower notes going down (E5 → B4): something needs a look.
  error: (c, t) => {
    note(c, { freq: 659.3, at: t, length: 0.2, gain: 0.07, type: 'triangle', sparkle: 0 });
    note(c, { freq: 493.9, at: t + 0.11, length: 0.3, gain: 0.07, type: 'triangle', sparkle: 0 });
  },
  // One note (E6): a notice.
  info: (c, t) => {
    note(c, { freq: 1318.5, at: t, length: 0.3, gain: 0.08 });
  },
};

/**
 * @param {'success'|'error'|'info'} kind
 */
export const playSound = (kind) => {
  if (muted()) return;
  const c = ctx;
  if (!c || c.state !== 'running') return;
  const now = c.currentTime;
  if (now - lastAt < MIN_GAP_S) return;
  lastAt = now;
  try {
    (SOUNDS[kind] || SOUNDS.info)(c, now + 0.01);
  } catch {
    // A sound is never worth an error.
  }
};

export default playSound;
