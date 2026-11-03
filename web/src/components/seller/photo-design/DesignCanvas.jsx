import { useRef, useState } from 'react';
import { resolveImg } from '../../../lib/media';
import { DesignLayer } from '../../product/CustomOverlay';

const SNAP = 1.2;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** The size a corner drag scales, by kind of piece. */
const resized = (l, start, factor) => {
  if (l.type === 'text') return { size: clamp(start.size * factor, 2, 30) };
  if (l.type === 'logo') return { size: clamp(start.size * factor, 4, 70) };
  if (l.type === 'image') return { w: clamp(start.w * factor, 3, 100) };
  if (l.kind === 'circle') return { w: clamp(start.w * factor, 1, 200) };
  return {
    ...(l.span === 'x' ? {} : { w: clamp(start.w * factor, 1, 200) }),
    ...(l.span === 'y' ? {} : { h: clamp(start.h * factor, 1, 200) }),
  };
};

/**
 * The design on a photo, to work on: tap a piece to pick it, drag it to
 * move it (it snaps to the middle lines), the corner dot resizes it and the
 * top dot turns it. A tap on the photo itself lets go.
 *
 * `onChange(layers, { record })`: record is true for the first change of a
 * drag (the step Undo goes back to) and false while it goes on.
 */
export default function DesignCanvas({
  layers, store, selectedId, onSelect, onChange, photo, tall = false,
}) {
  const box = useRef(null);
  const drag = useRef(null);
  const [guides, setGuides] = useState({ x: false, y: false });

  const metrics = () => box.current.getBoundingClientRect();
  const layerById = (id) => layers.find((l) => l.id === id);
  const update = (id, patch, record) => onChange(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)), { record });

  const begin = (event, id, mode) => {
    event.stopPropagation();
    event.preventDefault();
    const l = layerById(id);
    if (!l) return;
    onSelect(id);
    const r = metrics();
    const cx = r.left + (l.x / 100) * r.width;
    const cy = r.top + (l.y / 100) * r.height;
    drag.current = {
      id,
      mode,
      started: false,
      px: event.clientX,
      py: event.clientY,
      start: { ...l },
      cx,
      cy,
      dist: Math.hypot(event.clientX - cx, event.clientY - cy) || 1,
      angle: Math.atan2(event.clientY - cy, event.clientX - cx),
    };
    // Moves keep coming here when the pointer leaves the photo.
    try {
      box.current.setPointerCapture?.(event.pointerId);
    } catch {
      /* not a live pointer */
    }
  };

  const move = (event) => {
    const d = drag.current;
    if (!d) return;
    const r = metrics();
    // A tap is not a drag: nothing changes until the pointer has moved.
    if (!d.started && Math.hypot(event.clientX - d.px, event.clientY - d.py) < 3) return;
    const record = !d.started;
    d.started = true;
    if (d.mode === 'move') {
      let x = clamp(d.start.x + ((event.clientX - d.px) / r.width) * 100, 0, 100);
      let y = clamp(d.start.y + ((event.clientY - d.py) / r.height) * 100, 0, 100);
      const gx = Math.abs(x - 50) < SNAP;
      const gy = Math.abs(y - 50) < SNAP;
      if (gx) x = 50;
      if (gy) y = 50;
      setGuides({ x: gx, y: gy });
      update(d.id, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }, record);
    } else if (d.mode === 'size') {
      const factor = Math.hypot(event.clientX - d.cx, event.clientY - d.cy) / d.dist;
      update(d.id, resized(d.start, d.start, factor), record);
    } else if (d.mode === 'turn') {
      let deg = d.start.rotate + ((Math.atan2(event.clientY - d.cy, event.clientX - d.cx) - d.angle) * 180) / Math.PI;
      deg = ((deg + 540) % 360) - 180;
      // Straight and square angles catch it.
      const near = [-180, -90, 0, 90, 180].find((a) => Math.abs(deg - a) < 4);
      update(d.id, { rotate: Math.round(near ?? deg) }, record);
    }
  };

  const end = () => {
    drag.current = null;
    setGuides({ x: false, y: false });
  };

  const handles = (l) => (
    <>
      <span className="pde-frame" aria-hidden="true" />
      <span
        className="pde-handle is-turn"
        role="presentation"
        title="Drag to turn"
        onPointerDown={(e) => begin(e, l.id, 'turn')}
      />
      <span
        className="pde-handle is-size"
        role="presentation"
        title="Drag to resize"
        onPointerDown={(e) => begin(e, l.id, 'size')}
      />
    </>
  );

  return (
    <div
      ref={box}
      className={`pde-canvas${tall ? ' is-tall' : ''}`}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerDown={() => onSelect(null)}
    >
      {photo ? <img className="pde-photo" src={resolveImg(photo) || photo} alt="" draggable="false" /> : <span className="pde-photo is-blank" />}
      <div className="iov pde-stage">
        {layers.map((l) => (
          <DesignLayer
            key={l.id}
            layer={l}
            store={store}
            selected={l.id === selectedId}
            onPointerDown={(e) => begin(e, l.id, 'move')}
          >
            {l.id === selectedId ? handles(l) : null}
          </DesignLayer>
        ))}
      </div>
      {guides.x && <span className="pde-guide is-x" aria-hidden="true" />}
      {guides.y && <span className="pde-guide is-y" aria-hidden="true" />}
      {!layers.length && <p className="pde-empty">Add text, your logo, a shape or a picture to start.</p>}
    </div>
  );
}

