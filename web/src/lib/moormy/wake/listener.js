import { SAMPLE_RATE } from './dsp';
import { createMatcher } from './voice';

/**
 * The microphone side of "Teach Moormy your voice".
 *
 *   const ear = createListener({ onWake, onState });
 *   await ear.start(voice)   // from a tap: browsers only open the mic then
 *   ear.pause() / ear.resume()   // while Moormy talks or takes a request
 *   ear.stop()
 *
 *   const samples = await recordSaying({ onLevel })   // one saying, for teaching
 *
 * Audio goes microphone -> worklet (16 kHz) -> numbers -> gone. Nothing is
 * stored or sent. The mic is let go whenever the tab is hidden and taken
 * back when it is shown again, so the browser's "mic in use" mark is only
 * there while the page is in front.
 */

const WORKLET = '/moormy/capture-worklet.js';

export const micSupported = () => typeof window !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia
  && !!(window.AudioContext || window.webkitAudioContext)
  && typeof AudioWorkletNode !== 'undefined';

/** Why the mic could not be opened, in words a person can act on. */
export const micProblem = (err) => {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
};

/** Opens the mic and calls onChunk(Float32Array at 16 kHz) until closed. */
const openMic = async (onChunk) => {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    },
  });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    await ctx.audioWorklet.addModule(WORKLET);
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'moormy-capture');
    node.port.onmessage = (e) => onChunk(e.data);
    source.connect(node);
    // Not connected to the speakers: the worklet runs as long as it has input
    // in Chromium; Safari and Firefox want the graph to reach an output, so a
    // silent gain does that without making any sound.
    const mute = ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute).connect(ctx.destination);
    return {
      stream,
      close: () => {
        node.port.onmessage = null;
        try { source.disconnect(); node.disconnect(); mute.disconnect(); } catch { /* already gone */ }
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      },
    };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    throw err;
  }
};

/**
 * Records one saying for teaching: starts at once, stops by itself a moment
 * after the person finishes (or after maxMs). onLevel(0..1) is for a meter.
 * @returns {Promise<Float32Array>} 16 kHz mono
 */
export const recordSaying = async ({ maxMs = 3500, onLevel, signal } = {}) => {
  const pieces = [];
  let heardSpeech = false;
  let quietMs = 0;
  let floor = null;
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const mic = await openMic((chunk) => {
    pieces.push(chunk);
    let s = 0;
    for (let i = 0; i < chunk.length; i += 1) s += chunk[i] * chunk[i];
    const db = 10 * Math.log10(s / chunk.length + 1e-12);
    // The first 300 ms tell us how loud the room is.
    if (pieces.length <= 2) floor = floor == null ? db : Math.min(floor, db);
    const loud = floor != null && db > Math.max(-55, floor + 12);
    onLevel?.(Math.max(0, Math.min(1, (db + 60) / 50)));
    if (loud) { heardSpeech = true; quietMs = 0; } else if (heardSpeech) quietMs += (chunk.length / SAMPLE_RATE) * 1000;
    const total = pieces.length * (chunk.length / SAMPLE_RATE) * 1000;
    if ((heardSpeech && quietMs >= 600) || total >= maxMs) finish();
  });
  const onAbort = () => finish();
  signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(finish, maxMs + 500);
  await done;
  clearTimeout(timer);
  signal?.removeEventListener('abort', onAbort);
  mic.close();
  onLevel?.(0);
  const out = new Float32Array(pieces.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of pieces) { out.set(p, o); o += p.length; }
  return out;
};

/**
 * Listens for the learned voice.
 * States: 'off' | 'starting' | 'listening' | 'paused' | 'error'
 * onState(state, problem?) — problem is micProblem()'s word on 'error'.
 * onHeard({ ms, distance, threshold, matched }) — each burst, for a test screen.
 */
export const createListener = ({
  onWake, onState, onHeard, sensitivity = 1,
} = {}) => {
  let state = 'off';
  let voice = null;
  let mic = null;
  let matcher = null;
  let wanted = false; // on, as far as the person is concerned
  let held = 0; // pause() calls not yet resumed
  let opening = null;
  let lastWake = 0;

  const set = (s, problem) => {
    if (state === s && !problem) return;
    state = s;
    onState?.(s, problem);
  };

  const close = () => {
    mic?.close();
    mic = null;
    matcher?.reset();
  };

  const open = async () => {
    if (mic || opening || !voice) return;
    set('starting');
    opening = (async () => {
      try {
        matcher = createMatcher(voice, {
          sensitivity,
          onHeard,
          onWake: (w) => {
            // One saying, one wake (the tail of a burst can match twice).
            const now = Date.now();
            if (now - lastWake < 1500) return;
            lastWake = now;
            onWake?.(w);
          },
        });
        const m = await openMic((chunk) => { if (!held) matcher.push(chunk); });
        // Turned off, hidden or paused while the mic was opening.
        if (!wanted || document.hidden || held) { m.close(); set(wanted ? 'paused' : 'off'); return; }
        mic = m;
        mic.stream.getAudioTracks()[0]?.addEventListener('ended', () => {
          // The mic was unplugged or taken by another app.
          if (mic !== m) return;
          mic = null;
          if (wanted) set('error', 'busy');
        });
        set('listening');
      } catch (err) {
        wanted = false;
        set('error', micProblem(err));
      } finally {
        opening = null;
      }
    })();
    await opening;
  };

  const onVisibility = () => {
    if (!wanted) return;
    if (document.hidden) { close(); set('paused'); } else if (!held) open();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    get state() { return state; },
    /** Start listening for this voice. Call from a tap the first time. */
    async start(v) {
      voice = v || voice;
      if (!voice) return;
      wanted = true;
      held = 0;
      await open();
    },
    stop() {
      wanted = false;
      held = 0;
      close();
      set('off');
    },
    /**
     * Stop hearing for a while (Moormy is talking, or the browser's speech
     * recognition needs the mic). The mic is let go, since phones often allow
     * only one listener at a time.
     */
    pause() {
      held += 1;
      if (!wanted) return;
      close();
      set('paused');
    },
    resume() {
      held = Math.max(0, held - 1);
      if (wanted && !held && !document.hidden) open();
    },
    destroy() {
      document.removeEventListener('visibilitychange', onVisibility);
      this.stop();
    },
  };
};
