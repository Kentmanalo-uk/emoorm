import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, {
  Circle, G, Path, Rect,
} from 'react-native-svg';
import { t } from '../../theme';
import MascotRig, { RIG_GROUND } from '../avatars/MascotRig';
import {
  EASE_IN_OUT, frames, useLoop, useReducedMotion,
} from '../sell/motion';
import {
  AdminFace, AskBubble, BigStar, Bell, Bowl, BoxBack, BoxFront, Brush, Bubble, Bulb, Camera,
  CampaignBoard, ChartBoard, Clipboard, ClosedSign, Coin, Dab, Easel, Flash, Gear, Handset,
  InfoCard, ListCard, OpenSign, Parcel, Pencil, Phone, Piggy, Pointer, Poster, ReturnRing,
  ReviewCard, Spoon, Stall, Stand, StarOutline, Tick, Tomato, Truck, Magnifier, Wrench,
} from './guideProps';

/*
 * The picture on the Seller Center's first-visit sheets: a little scene of
 * the mascot (avatars/MascotRig) doing what the page is for. It packs a
 * parcel on Products, photographs a product on Add a product, eats on
 * Today's menu, ticks orders off on Orders, investigates floating cards
 * with a magnifying glass on Ask Moormy, pins a poster and celebrates
 * on Marketing, reads a review while the stars fill on Reviews -- each with
 * its own pose (sitting, standing, kneeling), face, props and timing, so
 * the page reads from the picture alone.
 *
 * <SellerGuideMascot name="orders" width={280} />
 * name: the page's scene (SellerPhoneGuide's `art`). Decorative.
 *
 * A scene is data (SCENES): the mascot's pose on one clock, the things
 * behind and in front of it, each with its own moves on the same clock, and
 * what rises round it. Flat shapes only (no blur); every movement is a
 * native-driver loop, and it all holds still when the phone asks for
 * reduced motion.
 */

// The scene is drawn on a 280 x 168 grid; the shelf's top is at y 118. The
// mascot is 108 wide on it (0.9 of a grid unit per unit of its drawing).
const VW = 280;
const VH = 168;
// Headroom above the grid, for the standing mascot's cap and a closer camera.
const PAD = 16;
const SHELF = 118;
const RIG = 108;

const ease = { easing: EASE_IN_OUT };
const deg = { easing: EASE_IN_OUT, unit: 'deg' };
const first = (v) => (typeof v === 'number' ? v : v[0][1]);
const tr = (c, v, opts = ease) => (typeof v === 'number' || !c ? (opts.unit ? `${first(v)}${opts.unit}` : first(v)) : frames(c, v, opts));
const scale = (v, n) => (typeof v === 'number' ? v * n : v.map(([at, x]) => [at, x * n]));

// A thing's moves: o opacity, x / y grid units, s scale, sx scale across,
// r degrees -- each a number or [[at, value], ...] on the scene's clock.
function moves(c, k, a) {
  if (!a) return null;
  const transform = [];
  if (a.x != null) transform.push({ translateX: tr(c, scale(a.x, k)) });
  if (a.y != null) transform.push({ translateY: tr(c, scale(a.y, k)) });
  if (a.r != null) transform.push({ rotate: tr(c, a.r, deg) });
  if (a.s != null) transform.push({ scale: tr(c, a.s) });
  if (a.sx != null) transform.push({ scaleX: tr(c, a.sx) });
  return { ...(a.o != null ? { opacity: tr(c, a.o) } : null), ...(transform.length ? { transform } : null) };
}

// Shown only between `from` and `to` (fading 3% either side).
const between = (from, to) => [[0, 0], [Math.max(0.001, from - 0.03), 0], [from, 1], [to, 1], [Math.min(0.999, to + 0.03), 0], [1, 0]];
// Shown from `from` to the end of the round.
const after = (from) => [[0, 0], [from - 0.03, 0], [from, 1], [0.94, 1], [0.98, 0], [1, 0]];
// A little pop when it appears.
const popAt = (from) => [[0, 0.4], [from - 0.03, 0.4], [from + 0.03, 1.2], [from + 0.08, 1], [1, 1]];
// Gentle floating, a quarter of the round out of step for each `phase`.
const float = (amp, phase = 0) => [0, 0.25, 0.5, 0.75, 1].map((at, i) => [at, [0, -amp, 0, amp][(i + phase) % 4]]);

const COLORS = ['#F472B6', '#34D399', '#60A5FA', '#FBBF24'];

/* ------------------------------------------------------------------ */
/* The scenes. cx: where the mascot's middle stands on the grid; flip:  */
/* it faces left. back / front: things behind and in front of it.      */
/* cam: the framing (see the component).                              */
/* ------------------------------------------------------------------ */

