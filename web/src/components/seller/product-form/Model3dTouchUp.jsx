import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowCounterClockwise, BoundingBox, CircleNotch, Eraser, HandTap, MinusCircle, PaintBrush, PlusCircle, X,
} from '@phosphor-icons/react';
import useFocusTrap from '../../../hooks/useFocusTrap';

/*
 * Fix the cutout: the photo with what is picked as the object bright, the
 * rest dimmed and a clear outline round it. The quick ways:
 *  - Add: tap the object (or a part that's missing): that whole region
 *    becomes object and the cut is made again round it;
 *  - Remove: tap what isn't the object;
 *  - Draw around: drag a box round the object; everything outside it is
 *    background.
 * The brush is the last resort, for a stubborn bit. Undo steps back.
 * The cut runs in a worker that keeps the photo prepared, so a tap comes
 * back in a fraction of a second. Done makes the 3D model from this mask.
 */

const loadGenerator = () => import('../../../lib/model3d/generate/index.js');
const MASK_EDGE = 512;
const BRUSH = [
  { key: 's', label: 'S', aria: 'Small brush', r: 5 },
  { key: 'm', label: 'M', aria: 'Medium brush', r: 12 },
  { key: 'l', label: 'L', aria: 'Large brush', r: 24 },
];

// One line for the tool in hand.
const HINTS = {
  add: 'Tap the object.',
  remove: 'Tap what isn\'t the object.',
  box: 'Drag a box around it.',
  brush: 'Paint over the wrong bit.',
};

/**
 * @param {Promise|object} photo - decodePhoto() result (or a promise of it)
 * @param {object} [mask] - the cutout found so far ({ width, height, data })
 * @param {String} title - which photo ('front', 'side', 'back')
 * @param {Function} onDone - (mask | null)
 */
