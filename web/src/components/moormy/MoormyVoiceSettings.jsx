import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Microphone, Trash, Waveform } from '../../lib/icons';
import {
  micDetail, micProblem, micSupported, recordSaying,
} from '../../lib/moormy/wake/listener';
import { learnVoice, takeSaying } from '../../lib/moormy/wake/voice';
import * as wake from '../../lib/moormy/wakeControl';

/*
 * Moormy's settings: her voice on or off, and "Teach Moormy your voice"
 * (docs/moormy): three takes of "Hey Moormy" become number fingerprints
 * kept on this device, then a switch listens for them while E-MOORM is open.
 * No audio is stored or sent. Hidden where the browser has no mic support.
 */

const TAKE_TIP = {
  quiet: 'I didn’t hear you. Hold the phone or laptop a little closer and try again.',
  short: 'That was very short. Say the whole “Hey Moormy” and try again.',
  long: 'That was a bit long. Say just “Hey Moormy”, then stop.',
};

const isIPhone = () => typeof navigator !== 'undefined'
  && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
const isAndroid = () => typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);

/** How to let the microphone in, on this kind of phone. */
const allowSteps = () => {
  if (isIPhone()) return 'On iPhone: tap “aA” in the address bar › Website Settings › Microphone › Allow (or Settings › Safari › Microphone), then try again.';
  if (isAndroid()) return 'On Android: tap the icon left of the address › Permissions › Microphone › Allow, then try again.';
  return 'Click the icon left of the address › Microphone › Allow, then try again.';
};

const MIC_TIP = {
  inapp: 'This app’s built-in browser doesn’t share the microphone. Open emoorm.shop in Chrome or Safari (⋯ › Open in browser) and set it up there.',
  insecure: 'The microphone works only on the secure site. Open https://emoorm.shop and try again.',
  blocked: `The microphone is blocked for this site. ${allowSteps()}`,
  none: 'No microphone was found on this device.',
  busy: 'Another app is using the microphone (a call, a recorder, a video app). Close it and try again.',
  failed: 'The microphone couldn’t be opened. Try again, or open emoorm.shop in Chrome or Safari.',
};

/** What to tell the person, with the browser's own name for it in brackets. */
const micTip = (err) => {
  const detail = micDetail(err);
  const tip = MIC_TIP[micProblem(err)];
  return detail ? `${tip} (${detail})` : tip;
};

const STATE_TEXT = {
  starting: 'Starting the mic…',
  listening: 'Listening. Say “Hey Moormy” any time while this page is open.',
  paused: 'Paused while Moormy talks, hears you, or the tab is hidden.',
  off: 'Off.',
};

const SENSITIVITY = [
  { value: 0.85, label: 'Strict', hint: 'fewer false starts' },
  { value: 1, label: 'Normal', hint: '' },
  { value: 1.2, label: 'Easy', hint: 'hears you from further away' },
];

const useWake = () => useSyncExternalStore(wake.subscribeWake, wake.getWake, wake.getWake);