const SCENES = {
  // The shop at a glance: standing proudly before its market stall, waving.
  home: {
    ms: 3600,
    cam: { z: 1.02, fx: 150, fy: 80, tilt: -2 },
    rig: {
      cx: 176,
      base: 'stand',
      head: [[0, -5], [0.5, 5], [1, -5]],
      squash: [[0, 1], [0.03, 0.9], [0.07, 1.06], [0.12, 0.94], [0.16, 1], [0.5, 1], [0.53, 0.94], [0.57, 1.04], [0.62, 0.97], [0.66, 1], [1, 1]],
      cap: [[0, 1], [0.07, 0.92], [0.13, 1.06], [0.2, 1], [1, 1]],
      jump: [[0, 0], [0.06, -10], [0.12, 0], [0.5, 0], [0.56, -6], [0.62, 0], [1, 0]],
      lean: [[0, -3], [0.5, 3], [1, -3]],
      armR: { keys: [[0, 30], [0.125, 64], [0.25, 30], [0.375, 64], [0.5, 30], [0.625, 64], [0.75, 30], [0.875, 64], [1, 30]], bend: [[0, -24], [0.125, 8], [0.25, -24], [0.375, 8], [0.5, -24], [0.625, 8], [0.75, -24], [0.875, 8], [1, -24]] },
      face: { eyes: 'happy', mouth: 'grin' },
    },
    back: [{ C: Stall, x: 24, y: 40, w: 104, h: 83 }],
  },

  // Packing: picks up a tomato, leans over, drops it in the box, pleased.
  products: {
    ms: 2800,
    cam: { z: 1.18, fx: 130, fy: 84, tilt: 2 },
    rig: {
      cx: 90,
      base: 'stand',
      head: [[0, 0], [0.35, 7], [0.65, 7], [0.85, 0], [1, 0]],
      lean: [[0, 0], [0.35, 7], [0.65, 7], [0.85, 0], [1, 0]],
      armR: {
        keys: [[0, 22], [0.28, 22], [0.48, 120], [0.62, 120], [0.82, 22], [1, 22]],
        bend: [[0, -28], [0.28, -28], [0.48, 8], [0.62, 8], [0.82, -28], [1, -28]],
        hold: () => <Tomato />,
        size: 32,
        upright: true,
        offset: [0, -8],
        style: (c) => moves(c, 1, {
          o: [[0, 1], [0.5, 1], [0.57, 0], [0.86, 0], [0.9, 1], [1, 1]],
          s: [[0, 1], [0.86, 0.3], [0.94, 1.15], [1, 1]],
        }),
      },
      face: {
        eyes: 'focus',
        mouth: 'tongue',
        look: { x: [[0, 0], [0.35, 2.5], [0.65, 2.5], [0.85, 0], [1, 0]], y: [[0, 0], [0.35, 2], [0.65, 2], [0.85, 0], [1, 0]] },
      },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.64, 0.82) },
    },
    back: [{ C: BoxBack, x: 122, y: 78, w: 60, h: 40, a: { y: [[0, 0], [0.58, 0], [0.62, 2], [0.68, -1.5], [0.74, 0], [1, 0]] } }],
    front: [{ C: BoxFront, x: 122, y: 78, w: 60, h: 40, a: { y: [[0, 0], [0.58, 0], [0.62, 2], [0.68, -1.5], [0.74, 0], [1, 0]] } }],
  },

  // A new product: kneels, camera up to one eye, snaps -- flash -- the
  // photo slides out, and it grins.
  newProduct: {
    ms: 2800,
    cam: { z: 1.12, fx: 150, fy: 76, tilt: 4 },
    rig: {
      cx: 178,
      flip: true,
      base: 'kneel',
      lean: [[0, 5], [0.42, 7], [0.47, 1], [0.6, 5], [1, 5]],
      armR: {
        keys: [[0, -22], [0.44, -22], [0.47, -27], [0.52, -22], [1, -22]],
        front: true,
        hold: () => <Camera />,
        size: 34,
        upright: true,
        offset: [-4, 12],
      },
      armL: { keys: -44, front: true },
      face: { eyes: 'wink', mouth: 'flat' },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.56, 0.88) },
    },
    back: [{ C: Stand, x: 64, y: 76, w: 38, h: 42 }],
    front: [
      { C: Flash, x: 140, y: 52, w: 34, h: 34, a: { o: [[0, 0], [0.45, 0], [0.47, 1], [0.56, 0], [1, 0]], s: [[0, 0.5], [0.45, 0.5], [0.48, 1.2], [0.56, 1.5], [1, 0.5]] } },
      {
        C: PhotoCard, x: 146, y: 36, w: 24, h: 28, a: { o: between(0.55, 0.9), y: [[0, 12], [0.55, 12], [0.7, -6], [1, -12]], r: -10 },
      },
    ],
  },

  // Today's menu: sitting with a bowl beside it, scooping and eating,
  // chewing happily, steam rising.
  today: {
    ms: 3000,
    cam: { z: 1.2, fx: 140, fy: 82, tilt: -2 },
    rig: {
      cx: 108,
      base: 'sit',
      head: [[0, 5], [0.3, 5], [0.44, -4], [0.66, -4], [0.86, 5], [1, 5]],
      armR: {
        keys: [[0, 128], [0.12, 138], [0.24, 128], [0.36, 40], [0.44, -50], [0.66, -50], [0.76, 40], [0.86, 128], [1, 128]],
        front: true,
        hold: () => <Spoon />,
        size: 38,
        upright: true,
        offset: [0, 16],
      },
      face: { eyes: 'open', mouth: 'smile', look: { x: [[0, 2.5], [0.3, 2.5], [0.42, 0], [0.84, 0], [1, 2.5]], y: [[0, 2], [0.3, 2], [0.42, 0], [0.84, 0], [1, 2]] } },
      face2: { eyes: 'happy', mouth: 'smile', show: between(0.46, 0.76) },
      chew: [[0, 1], [0.48, 1], [0.52, 0.4], [0.57, 1], [0.62, 0.4], [0.67, 1], [0.72, 0.4], [0.76, 1], [1, 1]],
    },
    front: [{ C: Bowl, x: 150, y: 94, w: 56, h: 30 }],
    bits: { kind: 'steam', x: 178, y: 86 },
  },

  // Orders: pencil in hand at a big clipboard, ticking one order after
  // another, then a satisfied hop.
  orders: {
    ms: 3400,
    cam: { z: 1.12, fx: 124, fy: 80, tilt: -3 },
    rig: {
      cx: 92,
      base: 'stand',
      lean: 5,
      jump: [[0, 0], [0.84, 0], [0.88, -8], [0.93, 0], [1, 0]],
      armR: {
        keys: [[0, 92], [0.08, 99], [0.16, 92], [0.3, 108], [0.38, 115], [0.46, 108], [0.6, 122], [0.68, 129], [0.76, 122], [1, 92]],
        hold: () => <Pencil />,
        size: 22,
        upright: true,
        tilt: 210,
        offset: [3, 4],
      },
      face: { eyes: 'focus', mouth: 'tongue', look: { x: 2.5, y: [[0, 0], [0.3, 1.5], [0.6, 3], [0.8, 0], [1, 0]] } },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.8, 0.95) },
    },
    back: [{ C: Clipboard, x: 133, y: 64, w: 44, h: 52 }],
    front: [0.12, 0.42, 0.72].map((at, i) => ({
      C: Tick, x: 134, y: 78 + i * 9, w: 9, h: 9, a: { o: after(at), s: popAt(at) },
    })),
  },

  // Returns: a parcel carried back with both arms, walking along, the
  // return arrow circling it.
  returns: {
    ms: 3000,
    cam: { z: 1.06, fx: 140, fy: 84, tilt: 0 },
    rig: {
      cx: 140,
      base: 'stand',
      legs: 'walk',
      shift: [[0, -14], [0.5, 14], [1, -14]],
      lean: [[0, -3], [0.25, 0], [0.5, -3], [0.75, 0], [1, -3]],
      jump: [[0, 0], [0.25, -3], [0.5, 0], [0.75, -3], [1, 0]],
      armR: { keys: [[0, 232], [0.5, 240], [1, 232]], front: true },
      armL: {
        keys: [[0, 232], [0.5, 240], [1, 232]], front: true, hold: () => <Parcel />, size: 36, upright: true, offset: [-2, 6],
      },
      face: { eyes: 'open', mouth: 'small', look: { x: [[0, -1.5], [0.5, 1.5], [1, -1.5]] } },
    },
    front: [{
      C: ReturnRing, x: 114, y: 82, w: 52, h: 52, a: { x: [[0, -14], [0.5, 14], [1, -14]], r: [[0, 0], [1, -360]] },
    }],
  },

  // Messages: sitting, typing on a phone in its lap; chat bubbles pop up,
  // it looks up and grins at the reply.
  messages: {
    ms: 3200,
    cam: { z: 1.2, fx: 140, fy: 76, tilt: 3 },
    rig: {
      cx: 116,
      base: 'sit',
      head: [[0, 8], [0.5, 8], [0.55, -4], [0.9, -4], [1, 8]],
      lean: [[0, 4], [0.5, 4], [0.55, 0], [0.9, 0], [1, 4]],
      armR: {
        keys: [[0, 232], [0.05, 238], [0.1, 232], [0.15, 238], [0.2, 232], [0.25, 238], [0.3, 232], [1, 232]],
        front: true,
        hold: () => <Phone />,
        size: 30,
        upright: true,
        offset: [-2, -4],
      },
      armL: { keys: [[0, 232], [0.075, 238], [0.125, 232], [0.175, 238], [0.225, 232], [0.275, 238], [0.32, 232], [1, 232]], front: true },
      face: { eyes: 'focus', mouth: 'small', look: { y: 3, x: [[0, -1], [0.15, 1], [0.3, -1], [1, -1]] } },
      face2: {
        eyes: 'open', mouth: 'grin', look: { x: 3, y: -2 }, show: between(0.55, 0.92),
      },
    },
    back: [
      {
        C: Bubble, p: { color: '#FCE7F3', dots: '#EC4899' }, x: 152, y: 34, w: 46, h: 34, a: { o: between(0.28, 0.92), s: popAt(0.28) },
      },
      {
        C: Bubble, p: { color: '#D1FAE5', dots: '#10B981' }, x: 176, y: 70, w: 46, h: 34, a: { o: between(0.55, 0.92), s: popAt(0.55) },
      },
    ],
  },

  // Ask Moormy: kneeling, leaning in with a magnifying glass over
  // floating cards of information, wide-eyed -- then the idea lights up.
  assistant: {
    ms: 3800,
    cam: { z: 1.14, fx: 140, fy: 70, tilt: -4 },
    rig: {
      cx: 96,
      base: 'kneel',
      head: [[0, 6], [0.4, 11], [0.8, 4], [0.86, -3], [1, 6]],
      cap: [[0, 1], [0.84, 1], [0.88, 0.9], [0.92, 1.07], [0.97, 1], [1, 1]],
      lean: [[0, 8], [0.4, 12], [0.8, 8], [0.86, 2], [1, 8]],
      armR: {
        keys: [[0, 52], [0.25, 96], [0.45, 66], [0.7, 104], [0.82, 30], [0.95, 30], [1, 52]],
        hold: () => <Magnifier />,
        size: 38,
        offset: [0, -12],
      },
      face: {
        eyes: 'wide',
        mouth: 'o',
        look: { x: [[0, 1.5], [0.25, 3.5], [0.45, 2], [0.7, 3.5], [0.82, 0], [1, 1.5]], y: [[0, -1.5], [0.25, 0.5], [0.45, -1], [0.7, 1.5], [0.82, -2], [1, -1.5]] },
      },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.84, 0.97) },
    },
    back: [
      { C: InfoCard, p: { tone: '#F472B6' }, x: 150, y: 30, w: 38, h: 28, a: { y: float(3, 0) } },
      { C: InfoCard, p: { tone: '#34D399' }, x: 198, y: 58, w: 38, h: 28, a: { y: float(3, 1) } },
      { C: InfoCard, p: { tone: '#60A5FA' }, x: 156, y: 82, w: 38, h: 28, a: { y: float(3, 2) } },
    ],
    front: [{ C: Bulb, x: 84, y: 0, w: 26, h: 26, a: { o: between(0.84, 0.97), s: popAt(0.84), y: [[0, 6], [0.84, 6], [0.9, 0], [1, 0]] } }],
  },

  // Marketing: pins a poster on the campaign board, steps back -- then
  // jumps with both arms up as the confetti flies.
  marketing: {
    ms: 3600,
    cam: { z: 1.08, fx: 140, fy: 76, tilt: 3 },
    rig: {
      cx: 90,
      base: 'stand',
      squash: [[0, 1], [0.47, 1], [0.52, 0.86], [0.56, 1.1], [0.63, 0.9], [0.67, 1.04], [0.73, 0.96], [0.78, 1], [1, 1]],
      cap: [[0, 1], [0.56, 0.88], [0.62, 1.1], [0.7, 0.96], [0.76, 1], [1, 1]],
      head: [[0, 4], [0.4, 4], [0.5, -6], [0.75, 6], [0.85, 4], [1, 4]],
      lean: [[0, 4], [0.32, 8], [0.42, 0], [1, 0]],
      jump: [[0, 0], [0.5, 0], [0.56, -16], [0.63, 0], [0.67, -7], [0.73, 0], [1, 0]],
      armR: {
        keys: [[0, 60], [0.18, 84], [0.32, 84], [0.42, 60], [0.5, 34], [0.6, 22], [0.7, 34], [0.8, 60], [1, 60]],
        hold: () => <Poster />,
        size: 20,
        upright: true,
        offset: [6, -6],
        style: (c) => moves(c, 1, { o: [[0, 1], [0.3, 1], [0.33, 0], [0.92, 0], [0.96, 1], [1, 1]] }),
      },
      armL: { keys: [[0, 170], [0.45, 170], [0.5, 34], [0.6, 22], [0.7, 34], [0.8, 170], [1, 170]] },
      face: { eyes: 'focus', mouth: 'tongue', look: { x: 2.5, y: -1 } },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.46, 0.82) },
    },
    back: [
      { C: CampaignBoard, x: 136, y: 30, w: 84, h: 76 },
      {
        C: Poster, x: 166, y: 56, w: 19, h: 27, a: { o: after(0.33), s: popAt(0.33) },
      },
    ],
    bits: { kind: 'confetti', x: 92, y: 18 },
  },

  // Decorate: painting at an easel, tongue out; dabs of colour appear.
  decorate: {
    ms: 3000,
    cam: { z: 1.14, fx: 112, fy: 80, tilt: -3 },
    rig: {
      cx: 152,
      flip: true,
      base: 'stand',
      head: [[0, 3], [0.15, 8], [0.3, 3], [0.45, 9], [0.6, 3], [0.75, 8], [1, 3]],
      lean: [[0, 5], [0.5, 9], [1, 5]],
      armR: {
        keys: [[0, 70], [0.15, 92], [0.3, 70], [0.45, 96], [0.6, 72], [0.75, 90], [1, 70]],
        hold: () => <Brush />,
        size: 30,
        offset: [0, -8],
      },
      face: { eyes: 'focus', mouth: 'tongue', look: { x: 2.5, y: [[0, 0], [0.3, 1.5], [0.6, -1], [1, 0]] } },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.84, 0.96) },
    },
    back: [
      { C: Easel, x: 40, y: 50, w: 60, h: 68 },
      ...[[0.15, 74, 60], [0.45, 60, 70], [0.75, 76, 78]].map(([at, x, y], i) => ({
        C: Dab, p: { color: COLORS[i] }, x, y, w: 15, h: 15, a: { o: after(at), s: popAt(at) },
      })),
    ],
    bits: { kind: 'paint', x: 84, y: 46 },
  },

  // Everything about the shop: sitting with a long list, reading down it
  // and turning the page.
  menu: {
    ms: 3600,
    cam: { z: 1.2, fx: 140, fy: 84, tilt: 2 },
    rig: {
      cx: 140,
      base: 'sit',
      lean: [[0, -3], [0.5, 3], [1, -3]],
      armR: {
        keys: [[0, 234], [0.42, 234], [0.46, 220], [0.5, 234], [0.88, 234], [0.92, 220], [0.96, 234], [1, 234]],
        front: true,
        hold: () => <ListCard />,
        size: 42,
        upright: true,
        offset: [-2, -10],
        style: (c) => moves(c, 1, { sx: [[0, 1], [0.42, 1], [0.46, 0.05], [0.5, 1], [0.88, 1], [0.92, 0.05], [0.96, 1], [1, 1]] }),
      },
      armL: { keys: 236, front: true },
      face: { eyes: 'open', mouth: 'small', look: { y: 3, x: [[0, -2], [0.2, 2], [0.4, -2], [0.6, 2], [0.8, -2], [1, -2]] } },
    },
  },

  // The shop's profile: turns its sign from CLOSED to OPEN and cheers.
  store: {
    ms: 3200,
    cam: { z: 1.12, fx: 136, fy: 70, tilt: -3 },
    rig: {
      cx: 128,
      base: 'stand',
      squash: [[0, 1], [0.5, 1], [0.53, 0.9], [0.56, 1.06], [0.62, 0.94], [0.66, 1.03], [0.71, 1], [1, 1]],
      head: [[0, -2], [0.45, -2], [0.5, 6], [0.9, 6], [1, -2]],
      jump: [[0, 0], [0.5, 0], [0.56, -12], [0.62, 0], [0.66, -5], [0.71, 0], [1, 0]],
      armR: {
        keys: [[0, 44], [0.5, 38], [0.6, 30], [1, 44]],
        hold: (px, c) => <FlipSign c={c} />,
        size: 50,
        upright: true,
        offset: [10, -20],
        style: (c) => moves(c, 1, { sx: [[0, 1], [0.4, 1], [0.45, 0.05], [0.5, 1], [0.92, 1], [0.95, 0.05], [1, 1]] }),
      },
      armL: { keys: [[0, 160], [0.5, 160], [0.55, 20], [0.7, 20], [0.76, 160], [1, 160]] },
      face: { eyes: 'open', mouth: 'small', look: { x: 2, y: -2 } },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.48, 0.9) },
    },
  },

  // Delivery: lifts a parcel into the truck, waves it off; the truck
  // drives out of the picture and backs in again.
  fulfillment: {
    ms: 4200,
    cam: { z: 1.02, fx: 140, fy: 84, tilt: 0 },
    rig: {
      cx: 84,
      base: 'stand',
      lean: [[0, 0], [0.22, 7], [0.32, 7], [0.4, 0], [1, 0]],
      armR: {
        keys: [[0, 25], [0.22, 96], [0.32, 96], [0.4, 40], [0.47, 66], [0.54, 40], [0.61, 66], [0.68, 40], [0.8, 25], [1, 25]],
        hold: () => <Parcel />,
        size: 26,
        upright: true,
        offset: [0, -8],
        style: (c) => moves(c, 1, { o: [[0, 1], [0.3, 1], [0.33, 0], [0.9, 0], [0.95, 1], [1, 1]] }),
      },
      face: { eyes: 'focus', mouth: 'flat', look: { x: 2.5, y: 1 } },
      face2: {
        eyes: 'happy', mouth: 'grin', look: { x: 3 }, show: between(0.36, 0.82),
      },
    },
    front: [{
      C: Truck, x: 128, y: 76, w: 70, h: 44, a: { x: [[0, 0], [0.36, 0], [0.62, 150], [0.76, 150], [0.95, 0], [1, 0]], y: [[0, 0], [0.4, -1], [0.45, 0], [0.5, -1], [0.55, 0], [1, 0]] },
    }],
  },

  // How the shop is doing: points at the chart as each bar grows, then
  // a hop at the top.
  analytics: {
    ms: 3600,
    cam: { z: 1.12, fx: 142, fy: 80, tilt: 2 },
    rig: {
      cx: 92,
      base: 'stand',
      head: [[0, 2], [0.55, -6], [0.82, -6], [1, 2]],
      squash: [[0, 1], [0.6, 1], [0.64, 0.9], [0.67, 1.06], [0.73, 0.94], [0.77, 1], [1, 1]],
      lean: 3,
      jump: [[0, 0], [0.62, 0], [0.67, -10], [0.73, 0], [1, 0]],
      armR: {
        keys: [[0, 70], [0.15, 82], [0.35, 72], [0.55, 60], [0.82, 60], [1, 70]],
        hold: () => <Pointer />,
        size: 40,
        offset: [0, -16],
      },
      face: { eyes: 'focus', mouth: 'flat', look: { x: 2.5, y: [[0, 1], [0.55, -1.5], [1, 1]] } },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.6, 0.9) },
    },
    back: [
      { C: ChartBoard, x: 130, y: 50, w: 84, h: 68 },
      ...[[0.12, 0, 14, '#F472B6'], [0.3, 1, 24, '#34D399'], [0.5, 2, 36, '#10B981']].map(([at, i, h, color]) => ({
        C: BarFill, p: { color }, x: 146 + i * 20, y: 100 - h, w: 12, h, a: { o: [[0, 0.15], [at, 0.15], [at + 0.05, 1], [0.94, 1], [1, 0.15]], s: [[0, 0.3], [at, 0.3], [at + 0.08, 1], [0.94, 1], [1, 0.3]] },
      })),
    ],
  },

  // Earnings: dropping coins into a piggy bank, which jumps each time.
  finance: {
    ms: 2600,
    cam: { z: 1.2, fx: 150, fy: 88, tilt: -2 },
    rig: {
      cx: 114,
      base: 'sit',
      head: [[0, 2], [0.45, 7], [0.56, 7], [0.76, 2], [1, 2]],
      armR: {
        keys: [[0, 30], [0.3, 62], [0.45, 82], [0.56, 82], [0.76, 30], [1, 30]],
        hold: () => <Coin />,
        size: 18,
        upright: true,
        offset: [0, -8],
        style: (c) => moves(c, 1, { o: [[0, 1], [0.5, 1], [0.53, 0], [0.85, 0], [0.9, 1], [1, 1]] }),
      },
      face: { eyes: 'open', mouth: 'small', look: { x: 2.5, y: 1.5 } },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.55, 0.8) },
    },
    front: [{ C: Piggy, x: 150, y: 80, w: 52, h: 38, a: { y: [[0, 0], [0.53, 0], [0.57, -5], [0.62, 0], [0.66, -2], [0.7, 0], [1, 0]] } }],
    bits: { kind: 'coin', x: 178, y: 72 },
  },

  // Reviews: sitting reading a buyer's review, eyes along the lines, as
  // five stars light up one by one -- then a happy bounce.
  reviews: {
    ms: 3800,
    cam: { z: 1.14, fx: 150, fy: 72, tilt: 3 },
    rig: {
      cx: 102,
      base: 'sit',
      head: [[0, -4], [0.6, -4], [0.66, 7], [0.9, 7], [1, -4]],
      lean: [[0, 4], [0.6, 4], [0.66, -3], [0.9, -3], [1, 4]],
      jump: [[0, 0], [0.66, 0], [0.71, -9], [0.76, 0], [0.8, -4], [0.84, 0], [1, 0]],
      armR: {
        keys: [[0, 232], [0.6, 232], [0.68, 210], [0.9, 210], [1, 232]],
        front: true,
        hold: () => <ReviewCard />,
        size: 40,
        upright: true,
        offset: [-2, 4],
      },
      face: { eyes: 'focus', mouth: 'small', look: { y: 3, x: [[0, -2.5], [0.15, 2.5], [0.17, -2.5], [0.32, 2.5], [0.34, -2.5], [0.5, 2.5], [0.6, 0], [1, -2.5]] } },
      face2: { eyes: 'happy', mouth: 'grin', show: between(0.64, 0.92) },
    },
    back: [0, 1, 2, 3, 4].map((i) => ({ C: StarOutline, x: 146 + i * 18, y: 40, w: 16, h: 16 })),
    front: [0, 1, 2, 3, 4].map((i) => ({
      C: BigStar, x: 146 + i * 18, y: 40, w: 16, h: 16, a: { o: after(0.12 + i * 0.1), s: popAt(0.12 + i * 0.1) },
    })),
  },

  // Buyer questions: a question floats in, it catches it, scratches its
  // cap thinking, and sends back the answer.
  questions: {
    ms: 4000,
    cam: { z: 1.1, fx: 130, fy: 72, tilt: -2 },
    rig: {
      cx: 96,
      base: 'stand',
      head: [[0, 4], [0.3, 4], [0.36, -10], [0.5, -10], [0.55, 2], [1, 4]],
      lean: [[0, 0], [0.3, 4], [0.35, -5], [0.45, 5], [0.52, 0], [1, 0]],
      armR: { keys: [[0, 40], [0.2, 40], [0.3, 72], [0.36, 14], [0.4, 6], [0.44, 14], [0.48, 6], [0.52, 30], [0.62, 70], [0.72, 40], [1, 40]] },
      face: { eyes: 'wide', mouth: 'o', look: { x: [[0, 3], [0.3, 2], [0.36, 0], [1, 3]], y: -1.5 } },
      face2: {
        eyes: 'closed', mouth: 'flat', show: [[0, 0], [0.33, 0], [0.36, 1], [0.5, 1], [0.53, 0], [1, 0]],
      },
    },
    back: [
      {
        C: AskBubble, x: 132, y: 44, w: 40, h: 36, a: { o: [[0, 0], [0.05, 1], [0.52, 1], [0.55, 0], [1, 0]], x: [[0, 70], [0.28, 0], [1, 0]], y: [[0, -10], [0.28, 0], [1, 0]] },
      },
      {
        C: AskBubble, p: { answered: true }, x: 132, y: 44, w: 40, h: 36, a: { o: [[0, 0], [0.52, 0], [0.55, 1], [0.86, 1], [0.92, 0], [1, 0]], s: popAt(0.55), x: [[0, 0], [0.62, 0], [0.92, 90], [1, 90]], y: [[0, 0], [0.62, 0], [0.92, -20], [1, -20]] },
      },
    ],
  },

  // Notifications: rings a bell high over its head, the other hand over
  // its ear, hopping with each ring.
  notifications: {
    ms: 2400,
    cam: { z: 1.16, fx: 140, fy: 70, tilt: 4 },
    rig: {
      cx: 132,
      base: 'stand',
      squash: [[0, 1], [0.04, 0.92], [0.08, 1.05], [0.12, 1], [0.2, 0.92], [0.24, 1.05], [0.28, 1], [1, 1]],
      cap: [[0, 1], [0.06, 1.08], [0.1, 0.94], [0.14, 1], [0.22, 1.08], [0.26, 0.94], [0.3, 1], [1, 1]],
      head: [[0, -3], [0.1, 3], [0.2, -3], [0.3, 3], [0.4, 0], [1, -3]],
      jump: [[0, 0], [0.08, -6], [0.16, 0], [0.24, -6], [0.32, 0], [1, 0]],
      armR: {
        keys: [[0, 46], [0.05, 58], [0.1, 36], [0.15, 58], [0.2, 36], [0.25, 58], [0.3, 36], [0.35, 46], [1, 46]],
        hold: () => <Bell />,
        size: 38,
        upright: true,
        offset: [8, -18],
      },
      armL: { keys: [[0, 34], [0.35, 34], [0.4, 150], [0.94, 150], [1, 34]] },
      face: { eyes: 'closed', mouth: 'grin' },
      face2: { eyes: 'open', mouth: 'smile', show: [[0, 0], [0.42, 0], [0.46, 1], [0.94, 1], [0.98, 0], [1, 0]] },
    },
    bits: { kind: 'badge', x: 176, y: 40 },
  },

  // The municipal admin: sitting on a call, handset to its ear, taking
  // turns to talk -- its bubble, then the admin's.
  support: {
    ms: 4200,
    cam: { z: 1.08, fx: 150, fy: 76, tilt: -3 },
    rig: {
      cx: 96,
      base: 'sit',
      head: [[0, 4], [0.5, 4], [0.56, 9], [0.62, 2], [0.68, 9], [0.74, 4], [1, 4]],
      lean: [[0, -2], [0.5, -2], [0.56, 3], [0.62, -1], [0.68, 3], [0.74, -2], [1, -2]],
      armR: {
        keys: 10, hold: () => <Handset />, size: 38, upright: true, tilt: 14, offset: [2, 12],
      },
      face: { eyes: 'open', mouth: 'smile', look: { x: 2 } },
      face2: {
        eyes: 'happy', mouth: 'small', look: { x: 3 }, show: between(0.5, 0.92),
      },
      chew: [[0, 1], [0.06, 0.4], [0.12, 1], [0.18, 0.4], [0.24, 1], [0.3, 0.4], [0.36, 1], [0.42, 0.4], [0.46, 1], [1, 1]],
    },
    back: [
      { C: AdminFace, x: 204, y: 74, w: 40, h: 40, a: { y: float(2) } },
      {
        C: Bubble, p: { color: '#FCE7F3', dots: '#EC4899' }, x: 138, y: 26, w: 46, h: 34, a: { o: between(0.04, 0.46), s: popAt(0.04) },
      },
      {
        C: Bubble, p: { color: '#D1FAE5', dots: '#10B981' }, x: 192, y: 30, w: 46, h: 34, a: { o: between(0.52, 0.92), s: popAt(0.52) },
      },
    ],
  },

  // Settings: kneeling at a big gear, turning it with a wrench; the small
  // gear turns the other way.
  settings: {
    ms: 2000,
    cam: { z: 1.16, fx: 130, fy: 86, tilt: 3 },
    rig: {
      cx: 90,
      base: 'kneel',
      head: [[0, 4], [0.4, 8], [0.55, 8], [0.9, 4], [1, 4]],
      lean: [[0, 4], [0.4, 9], [0.55, 9], [0.9, 4], [1, 4]],
      armR: {
        keys: [[0, 70], [0.4, 116], [0.55, 116], [0.9, 70], [1, 70]],
        hold: () => <Wrench />,
        size: 30,
        offset: [0, -8],
      },
      face: { eyes: 'focus', mouth: 'tongue', look: { x: 2.5, y: 1.5 } },
    },
    back: [
      { C: Gear, x: 128, y: 60, w: 58, h: 58, a: { r: [[0, 0], [0.4, 45], [1, 45]] } },
      { C: Gear, x: 180, y: 46, w: 30, h: 30, a: { r: [[0, 0], [0.4, -90], [1, -90]] } },
    ],
  },
};
SCENES.welcome = SCENES.home;
const DEFAULT_SCENE = SCENES.home;

