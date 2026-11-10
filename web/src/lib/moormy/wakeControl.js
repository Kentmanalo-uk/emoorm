import { createListener, micSupported } from './wake/listener';
import { loadVoice, saveVoice, forgetVoice } from './wake/voice';
import { loadPrefs, savePrefs } from './talk';

/**
 * "Hey Moormy" for the whole site (docs/moormy, "Teach Moormy your voice"):
 * one listener, shared by the floating Moormy (whose badge shows it is
 * listening) and the panel's settings. Off by default.
 *
 * The listener is paused whenever something else needs the mic or would be
 * heard by it: the browser's speech recognition, Moormy speaking, a take
 * being recorded. hold() returns the matching release, safe to call twice.
 *
 * Browsers open the mic only from a tap: turnOn() is called from one, and
 * after a reload with listening left on, armOnFirstTap() waits for the next
 * tap anywhere on the page.
 */

let ear = null;
let onWakeHandler = null;
let testing = false;
let armed = null;
let snap = {
  state: 'off', problem: null, heard: [], voice: null, listen: false, sensitivity: 1,
};
const listeners = new Set();

const set = (patch) => {
  snap = { ...snap, ...patch };
  listeners.forEach((fn) => fn());
};

const prefs = loadPrefs();
snap = {
  ...snap, voice: loadVoice(), listen: prefs.listen, sensitivity: prefs.sensitivity,
};

export const supported = () => micSupported();
export const getWake = () => snap;
export const subscribeWake = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** What opening Moormy on a wake does (the floating Moormy sets it). */
export const setWakeHandler = (fn) => { onWakeHandler = fn; };
/** The settings' Test view: wakes are shown there instead of opening a request. */
export const setTesting = (on) => { testing = Boolean(on); };

const makeEar = () => {
  ear?.destroy();
  ear = createListener({
    sensitivity: snap.sensitivity,
    onState: (state, problem) => {
      set({ state, problem: state === 'error' ? problem || 'failed' : null });
      // A blocked or missing mic turns listening off; it stays chosen off.
      if (state === 'error') {
        savePrefs({ listen: false });
        set({ listen: false });
      }
    },
    onHeard: (h) => set({ heard: [{ ...h, at: Date.now() }, ...snap.heard].slice(0, 8) }),
    onWake: () => {
      if (!testing) onWakeHandler?.();
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
  if (!snap.voice || !micSupported()) return;
  savePrefs({ listen: true });
  set({ listen: true, problem: null });
  await (ear || makeEar()).start(snap.voice);
};

/** Stop listening; the mic is let go at once. */
export const turnOff = () => {
  disarm();
  savePrefs({ listen: false });
  set({ listen: false });
  ear?.stop();
};

/** Listening was left on: start again on the next tap anywhere (browsers need one). */
export const armOnFirstTap = () => {
  if (armed || !snap.listen || !snap.voice || !micSupported() || ear?.state === 'listening') return;
  armed = () => { turnOn(); };
  document.addEventListener('pointerdown', armed, true);
  document.addEventListener('keydown', armed, true);
};

/** How close a saying must be: 0.85 strict, 1 normal, 1.2 easy. Call from a tap. */
export const setSensitivity = async (s) => {
  const sensitivity = [0.85, 1, 1.2].includes(s) ? s : 1;
  savePrefs({ sensitivity });
  set({ sensitivity });
  const was = snap.listen && ear && ear.state !== 'off';
  ear?.destroy();
  ear = null;
  set({ state: 'off' });
  if (was) await turnOn();
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

/** A voice just learned: kept on this device. */
export const keepVoice = (voice) => {
  saveVoice(voice);
  set({ voice, heard: [] });
};

/** Forget the voice and stop listening. */
export const forget = () => {
  turnOff();
  ear?.destroy();
  ear = null;
  forgetVoice();
  set({ voice: null, heard: [], state: 'off', problem: null });
};
