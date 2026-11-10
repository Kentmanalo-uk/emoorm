import { createSpeechWake, speechWakeSupported } from './wake/speechWake';
import { forgetVoice } from './wake/voice';
import { loadPrefs, savePrefs } from './talk';

/**
 * "Hey Moormy" for the whole site (docs/moormy): one listener, shared by
 * the page (MoormyGlobal: what a wake does, the dot) and her settings.
 * Off by default.
 *
 * It listens with the browser's own speech service (wake/speechWake.js; the
 * owner's choice, 11 Nov 2026, instead of teaching a voice): no set-up but
 * the switch. While it is on, what is said near the device goes to that
 * service; the settings say so.
 *
 * The listener lets go of the mic whenever Moormy hears a request or
 * speaks: hold() returns the matching release, safe to call twice.
 *
 * Browsers start listening only from a tap: turnOn() is called from one, and
 * after a reload with listening left on, armOnFirstTap() waits for the next
 * tap anywhere on the page.
 */

let ear = null;
let onWakeHandler = null;
let testing = false;
let armed = null;
let snap = {
  state: 'off', problem: null, heard: [], listen: false,
};
const listeners = new Set();

const set = (patch) => {
  snap = { ...snap, ...patch };
  listeners.forEach((fn) => fn());
};

snap = { ...snap, listen: loadPrefs().listen };
// Voices taught before (the earlier way) are not used any more: not kept.
forgetVoice();

export const supported = () => speechWakeSupported();
export const getWake = () => snap;
export const subscribeWake = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** What hearing "Hey Moormy" does: handler(rest), rest = what followed it. */
export const setWakeHandler = (fn) => { onWakeHandler = fn; };
/** The settings' test view: wakes are shown there instead of opening Moormy. */
export const setTesting = (on) => { testing = Boolean(on); };

const makeEar = () => {
  ear?.destroy();
  ear = createSpeechWake({
    onState: (state, problem) => {
      set({ state, problem: state === 'error' ? problem || 'failed' : null });
      // A blocked or missing mic turns listening off; it stays chosen off.
      if (state === 'error') {
        savePrefs({ listen: false });
        set({ listen: false });
      }
    },
    onHeard: (h) => {
      if (!h.final && !h.matched) return; // the test view lists whole pieces
      set({ heard: [{ ...h, at: Date.now() }, ...snap.heard].slice(0, 8) });
    },
    onWake: (rest) => {
      if (!testing) onWakeHandler?.(rest);
    },
  });
  return ear;
};

const disarm = () => {
  if (!armed) return;
  document.removeEventListener('pointerdown', armed, true);
  document.removeEventListener('keydown', armed, true);
  armed = null;
};

/** Start listening. Call from a tap. */
export const turnOn = async () => {
  disarm();
  if (!speechWakeSupported()) return;
  savePrefs({ listen: true });
  set({ listen: true, problem: null });
  (ear || makeEar()).start();
};

/** Stop listening; the mic is let go at once. */
export const turnOff = () => {
  disarm();
  savePrefs({ listen: false });
  set({ listen: false, heard: [] });
  ear?.stop();
};

/** Listening was left on: start again on the next tap anywhere (browsers need one). */
export const armOnFirstTap = () => {
  if (armed || !snap.listen || !speechWakeSupported() || ear?.state === 'listening') return;
  armed = () => { turnOn(); };
  document.addEventListener('pointerdown', armed, true);
  document.addEventListener('keydown', armed, true);
};

/** Hold the mic off while something else uses it. Returns release(). */
export const hold = () => {
  if (!ear) return () => {};
  const held = ear;
  held.pause();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held.resume();
  };
};