// A bar of the chart, growing from its foot.
function BarFill({ color }) {
  return <View style={{ flex: 1, backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />;
}

// The photo that slides out of the camera.
function PhotoCard() {
  return (
    <View style={styles.photo}>
      <View style={styles.photoPic}><Stand /></View>
    </View>
  );
}

// The shop sign: CLOSED, turned round to OPEN half-way.
function FlipSign({ c }) {
  const closed = moves(c, 1, { o: [[0, 1], [0.45, 1], [0.46, 0], [0.94, 0], [0.95, 1], [1, 1]] });
  const open = moves(c, 1, { o: [[0, 0], [0.45, 0], [0.46, 1], [0.94, 1], [0.95, 0], [1, 0]] });
  return (
    <View style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, open]}><OpenSign /></Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, closed]}><ClosedSign /></Animated.View>
    </View>
  );
}

// A small four-point sparkle centred on (x, y).
const sparkle = (x, y, r) => {
  const q = r * 0.18;
  return `M${x} ${y - r}C${x + q} ${y - q} ${x + q} ${y - q} ${x + r} ${y}C${x + q} ${y + q} ${x + q} ${y + q} ${x} ${y + r}C${x - q} ${y + q} ${x - q} ${y + q} ${x - r} ${y}C${x - q} ${y - q} ${x - q} ${y - q} ${x} ${y - r}Z`;
};
const HEART = 'M12 20s-7-4.4-9.2-8.6C1.2 8.3 3.1 5 6.4 5c2 0 3.4 1.1 4.1 2.3h3c.7-1.2 2.1-2.3 4.1-2.3 3.3 0 5.2 3.3 3.6 6.4C19 15.6 12 20 12 20z';