export default function Model3dTouchUp({
  photo, mask, title = 'front', onDone,
}) {
  const canvasRef = useRef(null);
  const [img, setImg] = useState(null);
  const [tool, setTool] = useState('add');
  const [brushAdd, setBrushAdd] = useState(true);
  const [size, setSize] = useState('m');
  const [status, setStatus] = useState('opening'); // opening | ready | updating
  const [error, setError] = useState('');
  // What the buttons need, refreshed with each redraw (not read from refs while rendering).
  const [snap, setSnap] = useState({ canUndo: false, hasMask: false, hasAuto: false });
  const session = useRef(null);
  const current = useRef(null); // { mask, hints }
  const history = useRef([]);
  const autoMask = useRef(null);
  const drag = useRef(null);
  const frame = useRef(0);

  const redraw = () => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => setSnap({
      canUndo: history.current.length > 0,
      hasMask: !!current.current?.mask.some((v) => v),
      hasAuto: !!autoMask.current,
      n: Date.now(),
    }));
  };

  // The photo at the cutout's size, the first mask, and the session.
  useEffect(() => {
    let gone = false;
    let s = null;
    (async () => {
      const p = await Promise.resolve(photo);
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
      current.current = { mask: mask ? Uint8Array.from(mask.data) : new Uint8Array(w * h), hints: { taps: [], box: null, overrides: null } };
      setImg({ pixels: ctx.getImageData(0, 0, w, h), w, h });
      const m = await loadGenerator();
      if (gone) return;
      s = m.openCutout(p);
      session.current = s;
      try {
        const r = await s.ready;
        if (gone) return;
        autoMask.current = r.mask.data;
        // Without a cutout yet (the photo failed), start from the automatic one.
        if (!mask && r.mask.width === w && r.mask.height === h) current.current.mask = Uint8Array.from(r.mask.data);
        setStatus('ready');
        redraw();
      } catch (err) {
        if (gone || err.code === 'cancelled') return;
        // Nothing found automatically: the seller can still tap, box or paint.
        setStatus('ready');
        setError(err.message);
      }
    })();
    return () => {
      gone = true;
      s?.close();
      cancelAnimationFrame(frame.current);
    };
  }, [photo, mask]);

  // Esc cancels (the trap); the page behind doesn't scroll.
  const trapRef = useFocusTrap(true, { onClose: () => onDone(null) });
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);

  // Draw: the photo, the background dimmed, the outline, taps and the box.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !current.current) return;
    const { w, h } = img;
    const m = current.current.mask;
    const out = new ImageData(new Uint8ClampedArray(img.pixels.data), w, h);
    const d = out.data;
    for (let i = 0; i < w * h; i += 1) {
      const x = i % w;
      if (m[i]) {
        const edge = x === 0 || x === w - 1 || i < w || i >= w * (h - 1) || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w];
        if (edge) { d[i * 4] = 34; d[i * 4 + 1] = 230; d[i * 4 + 2] = 120; }
        continue;
      }
      // A thin dark ring outside the outline, so it reads on light photos too.
      const ring = (x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || (i >= w && m[i - w]) || (i + w < w * h && m[i + w]);
      if (ring) { d[i * 4] = 6; d[i * 4 + 1] = 70; d[i * 4 + 2] = 40; continue; }
      d[i * 4] = d[i * 4] * 0.32 + 18;
      d[i * 4 + 1] = d[i * 4 + 1] * 0.32 + 18;
      d[i * 4 + 2] = d[i * 4 + 2] * 0.32 + 26;
    }
    const ctx = canvas.getContext('2d');
    ctx.putImageData(out, 0, 0);
    const { taps, box } = current.current.hints;
    const sc = Math.max(w, h) / 400;
    for (const t of taps) {
      ctx.beginPath();
      ctx.arc(t.x * w, t.y * h, 7 * sc, 0, Math.PI * 2);
      ctx.fillStyle = t.kind === 'remove' ? '#dc2626' : '#16a34a';
      ctx.fill();
      ctx.lineWidth = 2 * sc;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(t.x * w - 3.5 * sc, t.y * h); ctx.lineTo(t.x * w + 3.5 * sc, t.y * h);
      if (t.kind !== 'remove') { ctx.moveTo(t.x * w, t.y * h - 3.5 * sc); ctx.lineTo(t.x * w, t.y * h + 3.5 * sc); }
      ctx.stroke();
    }
    const b = drag.current?.box || box;
    if (b) {
      ctx.setLineDash([6 * sc, 4 * sc]);
      ctx.lineWidth = 2 * sc;
      ctx.strokeStyle = '#fbbf24';
      ctx.strokeRect(b.x0 * w, b.y0 * h, (b.x1 - b.x0) * w, (b.y1 - b.y0) * h);
      ctx.setLineDash([]);
    }
  });

  const pointAt = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  /** Re-cut with new hints; each result is kept for Undo. */
  const recut = async (hints) => {
    const s = session.current;
    if (!s) return;
    history.current.push(current.current);
    current.current = { mask: current.current.mask, hints };
    setStatus('updating');
    setError('');
    redraw();
    try {
      await s.ready.catch(() => null);
      const r = await s.refine(hints);
      if (current.current.hints !== hints) return; // a newer change won
      current.current = { mask: Uint8Array.from(r.mask.data), hints };
    } catch (err) {
      if (err.code === 'cancelled') return;
      // Keep what was there and say why.
      current.current = history.current.pop() || current.current;
      setError(err.message || 'Didn\'t work. Tap again.');
    } finally {
      setStatus('ready');
      redraw();
    }
  };

  // Brush strokes: straight onto the mask and into the overrides.
  const paintStroke = (from, to) => {
    const { w, h } = img;
    const cur = current.current;
    const over = cur.hints.overrides;
    const r = (BRUSH.find((b) => b.key === size)?.r || 12) * (Math.max(w, h) / MASK_EDGE);
    const v = brushAdd ? 1 : 0;
    const dab = (cx, cy) => {
      for (let yy = Math.max(0, Math.floor(cy - r)); yy <= Math.min(h - 1, Math.ceil(cy + r)); yy += 1) {
        for (let xx = Math.max(0, Math.floor(cx - r)); xx <= Math.min(w - 1, Math.ceil(cx + r)); xx += 1) {
          if ((xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2 > r * r) continue;
          cur.mask[yy * w + xx] = v;
          over[yy * w + xx] = v ? 1 : 2;
        }
      }
    };
    const ax = from.x * w; const ay = from.y * h; const bx = to.x * w; const by = to.y * h;
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, r * 0.4)));
    for (let k = 1; k <= steps; k += 1) dab(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps);
    redraw();
  };

  const onDown = (e) => {
    if (!img || status === 'opening') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = pointAt(e);
    drag.current = { start: p, last: p, moved: false, box: null };
    if (tool === 'brush') {
      // A stroke is one Undo step.
      const cur = current.current;
      history.current.push({ mask: cur.mask.slice(), hints: { ...cur.hints, overrides: cur.hints.overrides ? cur.hints.overrides.slice() : null } });
      if (!cur.hints.overrides) cur.hints = { ...cur.hints, overrides: new Uint8Array(img.w * img.h) };
      cur.mask = cur.mask.slice();
      paintStroke(p, p);
    }
  };
  const onMove = (e) => {
    const dg = drag.current;
    if (!dg) return;
    const p = pointAt(e);
    if (Math.hypot(p.x - dg.start.x, p.y - dg.start.y) > 0.015) dg.moved = true;
    if (tool === 'brush') paintStroke(dg.last, p);
    else if (tool === 'box' && dg.moved) {
      dg.box = {
        x0: Math.min(dg.start.x, p.x), y0: Math.min(dg.start.y, p.y), x1: Math.max(dg.start.x, p.x), y1: Math.max(dg.start.y, p.y),
      };
      redraw();
    }
    dg.last = p;
  };
  const onUp = () => {
    const dg = drag.current;
    drag.current = null;
    if (!dg || tool === 'brush') { redraw(); return; }
    const cur = current.current.hints;
    if (tool === 'box') {
      const b = dg.box;
      if (!b || (b.x1 - b.x0) < 0.05 || (b.y1 - b.y0) < 0.05) { redraw(); return; }
      // Taps inside the new box still count.
      const taps = cur.taps.filter((t) => t.x >= b.x0 && t.x <= b.x1 && t.y >= b.y0 && t.y <= b.y1);
      recut({ taps, box: b, overrides: cur.overrides });
      setTool('add');
      return;
    }
    if (dg.moved) { redraw(); return; }
    recut({ ...cur, taps: [...cur.taps, { x: dg.start.x, y: dg.start.y, kind: tool === 'remove' ? 'remove' : 'add' }] });
  };

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    current.current = prev;
    setError('');
    redraw();
  };
  const startOver = () => {
    if (!autoMask.current) return;
    history.current.push(current.current);
    current.current = { mask: Uint8Array.from(autoMask.current), hints: { taps: [], box: null, overrides: null } };
    setError('');
    redraw();
  };
  const done = () => {
    const { w, h } = img;
    onDone({ width: w, height: h, data: current.current.mask.slice() });
  };

  const tools = [
    { key: 'add', label: 'Add', aria: 'Add: tap the object', icon: PlusCircle },
    { key: 'remove', label: 'Remove', aria: 'Remove: tap what isn\'t the object', icon: MinusCircle },
    { key: 'box', label: 'Draw', aria: 'Draw around the object', icon: BoundingBox },
  ];

  return createPortal(
    <div className="m3d-touch" ref={trapRef} role="dialog" aria-modal="true" aria-label="Fix the cutout: the bright part, outlined in green, becomes the 3D model">
      <div className="m3d-touch-backdrop" onClick={() => onDone(null)} aria-hidden="true" />
      <div className="m3d-touch-panel">
        <header className="m3d-touch-head">
          <strong>Fix cutout{title !== 'front' ? ` · ${title}` : ''}</strong>
          <button type="button" className="m3d-touch-close" onClick={() => onDone(null)} aria-label="Close without changes">
            <X size={20} weight="bold" />
          </button>
        </header>

        <div className="m3d-touch-tools m3d-touch-tools--main" role="toolbar" aria-label="Fix the cutout">
          {tools.map(({
            key, label, aria, icon: Icon,
          }) => (
            <button
              key={key}
              type="button"
              aria-label={aria}
              aria-pressed={tool === key}
              className={`m3d-tool${tool === key ? ' is-on' : ''}`}
              onClick={() => setTool(key)}
            >
              <Icon size={20} weight={tool === key ? 'fill' : 'regular'} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
          <button type="button" className="m3d-tool" onClick={undo} disabled={!snap.canUndo || status === 'updating'} aria-label="Undo the last change">
            <ArrowCounterClockwise size={20} aria-hidden="true" />
            <span>Undo</span>
          </button>
        </div>

        <p className={`m3d-touch-hint${error ? ' is-error' : ''}`} aria-live="polite">
          {error || (status === 'opening' ? 'Getting ready…' : HINTS[tool])}
        </p>

        <div className="m3d-touch-stage">
          {img ? (
            <canvas
              ref={canvasRef}
              width={img.w}
              height={img.h}
              className={`m3d-touch-canvas is-${tool}`}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => { drag.current = null; redraw(); }}
            />
          ) : (
            <div className="m3d-stage-empty"><CircleNotch size={26} className="m3d-spin" aria-hidden="true" /> Opening the photo…</div>
          )}
          {(status === 'updating' || status === 'opening') && img && (
            <span className="m3d-stage-busy m3d-touch-busy">
              <CircleNotch size={16} className="m3d-spin" aria-label={status === 'opening' ? 'Getting ready' : 'Updating'} />
            </span>
          )}
        </div>

        <div className="m3d-touch-tools">
          <button
            type="button"
            aria-pressed={tool === 'brush'}
            className={`m3d-seg-btn${tool === 'brush' ? ' is-on' : ''}`}
            onClick={() => setTool(tool === 'brush' ? 'add' : 'brush')}
          >
            <PaintBrush size={15} aria-hidden="true" /> Brush
          </button>
          {tool === 'brush' && (
            <>
              <div className="m3d-seg" role="radiogroup" aria-label="Brush paints">
                <button type="button" role="radio" aria-checked={brushAdd} aria-label="Paint object" className={`m3d-seg-btn${brushAdd ? ' is-on' : ''}`} onClick={() => setBrushAdd(true)}>
                  <HandTap size={15} aria-hidden="true" /> Add
                </button>
                <button type="button" role="radio" aria-checked={!brushAdd} aria-label="Paint background" className={`m3d-seg-btn${!brushAdd ? ' is-on' : ''}`} onClick={() => setBrushAdd(false)}>
                  <Eraser size={15} aria-hidden="true" /> Erase
                </button>
              </div>
              <div className="m3d-seg" role="radiogroup" aria-label="Brush size">
                {BRUSH.map((b) => (
                  <button key={b.key} type="button" role="radio" aria-checked={size === b.key} aria-label={b.aria} className={`m3d-seg-btn${size === b.key ? ' is-on' : ''}`} onClick={() => setSize(b.key)}>
                    {b.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="m3d-touch-actions">
          <button type="button" className="pf-btn pf-btn--ghost" onClick={startOver} disabled={!snap.hasAuto || status !== 'ready'}>
            Start over
          </button>
          <button type="button" className="pf-btn pf-btn--primary" onClick={done} disabled={!img || !snap.hasMask || status === 'updating'}>
            Use this
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