function Teach({ onDone, onCancel, hasVoice }) {
  const [takes, setTakes] = useState([]);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [tip, setTip] = useState('');
  const abortRef = useRef(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const record = async () => {
    if (recording) {
      abortRef.current?.abort();
      return;
    }
    setTip('');
    setRecording(true);
    const release = wake.hold();
    const abort = new AbortController();
    abortRef.current = abort;
    let samples = null;
    try {
      samples = await recordSaying({ maxMs: 3000, onLevel: setLevel, signal: abort.signal });
    } catch (err) {
      setTip(micTip(err));
    } finally {
      release();
      setRecording(false);
      setLevel(0);
      abortRef.current = null;
    }
    if (!samples) return;
    const take = takeSaying(samples);
    if (!take.ok) {
      setTip(TAKE_TIP[take.reason] || TAKE_TIP.quiet);
      return;
    }
    const next = [...takes, take.frames];
    if (next.length < 3) {
      setTakes(next);
      return;
    }
    const learned = learnVoice(next);
    if (!learned.ok) {
      setTakes([]);
      setTip('Those three sounded quite different from each other. Let’s start over: say it the same way each time.');
      return;
    }
    wake.keepVoice(learned.voice);
    onDone();
  };

  const n = takes.length;
  return (
    <div className="mmg-teach">
      <ol className="mmg-takes" aria-label="Takes">
        {[0, 1, 2].map((i) => (
          <li key={i} className={i < n ? 'is-done' : i === n ? 'is-now' : ''}>
            {i < n ? <Check size={14} weight="bold" /> : i + 1}
          </li>
        ))}
      </ol>
      <p className="mmg-teach-say">
        {n === 0 ? 'Tap the mic, then say “Hey Moormy” in your normal voice.' : `Good! Take ${n + 1} of 3: say it again, the same way.`}
      </p>
      <div className="mmg-meter" aria-hidden="true">
        <span style={{ transform: `scaleX(${recording ? Math.max(0.04, level) : 0})` }} />
      </div>
      <button
        type="button"
        className={`mmg-teach-mic${recording ? ' is-on' : ''}`}
        onClick={record}
        aria-label={recording ? 'Stop recording' : `Record take ${n + 1}`}
      >
        <Microphone size={24} weight={recording ? 'fill' : 'regular'} />
      </button>
      <p className="mmg-teach-state" role="status" aria-live="polite">
        {recording ? 'Listening… it stops by itself when you finish.' : tip}
      </p>
      {(hasVoice || n > 0) && (
        <button type="button" className="mmg-link" onClick={onCancel}>Cancel</button>
      )}
    </div>
  );
}

export default function MoormyVoiceSettings({ muted, onMuted, canHear }) {
  const w = useWake();
  const [teaching, setTeaching] = useState(false);
  const [testing, setTesting] = useState(false);
  const supported = micSupported();

  useEffect(() => {
    wake.setTesting(testing);
    return () => wake.setTesting(false);
  }, [testing]);

  const on = w.listen && w.state !== 'off' && w.state !== 'error';

  const toggle = () => {
    if (on || w.listen) wake.turnOff();
    else wake.turnOn();
  };

  return (
    <div className="mmg-settings">
      <section className="mmg-set">
        <label className="mmg-switch-row">
          <span>
            <strong>Read replies aloud</strong>
            <small>When you talk to Moormy, she answers out loud too. Tap the speaker on any reply to hear it.</small>
          </span>
          <input type="checkbox" role="switch" className="mmg-switch" checked={!muted} onChange={(e) => onMuted(!e.target.checked)} />
        </label>
        {canHear && (
          <p className="mmg-fine">When you use the mic, your words go to your browser’s speech service to be turned into text.</p>
        )}
      </section>

      {supported && (
        <section className="mmg-set">
          <h3><Waveform size={17} /> Teach Moormy your voice</h3>
          <p className="mmg-fine">
            Say “Hey Moormy” three times so she knows your voice, then open her hands-free.
            Only numbers are kept, on this device; no audio leaves it.
          </p>

          {teaching || !w.voice ? (
            <Teach
              hasVoice={Boolean(w.voice)}
              onDone={() => setTeaching(false)}
              onCancel={() => setTeaching(false)}
            />
          ) : (
            <>
              <label className="mmg-switch-row">
                <span>
                  <strong>Listen for “Hey Moormy”</strong>
                  <small className={`mmg-ear-state is-${w.state}`}>
                    {w.state === 'error' ? MIC_TIP[w.problem] || MIC_TIP.failed : (w.listen ? STATE_TEXT[w.state] : 'Off. Works while E-MOORM is open in front.')}
                  </small>
                </span>
                <input type="checkbox" role="switch" className="mmg-switch" checked={on || (w.listen && w.state === 'starting')} onChange={toggle} />
              </label>

              <fieldset className="mmg-sense">
                <legend>How closely it must match</legend>
                {SENSITIVITY.map((s) => (
                  <label key={s.value} className={w.sensitivity === s.value ? 'is-on' : ''}>
                    <input
                      type="radio"
                      name="mmg-sense"
                      value={s.value}
                      checked={w.sensitivity === s.value}
                      onChange={() => wake.setSensitivity(s.value)}
                    />
                    <span>{s.label}</span>
                    {s.hint && <small>{s.hint}</small>}
                  </label>
                ))}
              </fieldset>

              <div className="mmg-set-tools">
                <button
                  type="button"
                  className="mmg-action"
                  aria-pressed={testing}
                  onClick={() => {
                    if (!testing && !w.listen) wake.turnOn();
                    setTesting(!testing);
                  }}
                >
                  {testing ? 'Done testing' : 'Test'}
                </button>
                <button type="button" className="mmg-action is-quiet" onClick={() => setTeaching(true)}>Teach again</button>
                <button type="button" className="mmg-action is-danger" onClick={() => { setTesting(false); wake.forget(); }}>
                  <Trash size={14} /> Forget my voice
                </button>
              </div>

              {testing && (
                <div className="mmg-test" aria-live="polite">
                  <p className="mmg-fine">Say “Hey Moormy”, and some other words. Each thing she hears shows here; a match won’t open anything while testing.</p>
                  {w.heard.length === 0 ? (
                    <p className="mmg-test-empty">{w.state === 'listening' ? 'Nothing heard yet.' : 'Waiting for the mic…'}</p>
                  ) : (
                    <ul>
                      {w.heard.map((h) => (
                        <li key={h.at} className={h.matched ? 'is-match' : ''}>
                          <span>{(h.ms / 1000).toFixed(1)} s</span>
                          <span>
                            {h.distance == null
                              ? 'not the length of “Hey Moormy”'
                              : `${h.matched ? 'Match' : 'No match'} (${h.distance} / ${Math.round(h.threshold * 10) / 10})`}
                          </span>
                          {h.matched && <Check size={14} weight="bold" />}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