// One of the things that rise round it, in a 24 x 24 box.
function Bit({ kind, i }) {
  const tone = COLORS[i % 2];
  switch (kind) {
    case 'coin':
      return (
        <G>
          <Circle cx="12" cy="12" r="8" fill="#F59E0B" />
          <Circle cx="12" cy="12" r="5" fill="#FBBF24" />
        </G>
      );
    case 'heart':
      return <Path d={HEART} fill={tone} />;
    case 'steam':
      return <Circle cx="12" cy="12" r={5 + (i % 2) * 2} fill={t.neutral[200]} />;
    case 'paint':
      return <Circle cx="12" cy="12" r="6" fill={COLORS[i % 4]} />;
    case 'confetti':
      return <Rect x="7" y="4" width="10" height="16" rx="2" fill={COLORS[i % 4]} transform={`rotate(${i * 40} 12 12)`} />;
    case 'badge':
      return (
        <G>
          <Circle cx="12" cy="12" r="9" fill="#EF4444" />
          <Rect x="10.6" y="6.5" width="2.8" height="8" rx="1.4" fill="#fff" />
          <Circle cx="12" cy="17.2" r="1.6" fill="#fff" />
        </G>
      );
    default:
      return <Path d={sparkle(12, 12, 10)} fill={tone} />;
  }
}

