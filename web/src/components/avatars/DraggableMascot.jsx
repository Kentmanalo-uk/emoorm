import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Mascot from './Mascot';

/**
 * The mascot, Moormy, that can be picked up: double-click (or double-tap)
 * and hold, and it hangs from the cursor wherever you carry it, swinging
 * like a little pendulum from where you took hold of it, legs dangling a
 * beat behind and arms up. Let go and it springs back home.
 *
 *   <DraggableMascot size={72} onHeld={(held) => ...} />
 *
 * While carried, a copy is drawn above the whole page (a portal, fixed) and
 * the one in the page waits unseen, keeping its place; when the copy is
 * home again they swap back. `onHeld(true/false)` tells the page, so it can
 * keep the spot open (the Messages tab keeps it risen).
 *
 * The motion is a small simulation run once a frame while it lasts: the
 * body is a damped pendulum hanging from the grip, pushed by how fast the
 * cursor speeds up sideways; the legs follow the body on a softer spring;
 * going home is a spring toward wherever home is now. Only the copy's
 * transform and a few angles change, so it stays smooth.
 */

const DOUBLE_MS = 400;
// The pendulum: stiffness (how quickly it swings back), damping, and how
// hard a sideways speed-up pushes it; the legs' looser spring.
const SWING_K = 90;
const SWING_C = 5.5;
const PUSH = 0.028;
// Air: moving steadily, the feet trail behind (degrees per px/s).
const DRAG = 0.014;
const LEG_K = 60;
const LEG_C = 7;
const MAX_TILT = 75;
// Home: a spring with a little bounce.
const HOME_K = 140;
const HOME_C = 17;

export default function DraggableMascot({
  size = 64, wave = true, className = '', onHeld,
}) {
  const homeRef = useRef(null);
  const copyRef = useRef(null);
  const lastDown = useRef(0);
  const sim = useRef(null);
  const [held, setHeld] = useState(false);
  const onHeldRef = useRef(onHeld);
  useEffect(() => { onHeldRef.current = onHeld; }, [onHeld]);

  // Writes the simulation onto the copy: where it is, its tilt round the
  // grip, and the legs', arms' and head's angles.
  const paint = (s) => {
    const el = copyRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) rotate(${s.tilt}deg)`;
    el.style.setProperty('--leg', `${s.leg}deg`);
    el.style.setProperty('--arm', `${s.arm}deg`);
    el.style.setProperty('--head', `${-s.tilt * 0.35}deg`);
  };

  const step = (now) => {
    const s = sim.current;
    if (!s) return;
    const dt = Math.min(0.033, (now - s.t) / 1000) || 0.016;
    s.t = now;

    if (s.mode === 'drag') {
      // The grip goes where the cursor is.
      const x = s.px - s.gx;
      const y = s.py - s.gy;
      // Smoothed: the pointer reports unevenly against the frames.
      const vx = s.vx + ((x - s.x) / dt - s.vx) * 0.35;
      const ax = (vx - s.vx) / dt;
      s.x = x;
      s.y = y;
      s.vx = vx;
      s.vy = 0;
      // Speeding up to the right leaves the feet behind, to the left: the
      // body turns clockwise about the grip (a positive turn on screen);
      // moving steadily, the air holds them trailing.
      const rest = Math.max(-60, Math.min(60, vx * DRAG));
      s.tiltV += (-SWING_K * (s.tilt - rest) - SWING_C * s.tiltV + ax * PUSH) * dt;
    } else {
      // Home, wherever it is now (the page may have moved it).
      const r = homeRef.current?.getBoundingClientRect();
      if (r) { s.hx = r.left; s.hy = r.top; }
      s.vx += (HOME_K * (s.hx - s.x) - HOME_C * s.vx) * dt;
      s.vy += (HOME_K * (s.hy - s.y) - HOME_C * s.vy) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.tiltV += (-SWING_K * s.tilt - SWING_C * 2 * s.tiltV) * dt;
    }
    s.tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, s.tilt + s.tiltV * dt));
    // Legs (turned relative to the body): they try to keep hanging straight
    // down, so they turn against the body's tilt, and lag its swing.
    const legTarget = Math.max(-50, Math.min(50, -s.tilt * 0.7 - s.tiltV * 0.1));
    s.legV += (LEG_K * (legTarget - s.leg) - LEG_C * s.legV) * dt;
    s.leg += s.legV * dt;
    // Arms: up and out while carried ("wheee"), flung with the swing.
    const armTarget = s.mode === 'drag' ? 38 + Math.max(-20, Math.min(20, s.tiltV * 0.08)) : 150;
    s.arm += (armTarget - s.arm) * Math.min(1, dt * 10);
    paint(s);

    if (s.mode === 'home') {
      const still = Math.abs(s.hx - s.x) < 0.6 && Math.abs(s.hy - s.y) < 0.6
        && Math.hypot(s.vx, s.vy) < 12 && Math.abs(s.tilt) < 1.5 && Math.abs(s.tiltV) < 15;
      if (still) {
        sim.current = null;
        setHeld(false);
        onHeldRef.current?.(false);
        return;
      }
    }
    s.frame = requestAnimationFrame(step);
  };

  const onMove = (e) => {
    const s = sim.current;
    if (!s || s.mode !== 'drag') return;
    s.px = e.clientX;
    s.py = e.clientY;
  };

  const onUp = () => {
    const s = sim.current;
    if (!s || s.mode !== 'drag') return;
    s.mode = 'home';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.documentElement.classList.remove('is-carrying-mascot');
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    const now = performance.now();
    const second = now - lastDown.current < DOUBLE_MS;
    lastDown.current = second ? 0 : now;
    if (!second || sim.current) return;
    e.preventDefault();
    const r = homeRef.current.getBoundingClientRect();
    sim.current = {
      mode: 'drag',
      t: now,
      x: r.left,
      y: r.top,
      hx: r.left,
      hy: r.top,
      // Where it was taken hold of, inside it: the pendulum's pivot.
      gx: e.clientX - r.left,
      gy: e.clientY - r.top,
      px: e.clientX,
      py: e.clientY,
      vx: 0,
      vy: 0,
      tilt: 0,
      tiltV: 0,
      leg: 0,
      legV: 0,
      arm: 150,
    };
    setHeld(true);
    onHeldRef.current?.(true);
    document.documentElement.classList.add('is-carrying-mascot');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // The copy is on the page now: start the simulation on it.
  useEffect(() => {
    const s = sim.current;
    if (!held || !s) return undefined;
    copyRef.current.style.transformOrigin = `${s.gx}px ${s.gy}px`;
    paint(s);
    s.t = performance.now();
    s.frame = requestAnimationFrame(step);
    return undefined;
    // step and paint read refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held]);

  // Gone mid-carry (the page changed): stop everything.
  useEffect(() => () => {
    if (sim.current) cancelAnimationFrame(sim.current.frame);
    sim.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.documentElement.classList.remove('is-carrying-mascot');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <span
        ref={homeRef}
        className={`mascot-grab${held ? ' is-away' : ''}`}
        onPointerDown={onPointerDown}
        // A click on it is for it, not for whatever it sits on.
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
        title="Double-click and hold to pick me up"
      >
        <Mascot size={size} wave={wave} className={className} />
      </span>
      {held && createPortal(
        <div ref={copyRef} className="mascot-carried" aria-hidden="true">
          <Mascot size={size} className="is-held" />
        </div>,
        document.body,
      )}
    </>
  );
}
