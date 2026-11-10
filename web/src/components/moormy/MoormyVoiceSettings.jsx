import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, Waveform } from '../../lib/icons';
import { inAppBrowser } from '../../lib/moormy/wake/listener';
import { speechWakeSupported } from '../../lib/moormy/wake/speechWake';
import * as wake from '../../lib/moormy/wakeControl';

/*
 * Moormy's voice settings: her replies read aloud or not, and "Hey Moormy"
 * (docs/moormy). No set-up but the switch: the browser's own speech service
 * listens while it is on (the owner's choice, 11 Nov 2026), and this says so.
 * Hidden where the browser has no speech service (Firefox).
 */

const isIPhone = () => typeof navigator !== 'undefined'
  && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
const isAndroid = () => typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);

/** How to let the microphone in, on this kind of phone. */
const allowSteps = () => {
  if (isIPhone()) return 'On iPhone: tap “aA” in the address bar › Website Settings › Microphone › Allow (or Settings › Safari › Microphone), then switch it on again.';
  if (isAndroid()) return 'On Android: tap the icon left of the address › Permissions › Microphone › Allow, then switch it on again.';
  return 'Click the icon left of the address › Microphone › Allow, then switch it on again.';
};

const MIC_TIP = {
  inapp: 'This app’s built-in browser doesn’t share the microphone. Open emoorm.shop in Chrome or Safari (⋯ › Open in browser) and switch it on there.',
  blocked: `The microphone is blocked for this site. ${allowSteps()}`,
  none: 'No microphone was found on this device.',
  failed: 'Listening couldn’t start. Try again, or open emoorm.shop in Chrome or Safari.',
};

const STATE_TEXT = {
  starting: 'Starting…',
  listening: 'Listening. Say “Hey Moormy” any time while this page is open.',
  paused: 'Paused while Moormy talks or hears you, or the tab is hidden.',
  off: 'Off.',
};

const useWake = () => useSyncExternalStore(wake.subscribeWake, wake.getWake, wake.getWake);

export default function MoormyVoiceSettings({ muted, onMuted, canHear }) {
  const w = useWake();
  const [testing, setTesting] = useState(false);
  const supported = speechWakeSupported();

  useEffect(() => {
    wake.setTesting(testing);
    return () => wake.setTesting(false);
  }, [testing]);

  const on = w.listen && w.state !== 'off' && w.state !== 'error';
  const toggle = () => {
    if (on || w.listen) {
      setTesting(false);
      wake.turnOff();
    } else {
      wake.turnOn();
    }
  };
  const problem = inAppBrowser() ? 'inapp' : w.problem;

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
          <p className="mmg-fine">When you talk to Moormy, your words go to your browser’s speech service to be turned into text.</p>
        )}
      </section>

      {supported && (
        <section className="mmg-set">
          <h3><Waveform size={17} /> “Hey Moormy”</h3>
          <p className="mmg-fine">
            Switch it on, then say “Hey Moormy” on any page, with what you want in the same breath:
            “Hey Moormy, find me pasalubong”. Nothing to set up.
          </p>
          <label className="mmg-switch-row">
            <span>
              <strong>Listen for “Hey Moormy”</strong>
              <small className={`mmg-ear-state is-${w.state}`}>
                {w.state === 'error' ? MIC_TIP[problem] || MIC_TIP.failed : (w.listen ? STATE_TEXT[w.state] : 'Off. Works while E-MOORM is open in front.')}
              </small>
            </span>
            <input type="checkbox" role="switch" className="mmg-switch" checked={on || (w.listen && w.state === 'starting')} onChange={toggle} />
          </label>
          <p className="mmg-fine mmg-privacy-note">
            While this is on, what is said near your device goes to your browser’s speech service
            (Google in Chrome, Apple in Safari) so it can catch “Hey Moormy”. Emoorm keeps none of it.
            It uses some battery and data, and stops when you leave the page or switch it off.
          </p>

          {on && (
            <div className="mmg-set-tools">
              <button type="button" className="mmg-action" aria-pressed={testing} onClick={() => setTesting(!testing)}>
                {testing ? 'Done testing' : 'Test'}
              </button>
            </div>
          )}

          {testing && (
            <div className="mmg-test" aria-live="polite">
              <p className="mmg-fine">Say “Hey Moormy”, and some other words. What she hears shows here; “Hey Moormy” won’t open anything while testing.</p>
              {w.heard.length === 0 ? (
                <p className="mmg-test-empty">{w.state === 'listening' ? 'Nothing heard yet.' : 'Waiting for the mic…'}</p>
              ) : (
                <ul>
                  {w.heard.map((h) => (
                    <li key={h.at} className={h.matched ? 'is-match' : ''}>
                      <span className="notranslate" translate="no">“{h.text}”</span>
                      <span>{h.matched ? 'Hey Moormy' : ''}</span>
                      {h.matched && <Check size={14} weight="bold" />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
