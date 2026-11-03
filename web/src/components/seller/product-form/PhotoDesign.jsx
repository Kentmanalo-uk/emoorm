import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from '../../../lib/icons';
import { resolveImg } from '../../../lib/media';
import { IMAGE_OVERLAYS } from '../../../lib/imageOverlays';
import ImageOverlay from '../../product/ImageOverlay';
import { Switch } from './parts';

const FIRST = IMAGE_OVERLAYS[0].key;

/**
 * Photo design: the shop's branding (logo, name, colour) drawn over the
 * product's photos wherever buyers see them. A switch turns it on or off;
 * when on, the ten designs are shown on the seller's own first photo to pick
 * from. The photos themselves are never changed, so it can be turned off or
 * changed any time.
 */
export default function PhotoDesign({
  value, onChange, store, cover,
}) {
  const on = Boolean(value);
  // Turned off and on again: the design picked last.
  const [last, setLast] = useState(value || FIRST);
  const photo = cover ? resolveImg(cover) || cover : null;
  const toggle = (next) => onChange(next ? last : null);
  const pick = (key) => {
    onChange(key);
    setLast(key);
  };

  return (
    <div className="pf-design">
      <Switch
        checked={on}
        onChange={toggle}
        label="Brand your photos"
        sub="Your shop's logo, name and colour over this product's photos. Your photos stay as they are."
      />
      {on && (
        <>
          <div className="pf-design-grid" role="radiogroup" aria-label="Photo design">
            {IMAGE_OVERLAYS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={value === key}
                className={`pf-design-opt${value === key ? ' is-on' : ''}`}
                onClick={() => pick(key)}
              >
                <span className="pf-design-photo">
                  {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="pf-design-blank" />}
                  <ImageOverlay design={key} store={store} />
                  {value === key && <span className="pf-design-check"><Check size={13} weight="bold" /></span>}
                </span>
                <span className="pf-design-label">{label}</span>
              </button>
            ))}
          </div>
          {!store?.logo && (
            <p className="pf-design-note">
              Your shop has no logo yet, so its initials show instead.
              {' '}<Link to="/seller/store/branding">Add a logo</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