// Three of them rising and fading in turn from round (x, y) on the grid.
const BITS = [{ dx: -18, size: 15, shift: 0 }, { dx: 4, size: 11, shift: 0.33 }, { dx: 22, size: 13, shift: 0.66 }];
function Bits({
  kind, x, y, k, still,
}) {
  const clock = useLoop(2600, { still });
  if (!kind || !clock) return null;
  return BITS.map((b, i) => {
    const rise = { easing: EASE_IN_OUT, shift: b.shift };
    return (
      <Animated.View
        // eslint-disable-next-line react/no-array-index-key
        key={i}
        style={{
          position: 'absolute',
          left: (x + b.dx) * k - (b.size * k) / 2,
          top: (y + PAD) * k - (b.size * k) / 2,
          width: b.size * k,
          height: b.size * k,
          opacity: frames(clock, [[0, 0], [0.15, 1], [0.7, 1], [1, 0]], rise),
          transform: [
            { translateY: frames(clock, [[0, 0], [1, -40 * k]], rise) },
            { translateX: frames(clock, [[0, 0], [0.5, (i % 2 ? 5 : -5) * k], [1, 0]], rise) },
            { scale: frames(clock, [[0, 0.5], [0.3, 1], [1, 0.8]], rise) },
          ],
        }}
      >
        <Svg width="100%" height="100%" viewBox="0 0 24 24"><Bit kind={kind} i={i} /></Svg>
      </Animated.View>
    );
  });
}

