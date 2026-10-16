import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleNotch, Eraser, PaintBrush, X } from '@phosphor-icons/react';

/*
 * Touch up the cutout: the front photo with what was found as the object
 * shown bright and the rest dimmed. Paint to add to the object, Erase to
 * take away. Done makes the 3D model again from this outline.
 */

const MASK_EDGE = 512;
const SIZES = [
  { key: 's', label: 'Small', r: 6 },
  { key: 'm', label: 'Medium', r: 14 },
  { key: 'l', label: 'Large', r: 28 },
];

export default function Model3dTouchUp({ photo, mask, onDone }) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [mode, setMode] = useState('add');
  const [size, setSize] = useState('m');
  const data = useRef(null);
  const dims = useRef(null);
  const original = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const frame = useRef(0);
  const [changed, setChanged] = useState(false);

  // The photo at the mask's size, once.
  useEffect(() => {
    let gone = false;
    Promise.resolve(photo).then((p) => {
      if (gone || !p) return;
      const scale = Math.min(1, MASK_EDGE / Math.max(p.width, p.height));
      const w = mask?.width || Math.max(1, Math.round(p.width * scale));
      const h = mask?.height || Math.max(1, Math.round(p.height * scale));
      const full = document.createElement('canvas');
      full.width = p.width;
      full.height = p.height;
      full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
      const small = document.createElement('canvas');
      small.width = w;
      small.height = h;
      const ctx = small.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(full, 0, 0, w, h);
      dims.current = { w, h };
      data.current = mask ? new Uint8Array(mask.data) : new Uint8Array(w * h);
      original.current = data.current.slice();
      setImg({ pixels: ctx.getImageData(0, 0, w, h), w, h });
    });
    return () => { gone = true; };
  }, [photo, mask]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    const { w, h } = img;
    const out = new ImageData(new Uint8ClampedArray(img.pixels.data), w, h);
    const m = data.current;
    for (let i = 0; i < w * h; i += 1) {
      if (m[i]) continue;
      // Not the object: dimmed and tinted.
      out.data[i * 4] = out.data[i * 4] * 0.35 + 20;
      out.data[i * 4 + 1] = out.data[i * 4 + 1] * 0.35 + 20;
      out.data[i * 4 + 2] = out.data[i * 4 + 2] * 0.35 + 30;
    }
    canvas.getContext('2d').putImageData(out, 0, 0);
  };

  useEffect(() => { draw(); });

  // Esc cancels; the page behind doesn't scroll.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onDone(null); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onDone]);

  // A stroke: discs along the line from the last point, so a quick swipe
  // leaves no gaps between the points the pointer reported.
  const paintAt = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !dims.current) return;
    const rect = canvas.getBoundingClientRect();
    const { w, h } = dims.current;
    const x = ((e.clientX - rect.left) / rect.width) * w;
    const y = ((e.clientY - rect.top) / rect.height) * h;
    const r = (SIZES.find((s) => s.key === size)?.r || 14) * (Math.max(w, h) / MASK_EDGE);
    const v = mode === 'add' ? 1 : 0;
    const m = data.current;
    const dab = (cx, cy) => {
      for (let yy = Math.max(0, Math.floor(cy - r)); yy <= Math.min(h - 1, Math.ceil(cy + r)); yy += 1) {
        for (let xx = Math.max(0, Math.floor(cx - r)); xx <= Math.min(w - 1, Math.ceil(cx + r)); xx += 1) {
          if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 <= r * r) m[yy * w + xx] = v;
        }
      }
    };
    const from = last.current || { x, y };
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / Math.max(1, r * 0.4)));
    for (let s = 1; s <= steps; s += 1) dab(from.x + ((x - from.x) * s) / steps, from.y + ((y - from.y) * s) / steps);
    last.current = { x, y };
    if (!changed) setChanged(true);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  };

  const done = () => {
    const { w, h } = dims.current;
    onDone({ width: w, height: h, data: data.current.slice() });
  };

  return createPortal(
    <div className="m3d-touch" role="dialog" aria-modal="true" aria-label="Touch up the cutout">
      <div className="m3d-touch-backdrop" onClick={() => onDone(null)} aria-hidden="true" />
      <div className="m3d-touch-panel">
        <header className="m3d-touch-head">
          <div>
            <strong>Touch up the cutout</strong>
            <small>Bright is the object. Paint to add to it, erase to take away.</small>
          </div>
          <button type="button" className="m3d-touch-close" onClick={() => onDone(null)} aria-label="Close without changes">
            <X size={20} weight="bold" />
          </button>
        </header>
        <div className="m3d-touch-stage">
          {img ? (
            <canvas
              ref={canvasRef}
              width={img.w}
              height={img.h}
              className="m3d-touch-canvas"
              onPointerDown={(e) => { drawing.current = true; last.current = null; e.currentTarget.setPointerCapture?.(e.pointerId); paintAt(e); }}
              onPointerMove={(e) => { if (drawing.current) paintAt(e); }}
              onPointerUp={() => { drawing.current = false; last.current = null; }}
              onPointerCancel={() => { drawing.current = false; last.current = null; }}
            />
          ) : (
            <div className="m3d-stage-empty"><CircleNotch size={26} className="m3d-spin" aria-hidden="true" /> Opening the photo…</div>
          )}
        </div>
        <div className="m3d-touch-tools">
          <div className="m3d-seg" role="radiogroup" aria-label="Brush">
            <button type="button" role="radio" aria-checked={mode === 'add'} className={`m3d-seg-btn${mode === 'add' ? ' is-on' : ''}`} onClick={() => setMode('add')}>
              <PaintBrush size={16} /> Paint
            </button>
            <button type="button" role="radio" aria-checked={mode === 'erase'} className={`m3d-seg-btn${mode === 'erase' ? ' is-on' : ''}`} onClick={() => setMode('erase')}>
              <Eraser size={16} /> Erase
            </button>
          </div>
          <div className="m3d-seg" role="radiogroup" aria-label="Brush size">
            {SIZES.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={size === s.key} className={`m3d-seg-btn${size === s.key ? ' is-on' : ''}`} onClick={() => setSize(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="m3d-touch-actions">
          <button
            type="button"
            className="pf-btn pf-btn--ghost"
            disabled={!changed}
            onClick={() => { data.current = original.current.slice(); setChanged(false); draw(); }}
          >
            Start over
          </button>
          <button type="button" className="pf-btn pf-btn--primary" onClick={done} disabled={!img}>
            Make 3D from this
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
