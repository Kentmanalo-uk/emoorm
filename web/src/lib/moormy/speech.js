/**
 * The browser's own speech services (docs/moormy, decision B): speech to
 * text for the mic button and after "Hey Moormy" (Chrome and Edge send the
 * spoken request to their speech service, Safari to Apple's; Firefox has
 * none, so the button is hidden there), and Moormy's replies read aloud by
 * the device's own voices.
 */

const Recognition = () => (typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition || null
  : null);

export const recognitionSupported = () => Boolean(Recognition());
export const synthesisSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

/** The language the browser should hear: Filipino when Moormy is speaking Tagalog. */
export const hearLang = (lang) => (lang === 'tl' ? 'fil-PH' : 'en-PH');

/** Words a person can act on, for SpeechRecognition's error codes. */
export const hearProblem = (code) => {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'The microphone is blocked. Allow it in your browser’s site settings, or type instead.';
  if (code === 'audio-capture') return 'No microphone was found. You can type instead.';
  if (code === 'network') return 'Voice needs a connection. Check it, or type instead.';
  if (code === 'no-speech') return 'I didn’t hear anything. Tap the mic and try again.';
  if (code === 'language-not-supported') return 'This browser can’t hear that language. You can type instead.';
  return 'I couldn’t hear that. Tap the mic and try again, or type.';
};

/**
 * One request by voice.
 *   const ear = listenOnce({ lang, onText(text, final), onEnd(error?) })
 *   ear.stop()   // finish now (what was heard so far is kept)
 *   ear.abort()  // drop it
 */
export const listenOnce = ({ lang = 'en', onText, onEnd }) => {
  const SR = Recognition();
  if (!SR) {
    onEnd?.('unsupported');
    return { stop() {}, abort() {} };
  }
  const rec = new SR();
  rec.lang = hearLang(lang);
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  let ended = false;
  let error = null;
  let said = '';
  rec.onresult = (e) => {
    let text = '';
    let final = false;
    for (let i = 0; i < e.results.length; i += 1) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    said = text.trim();
    onText?.(said, final);
  };
  rec.onerror = (e) => { error = e.error || 'failed'; };
  // Some browsers never end a request on their own (no speech service):
  // stop after a while, and give up if even that is not answered.
  let guard = setTimeout(() => {
    try { rec.stop(); } catch { /* already over */ }
    guard = setTimeout(() => rec.onend?.(), 1500);
  }, 12000);
  rec.onend = () => {
    clearTimeout(guard);
    if (ended) return;
    ended = true;
    // 'aborted' is our own stop; silence with nothing said is no-speech.
    onEnd?.(error === 'aborted' ? null : (error || (said ? null : 'no-speech')), said);
  };
  try {
    rec.start();
  } catch {
    clearTimeout(guard);
    ended = true;
    onEnd?.('failed');
  }
  return {
    stop() { try { rec.stop(); } catch { /* already over */ } },
    abort() { error = 'aborted'; try { rec.abort(); } catch { /* already over */ } },
  };
};

// ── Speaking ────────────────────────────────────────────────────────────────

/** The device's best voice for this language (a Filipino voice is rare: English then). */
export const pickVoice = (voices, lang) => {
  const list = Array.isArray(voices) ? voices : [];
  const by = (re) => list.find((v) => re.test(v.lang || ''));
  if (lang === 'tl') return by(/^(fil|tl)\b/i) || by(/^en-PH/i) || null;
  return by(/^en-PH/i) || by(/^en-(US|GB)/i) || by(/^en\b/i) || null;
};

/** Plain words for the voice: no markdown stars, ₱ read as pesos. */
export const speakable = (text) => String(text || '')
  .replace(/\*\*?([^*]+)\*\*?/g, '$1')
  .replace(/₱\s?([\d,.]+)/g, '$1 pesos')
  .replace(/^[-•]\s+/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * Say a reply. onStart/onEnd bracket the time it is speaking (onEnd also on
 * stop, an error, or a browser that never starts). Returns stop().
 */
export const say = (text, lang, { onStart, onEnd } = {}) => {
  if (!synthesisSupported() || !text) {
    onEnd?.();
    return () => {};
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new window.SpeechSynthesisUtterance(speakable(text));
  const voice = pickVoice(synth.getVoices(), lang);
  if (voice) u.voice = voice;
  u.lang = voice?.lang || hearLang(lang);
  u.rate = 1;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(guard);
    onEnd?.();
  };
  // Some browsers never fire onend (Chrome on long text, or a blocked voice):
  // give up after about as long as the words would take, plus a margin.
  const guard = setTimeout(finish, 4000 + speakable(text).length * 90);
  u.onstart = () => onStart?.();
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
  return () => {
    synth.cancel();
    finish();
  };
};

export const stopSpeaking = () => {
  if (synthesisSupported()) window.speechSynthesis.cancel();
};
