import { createPortal } from 'react-dom';
import { Check, X } from '../../lib/icons';
import { useSheetClose } from '../../hooks/useSheetMotion';
import useFocusTrap from '../../hooks/useFocusTrap';
import Avatar from './Avatar';
import { AVATARS, avatarFor } from './avatars';
import './AvatarPicker.css';

/**
 * Pick one of the twenty, instead of a photo: a bottom sheet on phones, a
 * dialog on computers. The one in use is ringed; choosing another closes it
 * -- there is no Save here, because the form underneath already has one and
 * two Saves in a row is one too many.
 *
 * `current` may be empty, which is the ordinary case: the person has never
 * picked and is being shown the avatar their id works out to. That one is
 * ringed then, so what they see here matches what they see everywhere else.
 *
 * @param {String} [current] - the chosen key
 * @param {String} seed - the account id, for working out the default
 */
export default function AvatarPicker({
  current, seed, onPick, onClose: onCloseProp,
}) {
  const [closing, onClose] = useSheetClose(onCloseProp);
  const trapRef = useFocusTrap(true, { onClose });
  const inUse = current || avatarFor(seed).key;

  return createPortal(
    <div className={`avp-backdrop ui-sheet-backdrop${closing ? ' is-closing' : ''}`} onClick={() => onClose()} role="presentation">
      <div
        ref={trapRef}
        className="avp-sheet ui-sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avp-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="avp-head">
          <h2 id="avp-title">Pick an avatar</h2>
          <button type="button" className="avp-close" onClick={() => onClose()} aria-label="Close"><X size={20} /></button>
        </div>
        <p className="avp-note">Used when you have no photo.</p>

        <div className="avp-grid">
          {AVATARS.map((spec) => {
            const on = inUse === spec.key;
            return (
              <button
                key={spec.key}
                type="button"
                className={`avp-cell${on ? ' is-on' : ''}`}
                aria-label={`Avatar ${spec.key}`}
                aria-pressed={on}
                onClick={() => { onPick(spec.key); onClose(); }}
              >
                <Avatar name={spec.key} seed={seed} size="100%" />
                {on && <span className="avp-tick"><Check size={12} weight="bold" /></span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
