import {
  ArrowDown, ArrowUp, Copy, Trash, UploadSimple,
} from '../../../lib/icons';
import { brandColor } from '../../../lib/imageOverlays';
import { MAX_TEXT, WEIGHTS } from '../../../lib/photoDesign';

const SWATCHES = ['#ffffff', '#111827', '#055d07', '#22c55e', '#ec4899', '#ffc400', '#ef4444', '#2563eb', '#f97316', '#7c3aed'];

/** A colour: the shop's own first, a few more, any other, and None where it can be off. */
export function ColorField({
  label, value, onChange, store, allowNone = false,
}) {
  const brand = brandColor(store).toLowerCase();
  const list = [brand, ...SWATCHES.filter((c) => c !== brand)];
  return (
    <div className="pde-field">
      <span className="pde-label">{label}</span>
      <div className="pde-swatches" role="radiogroup" aria-label={label}>
        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={!value}
            className={`pde-swatch is-none${!value ? ' is-on' : ''}`}
            onClick={() => onChange(null)}
            title="None"
            aria-label="None"
          />
        )}
        {list.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            className={`pde-swatch${value === c ? ' is-on' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c === brand ? 'Your shop colour' : c}
            aria-label={c === brand ? 'Your shop colour' : c}
          />
        ))}
        <label className="pde-swatch is-custom" title="Any colour">
          <input type="color" value={value || '#ffffff'} onChange={(e) => onChange(e.target.value.toLowerCase())} aria-label={`${label}: any colour`} />
        </label>
      </div>
    </div>
  );
}

function Slider({
  label, value, min, max, step = 1, unit = '', onChange, onCommit,
}) {
  return (
    <label className="pde-field pde-slider">
      <span className="pde-label">
        {label}
        <em>{`${Math.round(value * 10) / 10}${unit}`}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onCommit}
        onKeyDown={onCommit}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="pde-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Chips({
  label, value, options, onChange,
}) {
  return (
    <div className="pde-field">
      <span className="pde-label">{label}</span>
      <div className="pde-chips" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={`pde-chip${value === o.value ? ' is-on' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const TITLES = {
  text: 'Text', logo: 'Your logo', shape: 'Shape', image: 'Picture',
};

/**
 * The picked piece's settings. `set(patch)` changes it (each change its own
 * Undo step, a slider's drag one step: `mark()` is called as it starts).
 */
export default function DesignInspector({
  layer: l, store, set, mark, onForward, onBack, onDuplicate, onDelete, onReplaceImage, canAdd,
}) {
  if (!l) {
    return (
      <div className="pde-inspector is-empty">
        <p>Tap a piece on the photo to change it, or add one above.</p>
      </div>
    );
  }
  // A slider's or colour's change: one Undo step per drag or pick.
  const live = (patch) => set(patch, { record: false });
  const step = (patch) => set(patch, { record: true });
  const title = l.type === 'text' && l.bind === 'name' ? 'Shop name' : TITLES[l.type];

  return (
    <div className="pde-inspector">
      <div className="pde-inspector-head">
        <strong>{title}</strong>
        <div className="pde-inspector-actions">
          <button type="button" onClick={onForward} title="Bring forward" aria-label="Bring forward"><ArrowUp size={16} /></button>
          <button type="button" onClick={onBack} title="Send back" aria-label="Send back"><ArrowDown size={16} /></button>
          <button type="button" onClick={onDuplicate} disabled={!canAdd} title="Duplicate" aria-label="Duplicate"><Copy size={16} /></button>
          <button type="button" className="is-danger" onClick={onDelete} title="Delete" aria-label="Delete"><Trash size={16} /></button>
        </div>
      </div>

      {l.type === 'text' && (
        <>
          {l.bind === 'name' ? (
            <p className="pde-note">Shows your shop&apos;s name, and changes by itself if you rename the shop.</p>
          ) : (
            <label className="pde-field">
              <span className="pde-label">Words<em>{`${l.text.length}/${MAX_TEXT}`}</em></span>
              <input
                type="text"
                className="pde-input"
                value={l.text}
                maxLength={MAX_TEXT}
                onFocus={(e) => { mark(); e.target.select(); }}
                onChange={(e) => live({ text: e.target.value })}
                placeholder="Your text"
              />
            </label>
          )}
          <Slider label="Size" value={l.size} min={2} max={30} step={0.5} onCommit={mark} onChange={(v) => live({ size: v })} />
          <Chips label="Thickness" value={l.weight} options={WEIGHTS} onChange={(v) => step({ weight: v })} />
          <ColorField label="Text colour" value={l.color} store={store} onChange={(v) => step({ color: v })} />
          <ColorField label="Background" value={l.bg} store={store} allowNone onChange={(v) => step({ bg: v })} />
          {l.bg && (
            <>
              <Slider label="Background see-through" value={Math.round((1 - l.bgOpacity) * 100)} min={0} max={100} unit="%" onCommit={mark} onChange={(v) => live({ bgOpacity: 1 - v / 100 })} />
              <Slider label="Round corners" value={l.radius} min={0} max={20} step={0.5} onCommit={mark} onChange={(v) => live({ radius: v })} />
            </>
          )}
          <Toggle label="ALL CAPITALS" checked={l.upper} onChange={(v) => step({ upper: v })} />
        </>
      )}

      {l.type === 'logo' && (
        <>
          {!store?.logo && <p className="pde-note">Your shop has no logo yet, so its initials show. Add one in My Shop.</p>}
          <Slider label="Size" value={l.size} min={4} max={70} step={0.5} onCommit={mark} onChange={(v) => live({ size: v })} />
          <Chips
            label="Shape"
            value={l.frame}
            options={[{ value: 'circle', label: 'Circle' }, { value: 'rounded', label: 'Rounded' }, { value: 'none', label: 'As it is' }]}
            onChange={(v) => step({ frame: v })}
          />
          <ColorField label="Ring" value={l.ring} store={store} allowNone onChange={(v) => step({ ring: v, ringW: v && !l.ringW ? 1 : l.ringW })} />
          {l.ring && <Slider label="Ring thickness" value={l.ringW} min={0} max={5} step={0.1} onCommit={mark} onChange={(v) => live({ ringW: v })} />}
        </>
      )}

      {l.type === 'shape' && (
        <>
          <Chips
            label="Kind"
            value={l.kind}
            options={[{ value: 'rect', label: 'Rectangle' }, { value: 'circle', label: 'Circle' }]}
            onChange={(v) => step({ kind: v, span: v === 'circle' ? null : l.span })}
          />
          {l.kind === 'rect' && (
            <Chips
              label="Stretch"
              value={l.span}
              options={[{ value: null, label: 'None' }, { value: 'x', label: 'Full width' }, { value: 'y', label: 'Full height' }]}
              onChange={(v) => step({ span: v, ...(v === 'x' ? { x: 50 } : {}), ...(v === 'y' ? { y: 50 } : {}) })}
            />
          )}
          {(l.kind === 'circle' || l.span !== 'x') && (
            <Slider label={l.kind === 'circle' ? 'Size' : 'Width'} value={l.w} min={1} max={200} step={0.5} onCommit={mark} onChange={(v) => live({ w: v })} />
          )}
          {l.kind === 'rect' && l.span !== 'y' && (
            <Slider label="Height" value={l.h} min={1} max={200} step={0.5} onCommit={mark} onChange={(v) => live({ h: v })} />
          )}
          <ColorField label="Fill" value={l.color} store={store} allowNone onChange={(v) => step({ color: v })} />
          {l.kind === 'rect' && (
            <Slider label="Round corners" value={l.radius} min={0} max={100} step={0.5} onCommit={mark} onChange={(v) => live({ radius: v })} />
          )}
          <ColorField label="Border" value={l.border} store={store} allowNone onChange={(v) => step({ border: v, borderW: v && !l.borderW ? 1 : l.borderW })} />
          {l.border && <Slider label="Border thickness" value={l.borderW} min={0} max={10} step={0.1} onCommit={mark} onChange={(v) => live({ borderW: v })} />}
        </>
      )}

      {l.type === 'image' && (
        <>
          <button type="button" className="pde-btn" onClick={onReplaceImage}>
            <UploadSimple size={16} /> Replace picture
          </button>
          <Slider label="Size" value={l.w} min={3} max={100} step={0.5} onCommit={mark} onChange={(v) => live({ w: v })} />
          <Slider label="Round corners" value={l.radius} min={0} max={50} step={0.5} onCommit={mark} onChange={(v) => live({ radius: v })} />
        </>
      )}

      <Slider label="Turn" value={l.rotate} min={-180} max={180} unit="°" onCommit={mark} onChange={(v) => live({ rotate: v })} />
      <Slider label="See-through" value={Math.round((1 - l.opacity) * 100)} min={0} max={90} unit="%" onCommit={mark} onChange={(v) => live({ opacity: 1 - v / 100 })} />
      <Toggle label="Shadow" checked={l.shadow} onChange={(v) => step({ shadow: v })} />
    </div>
  );
}