// One thing in the scene, placed on the grid, moving on the scene's clock.
// One that stands on the floor (its foot at the old shelf's line) casts a
// soft shadow there.
function Thing({ item, k, c }) {
  const { C, p } = item;
  const style = useMemo(() => moves(c, k, item.a), [c, k, item.a]);
  const grounded = Math.abs(item.y + item.h - SHELF) < 6;
  return (
    <Animated.View
      style={[{
        position: 'absolute', left: item.x * k, top: (item.y + PAD) * k, width: item.w * k, height: item.h * k,
      }, style]}
    >
      {grounded ? <View style={[styles.floorShadow, { bottom: -3 * k, height: 6 * k }]} /> : null}
      <C {...p} />
    </Animated.View>
  );
}

export default function SellerGuideMascot({ name, width = VW, style }) {
  const k = width / VW;
  const height = (VH + PAD) * k;
  const scene = SCENES[name] || DEFAULT_SCENE;
  const { rig } = scene;
  const still = useReducedMotion();
  const clock = useLoop(scene.ms, { still });

  // The mascot stands (or sits, or kneels) on the shelf.
  const size = RIG * k;
  const ground = RIG_GROUND[rig.base || 'sit'];
  const left = (rig.cx - RIG / 2) * k;
  const top = (SHELF + PAD - (ground * RIG) / 120) * k;

  // It pops up from behind the shelf as the sheet rises.
  const pop = useRef(new Animated.Value(still ? 1 : 0)).current;
  useEffect(() => {
    if (still) { pop.setValue(1); return undefined; }
    const run = Animated.sequence([
      Animated.delay(160),
      Animated.spring(pop, {
        toValue: 1, friction: 5, tension: 90, useNativeDriver: true,
      }),
    ]);
    run.start();
    return () => run.stop();
  }, [pop, still]);

  // The camera: each scene framed its own way -- close on the action or
  // wide, a slight tilt -- turning round the point it looks at, and
  // drifting in a little, slowly, as if filmed.
  const cam = scene.cam || { z: 1, fx: 140, fy: 84, tilt: 0 };
  const drift = useLoop(9000, { still });
  const camStyle = useMemo(() => ({
    transformOrigin: [cam.fx * k, (Math.min(cam.fy, 60) * 0.5 + PAD) * k, 0],
    transform: [
      { rotate: `${cam.tilt}deg` },
      { scale: drift ? frames(drift, [[0, cam.z], [0.5, cam.z * 1.045], [1, cam.z]], ease) : cam.z },
    ],
  }), [cam, drift, k]);
  return (
    <View
      style={[{ width, height, overflow: 'hidden' }, style]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* No backdrop and no floor: the mascot and its things stand on the
          sheet itself, grounded only by their soft shadows. */}
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width, height }, camStyle]}>

      {(scene.back || []).map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Thing key={`b${i}`} item={item} k={k} c={clock} />
      ))}

      <Animated.View
        style={{
          position: 'absolute',
          left,
          top,
          opacity: pop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [28 * k, 0] }) },
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
          ],
        }}
      >
        <MascotRig size={size} clock={clock} pose={rig} flip={rig.flip} />
      </Animated.View>

      {(scene.front || []).map((item, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <Thing key={`f${i}`} item={item} k={k} c={clock} />
      ))}

      {scene.bits ? <Bits kind={scene.bits.kind} x={scene.bits.x} y={scene.bits.y} k={k} still={still} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A thing standing on the floor casts a soft shadow under it.
  floorShadow: {
    position: 'absolute', left: '8%', right: '8%', borderRadius: 999, backgroundColor: 'rgba(11, 61, 46, 0.13)',
  },
  photo: {
    flex: 1, padding: 2, paddingBottom: 6, backgroundColor: '#fff', borderRadius: 2, borderWidth: 1, borderColor: '#E2E8F0',
  },
  photoPic: { flex: 1, backgroundColor: '#FCE7F3', overflow: 'hidden' },
});
