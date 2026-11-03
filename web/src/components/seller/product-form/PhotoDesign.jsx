import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from '../../../lib/icons';
import axios from '../../../lib/axios';
import { resolveImg } from '../../../lib/media';
import { IMAGE_OVERLAYS } from '../../../lib/imageOverlays';
import ImageOverlay from '../../product/ImageOverlay';
import { Switch } from './parts';

const FIRST = IMAGE_OVERLAYS[0].key;

/**
 * Photo design: the shop's branding (logo, name, colour) drawn over the
 * product's photos wherever buyers see them. A switch turns it on or off;
 * when on, the ten ready designs are shown on the seller's own first photo
 * to pick from, then the shop's own designs (made in Photo designs; 'custom'
 * with `design` = { id, layers }). The photos themselves are never changed,
 * so it can be turned off or changed any time.
 *
 * onChange(key, design): design is null for a ready one and for off.
 */
export default function PhotoDesign({
  value, design = null, onChange, store, cover,
}) {
  const on = Boolean(value);
  // Turned off and on again: the design picked last (the shop's own too).
  const [last, setLast] = useState(value ? { key: value, design } : { key: FIRST, design: null });
  // The shop's own designs; null until loaded (or when they could not be).
  const [own, setOwn] = useState(null);
  const photo = cover ? resolveImg(cover) || cover : null;
  const pick = (key, picked = null) => {
    onChange(key, picked);
    setLast({ key, design: picked });
  };

  // Loaded again on coming back to this tab: a design just made in another.
  useEffect(() => {
    let live = true;
    const load = () => axios.get('/photo-designs', { quiet: true })
      .then((res) => { if (live) setOwn(res.data?.designs || []); })
      .catch(() => {});
    load();
    window.addEventListener('focus', load);
    return () => {
      live = false;
      window.removeEventListener('focus', load);
    };
  }, []);

  const tile = (key, label, picked, onPick, layers = null) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={picked}
      className={`pf-design-opt${picked ? ' is-on' : ''}`}
      onClick={onPick}
    >
      <span className="pf-design-photo">
        {photo ? <img src={photo} alt="" loading="lazy" /> : <span className="pf-design-blank" />}
        <ImageOverlay design={layers ? 'custom' : key} store={store} layers={layers} />
        {picked && <span className="pf-design-check"><Check size={13} weight="bold" /></span>}
      </span>
      <span className="pf-design-label">{label}</span>
    </button>
  );

  return (
    <div className="pf-design">
      <Switch
        checked={on}
        onChange={(next) => (next ? onChange(last.key, last.design) : onChange(null, null))}
        label="Brand your photos"
        sub="Your shop's logo, name and colour over this product's photos. Your photos stay as they are."
      />
      {on && (
        <>
          <div className="pf-design-grid" role="radiogroup" aria-label="Photo design">
            {IMAGE_OVERLAYS.map(({ key, label }) => tile(key, label, value === key, () => pick(key)))}
          </div>

          {own && (
            <>
              <p className="pf-design-head">Your designs</p>
              <div className="pf-design-grid" role="radiogroup" aria-label="Your designs">
                {own.map((d) => tile(
                  d.id,
                  d.name,
                  value === 'custom' && design?.id === d.id,
                  () => pick('custom', { id: d.id, layers: d.layers }),
                  d.layers,
                ))}
                <Link to="/seller/photo-designs/new" target="_blank" rel="noopener" className="pf-design-opt pf-design-make">
                  <span className="pf-design-photo"><Plus size={24} weight="bold" /></span>
                  <span className="pf-design-label">Make your own</span>
                </Link>
              </div>
            </>
          )}

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
