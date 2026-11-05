import { forwardRef, useImperativeHandle, useRef } from 'react';
import './live.css';

/*
 * Hearts floating up the right side of a live. Spawned straight into the
 * page, not through React state: a busy live sends many, and none of them
 * should make the video or the comments draw again. Each one only moves and
 * fades (transform and opacity, which the phone draws without the page),
 * and there are never more than MAX on screen.
 *
 *   const hearts = useRef();
 *   <HeartLayer ref={hearts} />
 *   hearts.current.burst(3);
 */
const MAX = 26;
const COLORS = ['#ff3d6e', '#ff6b9a', '#ff8a3d', '#ffc23d', '#ff4fd8', '#ff5d5d', '#9b7bff'];

const HeartLayer = forwardRef(function HeartLayer({ className = '' }, ref) {
  const box = useRef(null);

  useImperativeHandle(ref, () => ({
    burst(count = 1, { mine = false } = {}) {
      const el = box.current;
      if (!el) return;
      const n = Math.min(count, 8);
      for (let i = 0; i < n; i += 1) {
        if (el.childElementCount >= MAX) return;
        const heart = document.createElement('span');
        heart.className = `lv-heart${mine ? ' is-mine' : ''}`;
        heart.style.setProperty('--x', `${Math.round((Math.random() - 0.5) * 70)}px`);
        heart.style.setProperty('--r', `${Math.round((Math.random() - 0.5) * 50)}deg`);
        heart.style.setProperty('--s', (0.75 + Math.random() * 0.55).toFixed(2));
        heart.style.setProperty('--d', `${1700 + Math.round(Math.random() * 900)}ms`);
        heart.style.setProperty('--c', COLORS[Math.floor(Math.random() * COLORS.length)]);
        heart.style.animationDelay = `${i * 120}ms`;
        heart.addEventListener('animationend', () => heart.remove(), { once: true });
        el.appendChild(heart);
      }
    },
  }), []);

  return <div ref={box} className={`lv-hearts ${className}`} aria-hidden="true" />;
});

export default HeartLayer;
