import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Play, Pause, ArrowCounterClockwise, SkipBack, SkipForward, SpeakerHigh, SpeakerSlash, CornersOut, CornersIn, X,
} from '@phosphor-icons/react';
import TIMELINE from '../components/tutorial/timeline.json';
import { SCENES, PRELOAD } from '../components/tutorial/registry';
import useSeo from '../lib/seo';
import './SellerTutorial.css';

/*
 * /sell/tutorial: a three-minute presentation that shows local sellers what
 * E-MOORM is, what they can sell, how to start and how a listing reaches a
 * buyer. Scenes are drawn from the time (timeline.json); the soundtrack is
 * the clock, so music and sound effects stay in step through pause, seek
 * and replay. Without sound (blocked or muted) a plain timer takes over.
 */

const { length: LENGTH, chapters: CHAPTERS } = TIMELINE;
const CROSS = 0.45; // seconds two scenes overlap
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function useStageSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const portrait = size.w / size.h < 0.85;
  const W = portrait ? 1080 : 1920;
  const H = portrait ? 1920 : 1080;
  return { portrait, W, H, scale: Math.min(size.w / W, size.h / H) };
}

export default function SellerTutorial() {
  useSeo({ title: 'How to sell on E-MOORM', description: 'A three-minute guide for local sellers: what you can sell, how to start and how buyers find you.', path: '/sell/tutorial' });
  const navigate = useNavigate();
  const { portrait, W, H, scale } = useStageSize();
  // ?t=74 opens at that moment (a link to one part); ?still hides the controls.
  const [params] = useSearchParams();
  const linked = Math.max(0, Math.min(LENGTH, Number(params.get('t')) || 0));
  const still = params.has('still');
  const [t, setT] = useState(linked);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(linked > 0);
  const [muted, setMuted] = useState(false);
  const [loaded, setLoaded] = useState(0);
  const [idle, setIdle] = useState(false);
  const [full, setFull] = useState(false);
  const audio = useRef(null);
  const clock = useRef({ base: 0, at: 0, useAudio: true });
  const rootRef = useRef(null);
  const idleTimer = useRef(null);
  const calm = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);

  // Pictures and the soundtrack load before the first play.
  useEffect(() => {
    let n = 0;
    const imgs = PRELOAD.map((src) => {
      const img = new Image();
      img.onload = img.onerror = () => { n += 1; setLoaded(n / PRELOAD.length); };
      img.src = src;
      return img;
    });
    const a = new Audio('/tutorial/soundtrack.mp3');
    a.preload = 'auto';
    audio.current = a;
    return () => { a.pause(); a.src = ''; imgs.length = 0; };
  }, []);

  const now = useCallback(() => {
    const c = clock.current;
    const a = audio.current;
    if (c.useAudio && a && !a.paused) return a.currentTime;
    return c.base + (playing ? (performance.now() - c.at) / 1000 : 0);
  }, [playing]);

  // Still mode (?still): a recorder sets the time to film frame by frame.
  useEffect(() => {
    if (!still) return undefined;
    window.__tutorialSeek = (x) => setT(Math.max(0, Math.min(LENGTH, x)));
    return () => { delete window.__tutorialSeek; };
  }, [still]);

  // The frame loop while playing.
  useEffect(() => {
    if (!playing) return undefined;
    let raf;
    const tick = () => {
      const x = Math.min(LENGTH, now());
      setT(x);
      if (x >= LENGTH) {
        setPlaying(false);
        audio.current?.pause();
        clock.current.base = LENGTH;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, now]);

  const play = useCallback((from) => {
    const start = from ?? (t >= LENGTH ? 0 : t);
    const a = audio.current;
    clock.current = { base: start, at: performance.now(), useAudio: true };
    setT(start);
    setStarted(true);
    setPlaying(true);
    if (a) {
      a.currentTime = start;
      a.muted = muted;
      a.play().catch(() => { clock.current = { base: start, at: performance.now(), useAudio: false }; });
    }
  }, [t, muted]);

  const pause = useCallback(() => {
    const x = now();
    audio.current?.pause();
    clock.current = { base: x, at: performance.now(), useAudio: true };
    setT(x);
    setPlaying(false);
  }, [now]);

  const seek = useCallback((x) => {
    const to = Math.max(0, Math.min(LENGTH - 0.05, x));
    if (playing) play(to);
    else { clock.current.base = to; setT(to); if (audio.current) audio.current.currentTime = to; }
  }, [playing, play]);

  const chapterIndex = CHAPTERS.findIndex((c) => t >= c.start && t < c.end);
  const chapter = CHAPTERS[chapterIndex === -1 ? CHAPTERS.length - 1 : chapterIndex];
  const goChapter = (d) => {
    const i = chapterIndex === -1 ? CHAPTERS.length - 1 : chapterIndex;
    // Back within the first two seconds of a chapter goes to the one before.
    const target = d < 0 && t - CHAPTERS[i].start > 2 ? i : i + d;
    seek(CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, target))].start + 0.01);
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (audio.current) audio.current.muted = next;
  };

  const toggleFull = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await rootRef.current?.requestFullscreen?.();
    } catch { /* fullscreen not allowed here */ }
  };
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  // Keyboard: space / k play-pause, arrows chapters, m mute, f full screen.
  useEffect(() => {
    const on = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      // Space on a focused button presses that button instead.
      if (e.key === ' ' && e.target.closest('button')) return;
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); if (playing) pause(); else play(); }
      if (e.key === 'ArrowRight') goChapter(1);
      if (e.key === 'ArrowLeft') goChapter(-1);
      if (e.key === 'm') toggleMute();
      if (e.key === 'f') toggleFull();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // Controls fade while playing and the pointer rests.
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2600);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);

  // The scenes on screen now (two while one hands over to the next).
  const live = CHAPTERS.filter((c) => t >= c.start - CROSS && t < c.end + (c.key === 'cta' ? 1 : CROSS));
  const ended = t >= LENGTH - 0.05;
  const leaveTo = () => navigate('/sell');

  return (
    <div
      ref={rootRef}
      className={`st-root${idle && playing ? ' is-idle' : ''}${portrait ? ' is-portrait' : ''}${calm ? ' is-calm' : ''}`}
      onPointerMove={wake}
      onPointerDown={wake}
      role="region"
      aria-label="How to sell on E-MOORM, a three-minute presentation"
    >
      <div className="st-stage-wrap">
        <div className="st-stage" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
          {live.map((c) => {
            const Scene = SCENES[c.key];
            const local = t - c.start;
            const fadeIn = c.key === 'open' ? 1 : Math.min(1, Math.max(0, (local + CROSS) / CROSS));
            const fadeOut = c.key === 'cta' ? 1 : Math.min(1, Math.max(0, (c.end + CROSS - t) / CROSS));
            return (
              <div key={c.key} className="st-layer" style={{ opacity: Math.min(fadeIn, fadeOut) }} aria-hidden={c !== chapter}>
                <Scene t={Math.max(0, local)} P={portrait} onStart={() => navigate('/sell')} />
              </div>
            );
          })}
        </div>
      </div>

      <p className="st-sr" aria-live="polite">{started ? chapter.title : ''}</p>

      {!started && (
        <div className="st-poster">
          <div className="st-poster-inner">
            <img src="/brand-icon.png" alt="" className="st-poster-icon" />
            <p className="st-poster-kicker">For local sellers</p>
            <h1>How to sell on E-MOORM</h1>
            <p className="st-poster-sub">What you can sell, how to start, and how buyers find you. About 3 minutes, with sound.</p>
            <button type="button" className="st-poster-play" onClick={() => play(0)} disabled={loaded < 0.6}>
              <Play size={26} weight="fill" /> {loaded < 0.6 ? `Loading ${Math.round(loaded * 100)}%` : 'Play'}
            </button>
            <Link to="/sell" className="st-poster-skip">Skip tutorial</Link>
          </div>
        </div>
      )}

      {started && !still && (
        <>
          <Link to="/sell" className="st-skip" aria-label="Skip the tutorial"><X size={18} weight="bold" /> Skip tutorial</Link>
          <div className="st-controls" onPointerDown={(e) => e.stopPropagation()}>
            <div
              className="st-bar"
              role="slider"
              tabIndex={0}
              aria-label="Position"
              aria-valuemin={0}
              aria-valuemax={Math.round(LENGTH)}
              aria-valuenow={Math.round(t)}
              aria-valuetext={`${fmt(t)} of ${fmt(LENGTH)}, ${chapter.title}`}
              onPointerDown={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                seek(((e.clientX - r.left) / r.width) * LENGTH);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') { e.stopPropagation(); seek(t + 5); }
                if (e.key === 'ArrowLeft') { e.stopPropagation(); seek(t - 5); }
              }}
            >
              <span className="st-bar-fill" style={{ width: `${(t / LENGTH) * 100}%` }} />
              {CHAPTERS.slice(1).map((c) => <i key={c.key} style={{ left: `${(c.start / LENGTH) * 100}%` }} title={c.title} />)}
            </div>
            <div className="st-buttons">
              <button type="button" onClick={() => goChapter(-1)} aria-label="Previous part"><SkipBack size={20} weight="fill" /></button>
              {ended ? (
                <button type="button" className="st-main" onClick={() => play(0)} aria-label="Replay"><ArrowCounterClockwise size={22} weight="bold" /></button>
              ) : (
                <button type="button" className="st-main" onClick={() => (playing ? pause() : play())} aria-label={playing ? 'Pause' : 'Play'}>
                  {playing ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}
                </button>
              )}
              <button type="button" onClick={() => goChapter(1)} aria-label="Next part"><SkipForward size={20} weight="fill" /></button>
              <span className="st-time">{fmt(t)} / {fmt(LENGTH)}</span>
              <span className="st-chapter">{chapter.title}</span>
              <span className="st-spacer" />
              {ended && <button type="button" className="st-text-btn" onClick={leaveTo}>Start selling</button>}
              <button type="button" onClick={toggleMute} aria-label={muted ? 'Turn sound on' : 'Mute'}>{muted ? <SpeakerSlash size={20} weight="fill" /> : <SpeakerHigh size={20} weight="fill" />}</button>
              {document.fullscreenEnabled && (
                <button type="button" onClick={toggleFull} aria-label={full ? 'Exit full screen' : 'Full screen'}>{full ? <CornersIn size={20} /> : <CornersOut size={20} />}</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
