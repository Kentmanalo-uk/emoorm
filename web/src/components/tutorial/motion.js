/*
 * Small motion helpers for the seller tutorial. Every scene is a pure
 * function of time, so playback can pause, seek and replay exactly, and the
 * soundtrack's cues always line up.
 */

export const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// Easing curves (like cubic-bezier presets in a motion tool).
export const ease = {
  out: (x) => 1 - (1 - clamp(x)) ** 3,
  outQuint: (x) => 1 - (1 - clamp(x)) ** 5,
  inOut: (x) => { const v = clamp(x); return v < 0.5 ? 4 * v * v * v : 1 - ((-2 * v + 2) ** 3) / 2; },
  in: (x) => clamp(x) ** 3,
  // A gentle overshoot: settles past the mark and back (not a bounce).
  back: (x) => { const v = clamp(x); const c1 = 1.2; const c3 = c1 + 1; return 1 + c3 * (v - 1) ** 3 + c1 * (v - 1) ** 2; },
  expoOut: (x) => { const v = clamp(x); return v === 1 ? 1 : 1 - 2 ** (-10 * v); },
};

/** 0→1 between `at` and `at + dur` seconds, eased. */
export const prog = (t, at, dur = 0.8, fn = ease.out) => fn((t - at) / dur);

/** In at `inAt`, out at `outAt`: 0→1→0 (for things that come and go). */
export const window2 = (t, inAt, outAt, inDur = 0.6, outDur = 0.5) => Math.min(prog(t, inAt, inDur), 1 - prog(t, outAt, outDur, ease.in));

export const mix = (a, b, p) => a + (b - a) * p;

/**
 * Piecewise motion through keyframes: [[time, value], …], eased between
 * neighbours. Holds the first and last values outside the range.
 */
export const keys = (t, frames, fn = ease.inOut) => {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i += 1) {
    const [t1, v1] = frames[i];
    const [t0, v0] = frames[i - 1];
    if (t <= t1) return mix(v0, v1, fn((t - t0) / (t1 - t0)));
  }
  return frames[frames.length - 1][1];
};

/** Motion blur for fast moves: a small blur while something travels. */
export const blur = (speed) => (speed > 0.02 ? `blur(${Math.min(6, speed * 40).toFixed(1)}px)` : 'none');

/** CSS transform from parts. */
export const tf = ({ x = 0, y = 0, s = 1, r = 0 } = {}) => `translate3d(${x}px, ${y}px, 0) scale(${s}) rotate(${r}deg)`;
