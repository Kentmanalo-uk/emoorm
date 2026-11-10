import { useEffect, useRef, useState } from 'react';
import { X } from '../../lib/icons';
import useFocusTrap from '../../hooks/useFocusTrap';
import { loadPrefs, savePrefs } from '../../lib/moormy/talk';
import { recognitionSupported } from '../../lib/moormy/speech';
import MoormyVoiceSettings from './MoormyVoiceSettings';
import './MoormyGlobal.css';

/**
 * Moormy's voice assistant, set up from her chat in Messages (⋯ › Voice
 * assistant): read replies aloud, teach her your voice, and switch on
 * "Hey Moormy" (then she appears on any page when called; MoormyGlobal).
 */
export default function MoormyVoiceSheet({ onClose }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const trapRef = useFocusTrap(true, { onClose, modal: true });
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  return (
    <div className="mmy-voice-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section ref={trapRef} className="mmy-voice-sheet" role="dialog" aria-modal="true" aria-label="Moormy voice assistant">
        <header className="mmy-voice-head">
          <div>
            <strong>Voice assistant</strong>
            <small>Say “Hey Moormy” on any page and she works it for you.</small>
          </div>
          <button ref={closeRef} type="button" className="mmg-icon" onClick={onClose} aria-label="Close">
            <X size={18} weight="bold" />
          </button>
        </header>
        <MoormyVoiceSettings
          muted={prefs.muted}
          onMuted={(muted) => setPrefs(savePrefs({ muted }))}
          canHear={recognitionSupported()}
        />
      </section>
    </div>
  );
}
