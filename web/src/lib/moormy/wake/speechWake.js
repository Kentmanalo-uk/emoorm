/**
 * "Hey Moormy" heard by the browser's own speech service (the owner's choice,
 * 11 Nov 2026: no teaching). While it is on, the browser listens all the time
 * and sends what it hears to its speech service (Google in Chrome and Edge,
 * Apple in Safari); each piece of text is checked here for "Hey Moormy".
 * The settings say so plainly. Firefox has no speech service: not offered.
 *
 *   const ear = createSpeechWake({ onWake(rest), onState, onHeard });
 *   ear.start() / ear.stop() / ear.pause() / ear.resume() / ear.destroy()
 *
 * "Hey Moormy, find me pasalubong" in one breath: onWake('find me pasalubong').
 * Just "Hey Moormy": onWake(''), and Moormy listens for the request.
 */

const Recognition = () => (typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition || null
  : null);

export const speechWakeSupported = () => Boolean(Recognition());

const GREET = new Set(['hey', 'hay', 'hei', 'hi', 'ey', 'eh', 'okay', 'ok', 'ay', 'hoy', 'uy', 'oy', 'a']);
// How speech services tend to write a name they don't know.
const FORMS = new Set([
  'moormy', 'mormy', 'moormie', 'mormie', 'murmy', 'murmie', 'moremy', 'moremi', 'mourmy', 'moomy',
  'murphy', 'mermy', 'marmy', 'moorme', 'moreme', 'morme', 'mormi', 'moormi', 'mommy', 'mummy',
]);
// Real words close to it that are not her name.
const NOT_HER = new Set(['money', 'mary', 'marie', 'merry', 'many', 'memory', 'moment', 'morning', 'mom', 'more', 'mor']);

const editDistance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
};

const isHerName = (w, strict = false) => {
  if (!w || NOT_HER.has(w)) return false;
  if (FORMS.has(w)) return true;
  return w[0] === 'm' && w.length >= 4 && editDistance(w, 'moormy') <= (strict ? 1 : 2);
};

const wordsOf = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ\s'₱]/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Where "Hey Moormy" is in a piece of heard text, and what was said after it.
 * Her name with a greeting before it ("hey", "hi", "ok"), or alone at the
 * start and spelled close to it. Pure.
 * @returns {{ found: boolean, rest: string }}
 */
export const findWake = (text) => {
  const w = wordsOf(text);
  for (let i = 0; i < w.length; i += 1) {
    const greeted = i > 0 && GREET.has(w[i - 1]);
    if (!greeted && i !== 0) continue;
    // One word ("moormy") or two run together ("moor me", "more me"): the
    // closer to her name wins, two words on a tie ("moor" + "me").
    const options = [[w[i], 1], ...(w[i + 1] ? [[`${w[i]}${w[i + 1]}`, 2]] : [])]
      .filter(([name]) => isHerName(name, !greeted))
      .map(([name, used]) => ({ used, d: FORMS.has(name) ? 0 : editDistance(name, 'moormy') }))
      .sort((a, b) => a.d - b.d || b.used - a.used);
    if (options.length) return { found: true, rest: w.slice(i + options[0].used).join(' ').trim() };
  }
  return { found: false, rest: '' };
};

/** Words for the browser's speech service: Filipino English hears "Hey Moormy" best. */
const LANG = 'en-PH';

/**
 * The listener. States: 'off' | 'starting' | 'listening' | 'paused' | 'error'
 * onState(state, problem?) — problem: 'blocked' | 'none' | 'failed' on 'error'.
 * onHeard({ text, final, matched }) — each piece of text, for the test view.
 */
export const createSpeechWake = ({ onWake, onState, onHeard } = {}) => {
  const SR = Recognition();
  let state = 'off';
  let rec = null;
  let wanted = false;
  let held = 0;
  let failures = 0;
  let restartTimer = null;
  let quietUntil = 0; // after a wake: the mic is left to Moormy for a moment

  const set = (s, problem) => {
    if (state === s && !problem) return;
    state = s;
    onState?.(s, problem);
  };

  const halt = () => {
    clearTimeout(restartTimer);
    const r = rec;
    rec = null;
    if (r) {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      try { r.abort(); } catch { /* already over */ }
    }
  };

  const later = (ms) => { clearTimeout(restartTimer); restartTimer = setTimeout(() => begin(), ms); };

  const begin = () => {
    if (!SR || !wanted || held || rec || (typeof document !== 'undefined' && document.hidden)) return;
    const wait = quietUntil - Date.now();
    if (wait > 0) { later(wait); return; }
    const r = new SR();
    rec = r;
    r.lang = LANG;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    let pending = null; // heard her name in a piece not yet final
    const wakeWith = (rest) => {
      clearTimeout(pending?.timer);
      pending = null;
      quietUntil = Date.now() + 2500;
      halt();
      set('paused');
      onWake?.(rest);
      // Listening again once Moormy is done (resume), or after the quiet moment.
      later(2600);
    };
    r.onstart = () => { failures = 0; set('listening'); };
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        let hit = { found: false, rest: '' };
        for (let k = 0; k < res.length && !hit.found; k += 1) hit = findWake(res[k].transcript);
        onHeard?.({ text: res[0].transcript, final: res.isFinal, matched: hit.found });
        if (!hit.found) continue;
        if (res.isFinal) { wakeWith(hit.rest); return; }
        // The rest of the sentence may still be coming: wait for the final
        // text a little, then go with what there is.
        if (!pending) pending = { rest: hit.rest, timer: setTimeout(() => wakeWith(pending?.rest || ''), 2500) };
        else pending.rest = hit.rest;
      }
    };
    r.onerror = (e) => {
      const code = e?.error || '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        wanted = false;
        halt();
        set('error', 'blocked');
      } else if (code === 'audio-capture') {
        wanted = false;
        halt();
        set('error', 'none');
      } else if (code === 'network') {
        failures += 1;
      }
    };
    r.onend = () => {
      rec = null;
      if (pending) { wakeWith(pending.rest); return; }
      if (!wanted || state === 'error') return;
      if (held || (typeof document !== 'undefined' && document.hidden)) { set('paused'); return; }
      // The service ends a session now and then: started again at once, or
      // more slowly when it keeps failing (no connection).
      later(failures ? Math.min(30000, 1000 * 2 ** failures) : 300);
    };
    try {
      set('starting');
      r.start();
    } catch {
      rec = null;
      failures += 1;
      later(1500);
    }
  };

  const onVisibility = () => {
    if (!wanted) return;
    if (document.hidden) { halt(); set('paused'); } else begin();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  return {
    get state() { return state; },
    start() {
      if (!SR) { set('error', 'failed'); return; }
      wanted = true;
      held = 0;
      begin();
    },
    stop() {
      wanted = false;
      held = 0;
      halt();
      set('off');
    },
    /** Let go of the mic while Moormy hears a request or speaks. */
    pause() {
      held += 1;
      halt();
      if (wanted) set('paused');
    },
    resume() {
      held = Math.max(0, held - 1);
      if (wanted && !held) begin();
    },
    destroy() {
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      this.stop();
    },
  };
};
