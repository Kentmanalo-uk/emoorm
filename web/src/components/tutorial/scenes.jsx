import { Fragment } from 'react';
import {
  clamp, ease, prog, window2, mix, tf,
} from './motion';

/*
 * The seller tutorial's ten scenes. Each is drawn from the time since it
 * began (t) on a fixed stage: 1920×1080 on wide screens, 1080×1920 on tall
 * ones (P). Every screen shown is a real E-MOORM page, captured from the
 * app; the products are from a demo farm shop set up for filming.
 */

const SHOT = (name) => `/tutorial/${name}.webp`;
const ASSET = (name) => `/assets/${name}`;

// Phone screens are 390 CSS px wide (the captured phone page).
const PAGE_W = 390;
const PAGE_H = 844;

/** A phone showing a captured screen. Children are drawn in page px. */
export function Phone({
  src, x, y, w = 380, s = 1, r = 0, o = 1, scroll = 0, from = null, mix: m = 0, children, shadow = 1, z,
}) {
  const pad = Math.round(w * 0.034);
  const sw = w - pad * 2;
  const sh = (sw * PAGE_H) / PAGE_W;
  const k = sw / PAGE_W;
  return (
    <div
      className="st-phone"
      style={{
        left: x, top: y, width: w, height: sh + pad * 2, padding: pad, borderRadius: w * 0.15,
        transform: tf({ s, r }), opacity: o, zIndex: z,
        boxShadow: `0 ${40 * shadow}px ${90 * shadow}px rgba(16, 36, 24, ${0.28 * shadow}), 0 8px 24px rgba(0,0,0,${0.18 * shadow})`,
      }}
    >
      <div className="st-phone-screen" style={{ borderRadius: w * 0.12 }}>
        {from && <img src={SHOT(from)} alt="" style={{ transform: `translateY(${-scroll * k}px)`, opacity: 1 - m }} />}
        <img src={SHOT(src)} alt="" style={{ transform: `translateY(${-scroll * k}px)`, opacity: from ? m : 1 }} />
        <div className="st-phone-over" style={{ transform: `scale(${k}) translateY(${-scroll}px)` }}>{children}</div>
      </div>
      <div className="st-phone-notch" style={{ width: w * 0.28, height: w * 0.075, top: pad + w * 0.03, borderRadius: w * 0.05 }} />
    </div>
  );
}

/** A tap on the screen: a dot and a ring that spreads (page px). */
export function Tap({ t, at, x, y }) {
  const p = (t - at) / 0.7;
  if (p < -0.15 || p > 1) return null;
  const pre = clamp((t - at + 0.15) / 0.15);
  return (
    <>
      <span className="st-tap-dot" style={{ left: x - 16, top: y - 16, opacity: p < 0 ? pre * 0.9 : (1 - p) * 0.9, transform: `scale(${p < 0 ? 1 : 1 - 0.25 * p})` }} />
      <span className="st-tap-ring" style={{ left: x - 30, top: y - 30, opacity: p < 0 ? 0 : (1 - p) * 0.7, transform: `scale(${0.5 + p * 1.3})` }} />
    </>
  );
}

/** A soft focus ring around part of the screen (page px). */
export function Focus({ o, x, y, w, h, r = 12 }) {
  if (o <= 0) return null;
  return <span className="st-focus" style={{ left: x - 6, top: y - 6, width: w + 12, height: h + 12, borderRadius: r + 6, opacity: o, transform: `scale(${mix(1.06, 1, o)})` }} />;
}

/** Words that rise in one by one from behind a mask; `out` lifts them away. */
export function Words({ text, t, at, out = Infinity, step = 0.07, className = '', style, accent = [] }) {
  const words = text.split(' ');
  return (
    <span className={`st-words ${className}`} style={style}>
      {words.map((wd, i) => {
        const p = prog(t, at + i * step, 0.75, ease.outQuint);
        const q = prog(t, out + i * step * 0.5, 0.45, ease.in);
        const hot = accent.includes(i);
        return (
          <Fragment key={`${wd}-${i}`}>
            <span className="st-word">
              <span style={{ transform: `translateY(${(1 - p) * 110 - q * 110}%)`, color: hot ? 'var(--st-green)' : undefined }}>{wd}</span>
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </Fragment>
        );
      })}
    </span>
  );
}

const Kicker = ({ children, o = 1, style }) => <div className="st-kicker" style={{ opacity: o, ...style }}>{children}</div>;

// ── 01 · Opening ──────────────────────────────────────────────────────
const FLASH = [
  { src: SHOT('photo-mango'), cover: true, label: 'Carabao mangoes' },
  { src: ASSET('fruits.jpg'), cover: false, label: 'Lakatan bananas' },
  { src: SHOT('photo-vegetables'), cover: true, label: 'Garden vegetables' },
  { src: ASSET('seafood.jpg'), cover: false, label: 'Fresh talaba' },
  { src: SHOT('photo-shrimp'), cover: true, label: 'Crispy fried shrimp' },
  { src: ASSET('handicrafts.jpg'), cover: false, label: 'Handwoven bilao' },
  { src: SHOT('photo-hens'), cover: true, label: 'Native hens' },
];

export function Opening({ t, P }) {
  const slot = Math.floor((t - 0.45) / 0.6);
  const flashOn = t >= 0.45 && t < 4.65;
  const f = FLASH[clamp(slot, 0, FLASH.length - 1)];
  const local = (t - 0.45) - slot * 0.6;
  const reveal = prog(t, 11.3, 0.9, ease.inOut);
  const leave = prog(t, 13.3, 0.7, ease.in);
  return (
    <div className="st-scene st-dark">
      {t < 0.45 && <div className="st-center st-light-on-dark" style={{ opacity: clamp(t / 0.3) * 0.6, fontSize: P ? 34 : 28 }}>Oriental Mindoro</div>}
      {flashOn && (
        <div className="st-flash" style={{ background: f.cover ? '#000' : '#f4efe6' }}>
          <img
            src={f.src}
            alt=""
            className={f.cover ? 'st-cover' : 'st-cutout'}
            style={{ transform: `scale(${mix(f.cover ? 1.14 : 0.86, f.cover ? 1.02 : 0.78, clamp(local / 0.6))})` }}
          />
          <div className="st-flash-label" style={{ color: f.cover ? '#fff' : '#3b2f22' }}>{f.label}</div>
        </div>
      )}
      {t >= 4.65 && t < 12.2 && (
        <>
          <div className="st-collage">
            {[SHOT('photo-vegetables'), SHOT('photo-mango'), SHOT('photo-hens')].map((src, i) => (
              <img key={src} src={src} alt="" style={{ transform: `translateY(${(i - 1) * 30 - (t - 4.65) * (6 + i * 4)}px) scale(1.12)` }} />
            ))}
          </div>
          <div className="st-shade" />
          <div className="st-center st-headline-wrap" style={{ width: P ? 900 : 1500 }}>
            <Words className="st-h-xl st-white" t={t} at={5.0} out={8.1} text="Your products deserve to be seen." accent={[2]} />
          </div>
          <div className="st-center st-headline-wrap" style={{ width: P ? 900 : 1500 }}>
            <Words className="st-h-lg st-white" t={t} at={8.5} out={11.0} step={0.06} text="Your local business can sell beyond your neighborhood." accent={[6, 7]} />
          </div>
        </>
      )}
      {t >= 11.3 && (
        <div className="st-wipe" style={{ clipPath: `circle(${reveal * 150}% at 50% 50%)` }}>
          <div className="st-logo" style={{ transform: tf({ s: mix(1, 0.86, leave), y: -leave * 40 }), opacity: 1 - leave }}>
            <img src="/brand-icon.png" alt="" style={{ width: P ? 260 : 220, transform: `scale(${mix(0.7, 1, prog(t, 11.6, 0.9, ease.back))})` }} />
            <div className="st-logo-word" style={{ fontSize: P ? 128 : 136 }}>
              {'E-MOORM'.split('').map((ch, i) => (
                <span key={i} style={{ opacity: prog(t, 11.9 + i * 0.05, 0.4), transform: `translateY(${(1 - prog(t, 11.9 + i * 0.05, 0.6, ease.outQuint)) * 40}px)` }}>{ch}</span>
              ))}
            </div>
            <div className="st-logo-tag" style={{ opacity: prog(t, 12.5, 0.6) }}>The Mindoreño marketplace</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 02 · What is E-MOORM ──────────────────────────────────────────────
const TYPED = 'Carabao mangoes';

export function WhatIs({ t, P }) {
  const phoneIn = prog(t, 0.1, 1.1, ease.outQuint);
  const statement = t >= 13.4;
  const phoneOut = prog(t, 13.2, 0.8, ease.in);
  const screen = t < 3.6 ? 'live-home' : t < 6.4 ? 'search' : t < 10.4 ? 'store' : 'live-municipals';
  const prev = t < 3.6 ? null : t < 6.4 ? 'live-home' : t < 10.4 ? 'search' : 'store';
  const changeAt = t < 6.4 ? 3.6 : t < 10.4 ? 6.4 : 10.4;
  const m = prev ? prog(t, changeAt, 0.5, ease.inOut) : 1;
  const typed = TYPED.slice(0, Math.round(clamp((t - 1.6) / 1.5) * TYPED.length));
  const lines = [
    { at: 0.6, out: 3.4, text: 'Discover local products.' },
    { at: 3.9, out: 6.2, text: 'Find them in seconds.' },
    { at: 6.7, out: 10.2, text: 'Connect with local buyers.' },
    { at: 10.7, out: 13.0, text: 'Sell from where you are.' },
  ];
  const px = P ? 260 : 1170;
  const py = P ? 620 : 70;
  return (
    <div className="st-scene st-warm">
      <div className="st-glow" style={{ left: P ? -200 : 1100, top: P ? 900 : -300, transform: tf({ x: -t * 6 }) }} />
      {!statement || phoneOut < 1 ? (
        <Phone
          src={screen}
          from={prev}
          mix={m}
          x={px}
          y={py + (1 - phoneIn) * 220}
          w={P ? 560 : 450}
          r={(1 - phoneIn) * -6 - phoneOut * 4}
          s={1 - phoneOut * 0.1}
          o={phoneIn * (1 - phoneOut)}
        >
          {t < 3.8 && t > 1.3 && (
            <span className="st-typed" style={{ left: 50, top: 9, width: 230, height: 34 }}>
              {typed}<i style={{ opacity: Math.floor(t * 3) % 2 }}>|</i>
            </span>
          )}
          <Tap t={t} at={2.1} x={180} y={26} />
          <Tap t={t} at={8.6} x={315} y={162} />
        </Phone>
      ) : null}
      <div className="st-copy" style={P ? { left: 90, top: 200, width: 900 } : { left: 160, top: 430, width: 900 }}>
        <div className="st-swap">
        {lines.map((l) => (
          <div key={l.text} className="st-stack">
            <Words className="st-h-lg" t={t} at={l.at} out={l.out} text={l.text} accent={[0]} />
          </div>
        ))}
        </div>
      </div>
      {statement && (
        <div className="st-center" style={{ width: P ? 940 : 1500, textAlign: 'center' }}>
          <Kicker o={prog(t, 13.8, 0.5)}>What is E-MOORM?</Kicker>
          <div className="st-statement">
            <Words t={t} at={14.0} step={0.05} className="st-h-md" text="E-MOORM connects local entrepreneurs and agricultural producers" />
            <br />
            <Words t={t} at={14.7} step={0.06} className="st-h-md" text="with customers across Oriental Mindoro." accent={[3, 4]} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 03 · What can you sell ────────────────────────────────────────────
const GOODS = [
  { q: 'Grew it?', cat: 'Fruits', name: 'Lakatan bananas', src: ASSET('fruits.jpg'), cutout: true, bg: '#fbf3d5' },
  { q: 'Grew it?', cat: 'Vegetables', name: 'Garden vegetables', src: SHOT('photo-vegetables'), bg: '#e5f1e1' },
  { q: 'Caught it?', cat: 'Seafood', name: 'Fresh talaba', src: ASSET('seafood.jpg'), cutout: true, bg: '#e6eef3' },
  { q: 'Cooked it?', cat: 'Local delicacies', name: 'Crispy fried shrimp', src: SHOT('photo-shrimp'), bg: '#f6e7da' },
  { q: 'Made it?', cat: 'Dried goods & processed foods', name: 'Roasted nuts', src: ASSET('wellness.jpg'), cutout: true, bg: '#f3ece2' },
  { q: 'Crafted it?', cat: 'Handicrafts', name: 'Handwoven bilao', src: ASSET('handicrafts.jpg'), cutout: true, bg: '#efe7da' },
  { q: 'Raised it?', cat: 'Livestock', name: 'Native hens', src: SHOT('photo-hens'), bg: '#f1e6dc' },
];
const STEP3 = 2.4;

export function WhatToSell({ t, P }) {
  const i = clamp(Math.floor(t / STEP3), 0, GOODS.length - 1);
  const g = GOODS[i];
  const local = t - i * STEP3;
  const wipe = i === 0 ? prog(t, 0, 0.6, ease.outQuint) : prog(local, 0, 0.55, ease.inOut);
  const prevG = GOODS[i - 1];
  // The last product (hens) shrinks into its listing on a phone.
  const shrink = prog(t, 17.0, 1.2, ease.inOut);
  const phoneO = prog(t, 17.6, 0.6);
  const final = prog(t, 20.0, 0.8, ease.outQuint);
  const panel = P
    ? { x: 0, y: 760, w: 1080, h: 1160 }
    : { x: 860, y: 0, w: 1060, h: 1080 };
  const target = P ? { x: 270, y: 560, w: 540, h: 1170 } : { x: 1260, y: 150, w: 380, h: 822 };
  const box = {
    x: mix(panel.x, target.x + 18, shrink), y: mix(panel.y, target.y + 18, shrink),
    w: mix(panel.w, target.w - 36, shrink), h: mix(panel.h, target.h * 0.42, shrink),
  };
  const textOut = prog(t, 19.6, 0.5, ease.in);
  return (
    <div className="st-scene st-warm">
      {t < 19.8 && (
        <div className="st-goods-panel" style={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: mix(0, 40, shrink), opacity: 1 - phoneO * 0.999 }}>
          {prevG && wipe < 1 && (
            <div className="st-goods-img" style={{ background: prevG.bg }}>
              <img src={prevG.src} alt="" className={prevG.cutout ? 'st-cutout' : 'st-cover'} style={{ transform: `translateX(${-wipe * 12}%) scale(1.06)` }} />
            </div>
          )}
          <div className="st-goods-img" style={{ background: g.bg, clipPath: `inset(0 0 0 ${(1 - wipe) * 100}%)` }}>
            <img src={g.src} alt="" className={g.cutout ? 'st-cutout' : 'st-cover'} style={{ transform: `translateX(${(1 - wipe) * 10}%) scale(${mix(1.12, 1.02, clamp(local / STEP3))})` }} />
          </div>
        </div>
      )}
      {phoneO > 0 && t < 24 && (
        <Phone src="product-hens" x={target.x} y={target.y} w={target.w} o={phoneO * (1 - prog(t, 19.8, 0.5, ease.in))} s={1 + (1 - phoneO) * 0.02} />
      )}
      <div className="st-copy" style={P ? { left: 90, top: 210, width: 900 } : { left: 150, top: 330, width: 680 }}>
        <div style={{ opacity: 1 - textOut }}>
          <Kicker o={prog(local, 0.15, 0.4)}>{g.cat}</Kicker>
          <div className="st-question" key={g.q + i}>
            <Words className="st-h-xxl" t={local} at={0.1} step={0.08} text={g.q} />
          </div>
          <div className="st-goods-name" style={{ opacity: prog(local, 0.5, 0.5) }}>{g.name}</div>
        </div>
      </div>
      {t >= 19.9 && (
        <div className="st-center" style={{ width: P ? 940 : 1600, textAlign: 'center' }}>
          <Words className="st-h-xl" t={t} at={20.1} text="You can sell it on E-MOORM." accent={[4, 5]} />
          <div className="st-cats" style={{ opacity: final * prog(t, 21.2, 0.8) }}>
            Fruits · Vegetables · Seafood · Local delicacies · Processed foods · Dried goods · Beverages · Handicrafts · Livestock
          </div>
        </div>
      )}
    </div>
  );
}

// ── 04 · Every kind of seller ─────────────────────────────────────────
const SELLERS = [
  { say: 'I grow vegetables.', who: 'Farmer', src: 'store-products', scroll: 120, focus: { x: 0, y: 452, w: 390, h: 133 } },
  { say: 'I cook local delicacies.', who: 'Home cook', src: 'form-ready', scroll: 0, focus: { x: 12, y: 140, w: 366, h: 200 } },
  { say: 'I sell fresh fruit.', who: 'Fruit grower', src: 'product-mango', scroll: 0, focus: null },
  { say: 'I raise livestock.', who: 'Livestock raiser', src: 'product-hens-rows', scroll: 0, focus: { x: 12, y: 90, w: 366, h: 230 } },
  { say: 'I make handmade products.', who: 'Craft maker', src: 'store', scroll: 160, focus: { x: 0, y: 418, w: 390, h: 150 } },
];
const STEP4 = 3.6;

export function Sellers({ t, P }) {
  const i = clamp(Math.floor(t / STEP4), 0, SELLERS.length - 1);
  const v = SELLERS[i];
  const local = t - i * STEP4;
  const prev = SELLERS[i - 1];
  const slide = i === 0 ? 1 : prog(local, 0, 0.6, ease.inOut);
  const phoneIn = prog(t, 0, 0.9, ease.outQuint);
  const leave = prog(t, 17.4, 0.6, ease.in);
  return (
    <div className="st-scene st-warm-2">
      <div className="st-copy" style={P ? { left: 90, top: 210, width: 900 } : { left: 160, top: 380, width: 900 }}>
        <div className="st-quote-mark" style={{ opacity: phoneIn * (1 - leave) }}>“</div>
        <div className="st-stack">
          <Words key={v.say} className="st-h-xl" t={local} at={0.15} out={STEP4 - 0.35} text={v.say} />
        </div>
        <div className="st-who" style={{ opacity: window2(local, 0.6, STEP4 - 0.4) * (1 - leave) }}>{v.who}</div>
      </div>
      <Phone
        src={v.src}
        from={prev && slide < 1 ? prev.src : null}
        mix={slide}
        scroll={mix(prev?.scroll ?? v.scroll, v.scroll, slide)}
        x={P ? 260 : 1190}
        y={(P ? 620 : 70) + (1 - phoneIn) * 200 + leave * 60}
        w={P ? 560 : 450}
        o={phoneIn * (1 - leave)}
        r={mix(-2, 2, (i % 2))}
      >
        {v.focus && <Focus o={window2(local, 0.9, STEP4 - 0.3)} {...v.focus} />}
      </Phone>
    </div>
  );
}

// ── 05 · How to start selling ─────────────────────────────────────────
const STEPS = [
  { n: '01', title: 'Create your account', line: 'Sign up with your name and email.', src: 'register', scroll: 0 },
  { n: '02', title: 'Become a seller', line: 'Tell us about your shop. Your municipal admin reviews it.', src: 'apply', scroll: 140 },
  { n: '03', title: 'Add your products', line: 'Answer a few easy questions for each one.', src: 'form-basics', scroll: 0 },
  { n: '04', title: 'Start selling', line: 'Your shop goes live for buyers near you.', src: 'store', scroll: 0 },
];
const STEP5 = 5.3;

export function Start({ t, P }) {
  const i = clamp(Math.floor((t - 0.4) / STEP5), 0, 3);
  const s = STEPS[i];
  const local = t - 0.4 - i * STEP5;
  const prev = STEPS[i - 1];
  const turn = i === 0 ? prog(t, 0.6, 0.8, ease.outQuint) : prog(local, 0.2, 0.7, ease.inOut);
  const phoneIn = prog(t, 0.2, 1.0, ease.outQuint);
  const leave = prog(t, 21.3, 0.7, ease.in);
  return (
    <div className="st-scene st-warm">
      <div className="st-copy" style={P ? { left: 90, top: 150, width: 900 } : { left: 160, top: 250, width: 900 }}>
        <Kicker o={prog(t, 0.3, 0.5) * (1 - leave)}>How to start selling</Kicker>
        <div className="st-number" style={{ opacity: 1 - leave }}>
          {prev && turn < 1 && <span style={{ transform: `translateY(${-turn * 100}%)`, opacity: 1 - turn }}>{prev.n}</span>}
          <span style={{ transform: `translateY(${(1 - turn) * 100}%)`, opacity: turn }}>{s.n}</span>
        </div>
        <div className="st-stack" style={{ opacity: 1 - leave }}>
          <Words key={s.title} className="st-h-lg" t={local} at={0.35} out={STEP5 - 0.3} text={s.title} />
        </div>
        <div className="st-line" style={{ opacity: window2(local, 0.8, STEP5 - 0.3) * (1 - leave) }}>{s.line}</div>
        <div className="st-dots" style={{ opacity: phoneIn * (1 - leave) }}>
          {STEPS.map((x, k) => <i key={x.n} className={k <= i ? 'is-on' : ''} style={{ width: k === i ? 54 : 18 }} />)}
        </div>
      </div>
      <Phone
        src={s.src}
        from={prev && turn < 1 ? prev.src : null}
        mix={turn}
        scroll={mix(prev?.scroll ?? s.scroll, s.scroll, turn)}
        x={P ? 260 : 1190}
        y={(P ? 680 : 70) + (1 - phoneIn) * 200}
        w={P ? 560 : 450}
        o={phoneIn * (1 - leave)}
        s={1 - leave * 0.06}
      />
    </div>
  );
}

// ── 06 · Adding a product ─────────────────────────────────────────────
// Where the Basics fields are on the captured form (page px).
const FIELDS = [
  { at: 2.6, label: 'Photo', box: { x: 12, y: 212, w: 124, h: 124 } },
  { at: 4.2, label: 'Name', box: { x: 12, y: 383, w: 366, h: 44 } },
  { at: 5.8, label: 'Category', box: { x: 12, y: 480, w: 366, h: 44 } },
  { at: 7.4, label: 'Price', box: { x: 12, y: 574, w: 366, h: 44 } },
  { at: 9.0, label: 'Description', box: { x: 12, y: 668, w: 366, h: 104 } },
];
const KINDS = [
  { src: 'form-details', label: 'Packed or regular product', sub: 'Stock and size' },
  { src: 'form-ready', label: 'Ready to eat today', sub: 'Servings, cooking time, order cut-off' },
  { src: 'form-animal', label: 'Live animal', sub: 'Animal, age, sex, weight, heads' },
];

export function AddProduct({ t, P }) {
  const intro = prog(t, 0.1, 1.0, ease.outQuint);
  const toDetails = prog(t, 11.0, 0.7, ease.inOut);
  const fan = prog(t, 14.4, 1.1, ease.inOut);
  const toReview = prog(t, 21.2, 1.0, ease.inOut);
  const done = prog(t, 25.4, 0.6, ease.back);
  const active = FIELDS.findIndex((f, k) => t >= f.at - 0.2 && (k === FIELDS.length - 1 ? t < 10.6 : t < FIELDS[k + 1].at - 0.2));
  const W = P ? 1080 : 1920;
  const pw = P ? 520 : 450;
  const cx = W / 2 - pw / 2;
  const single = !P ? { x: 1170, y: 70 } : { x: cx, y: 600 };
  return (
    <div className="st-scene st-warm-2">
      {/* Basics, then details: one phone. */}
      {fan < 1 && (
        <Phone
          src={toDetails > 0 ? 'form-details' : 'form-basics'}
          from={toDetails > 0 && toDetails < 1 ? 'form-basics' : null}
          mix={toDetails}
          x={mix(single.x, cx, fan)}
          y={single.y + (1 - intro) * 200}
          w={pw}
          o={intro * (1 - fan)}
        >
          {t < 10.8 && FIELDS.map((f, k) => <Focus key={f.label} o={k === active ? 1 : 0} {...f.box} r={14} />)}
          {FIELDS.map((f) => <Tap key={f.label} t={t} at={f.at} x={f.box.x + Math.min(f.box.w, 160) / 2 + 20} y={f.box.y + f.box.h / 2} />)}
          <Tap t={t} at={10.8} x={280} y={809} />
        </Phone>
      )}
      {/* The form adapts: three kinds side by side. */}
      {fan > 0 && toReview < 1 && KINDS.map((k, n) => {
        const off = P ? 0 : (n - 1) * 470;
        const offY = P ? (n - 1) * 0 : 0;
        const show = P ? (t < 16.8 ? n === 0 : t < 19 ? n === 1 : n === 2) : true;
        const pPhone = P ? prog(t, n === 0 ? 14.4 : n === 1 ? 16.8 : 19, 0.6, ease.inOut) : fan;
        return (
          <div key={k.src} style={{ opacity: (show ? pPhone : 0) * (1 - toReview) }}>
            <Phone src={k.src} x={(P ? cx : 960 - 190) + off * fan} y={(P ? 520 : 140) + offY} w={P ? 520 : 380} r={P ? 0 : (n - 1) * 2 * fan} s={P ? 1 : mix(1, 0.92, fan)} />
            <div className="st-kind-label" style={{ left: (P ? 540 : 960) + off * fan * (P ? 0 : 1), top: P ? 1680 : 960, opacity: prog(t, 15.2 + n * 0.3, 0.5) }}>
              <strong>{k.label}</strong>
              <span>{k.sub}</span>
            </div>
          </div>
        );
      })}
      {toReview > 0 && (
        <Phone src="form-review" x={single.x} y={single.y + (1 - toReview) * 120} w={pw} o={toReview}>
          <Tap t={t} at={24.6} x={300} y={808} />
          {done > 0 && (
            <span className="st-done" style={{ left: 120, top: 300, transform: `scale(${done})`, opacity: clamp(done) }}>
              <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <b>Listed!</b>
            </span>
          )}
        </Phone>
      )}
      {/* Copy. */}
      <div className="st-copy" style={P ? { left: 90, top: 170, width: 900 } : { left: 160, top: 280, width: 860 }}>
        <div style={{ opacity: 1 - fan }}>
          <Kicker o={intro}>Adding a product</Kicker>
          <div className="st-stack">
            <Words className="st-h-lg" t={t} at={0.4} out={13.8} text="Start with the basics." />
          </div>
          {!P && (
            <ol className="st-fields" style={{ opacity: prog(t, 1.2, 0.6) * (1 - prog(t, 13.6, 0.5)) }}>
              {[...FIELDS.map((f) => f.label), 'Stock', 'Pickup or delivery'].map((l, k) => (
                <li key={l} className={(k < 5 && k === active) || (k >= 5 && t >= 11.6 && t < 14) ? 'is-on' : k < 5 && active > k ? 'is-done' : ''}>{l}</li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {fan > 0 && toReview < 1 && (
        <div className="st-top-title" style={{ top: P ? 160 : 40, opacity: prog(t, 14.6, 0.6) * (1 - toReview) }}>
          <Words className="st-h-md" t={t} at={14.6} text="The form changes with what you sell." accent={[1, 2]} />
        </div>
      )}
      {toReview > 0 && (
        <div className="st-copy" style={P ? { left: 90, top: 210, width: 900 } : { left: 160, top: 380, width: 900 }}>
          <Kicker o={prog(t, 21.6, 0.5)}>Review, then add it</Kicker>
          <Words className="st-h-lg" t={t} at={22.0} text="E-MOORM makes listing your products easier." accent={[2]} />
        </div>
      )}
    </div>
  );
}

// ── 07 · From listing to customer ─────────────────────────────────────
const JOURNEY = ['Your listing', 'In the marketplace', 'A buyer finds it', 'Adds to cart', 'Checks out', 'Order placed'];

export function Journey({ t, P }) {
  const stage = t < 3.4 ? 0 : t < 6.2 ? 1 : t < 9.4 ? 2 : t < 12.6 ? 3 : t < 15.8 ? 4 : 5;
  const travel = prog(t, 3.4, 1.4, ease.inOut);
  const sellerOut = prog(t, 4.4, 0.7, ease.in);
  const center = prog(t, 4.8, 1.0, ease.inOut);
  const pw = P ? 540 : 450;
  const buyerX = P ? 270 : mix(1250, 735, center);
  const buyerY = P ? 640 : 120;
  const sellerX = P ? 270 : 260;
  const screen = t < 6.6 ? 'store-products' : t < 9.8 ? 'product-mango' : t < 13 ? 'cart' : t < 16.2 ? 'checkout' : 'orders';
  const prevScreen = t < 6.6 ? null : t < 9.8 ? 'store-products' : t < 13 ? 'product-mango' : t < 16.2 ? 'cart' : 'checkout';
  const changeAt = t < 9.8 ? 6.6 : t < 13 ? 9.8 : t < 16.2 ? 13 : 16.2;
  const m = prevScreen ? prog(t, changeAt, 0.45, ease.inOut) : 1;
  // The mango tile: from the seller's phone into the marketplace row.
  const from = { x: sellerX + 40, y: (P ? 900 : 420) };
  const to = { x: buyerX + 24, y: buyerY + 24 + (717 / PAGE_W) * (pw - 26) };
  const tileX = mix(from.x, to.x, travel);
  const tileY = mix(from.y, to.y, travel) - Math.sin(travel * Math.PI) * 140;
  const tileS = mix(1, 0.55, travel);
  const speed = travel > 0 && travel < 1 ? Math.abs(Math.cos(travel * Math.PI)) * 0.2 + 0.05 : 0;
  const placed = prog(t, 17.2, 0.6, ease.back);
  return (
    <div className="st-scene st-warm">
      {/* Seller side. */}
      {!P || t < 5 ? (
        <Phone src="seller-products" x={sellerX} y={(P ? 640 : 120) + sellerOut * 40} w={pw} o={prog(t, 0.1, 0.8) * (1 - sellerOut)} r={-2} />
      ) : null}
      {/* Buyer side. */}
      <Phone
        src={screen}
        from={prevScreen}
        mix={m}
        x={buyerX}
        y={buyerY + (1 - prog(t, 2.6, 1.0, ease.outQuint)) * 160}
        w={pw}
        o={P ? prog(t, 4.6, 0.6) : prog(t, 2.6, 0.8)}
      >
        <Tap t={t} at={6.2} x={70} y={1237 - 520 + 60} />
        <Tap t={t} at={9.4} x={156} y={812} />
        <Tap t={t} at={12.6} x={309} y={745} />
        <Tap t={t} at={15.8} x={195} y={809} />
        {placed > 0 && (
          <span className="st-done" style={{ left: 120, top: 330, transform: `scale(${placed})`, opacity: clamp(placed) }}>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <b>Order placed</b>
          </span>
        )}
      </Phone>
      {/* The product travelling across. */}
      {t > 0.8 && t < 5.2 && (
        <div className="st-tile" style={{ left: tileX, top: tileY, transform: `scale(${tileS * (1 - prog(t, 4.6, 0.5))})`, filter: speed > 0.08 ? `blur(${(speed * 10).toFixed(1)}px)` : 'none', opacity: prog(t, 0.9, 0.4) }}>
          <img src={SHOT('photo-mango')} alt="" />
          <div>
            <strong>Carabao Mangoes (1 kg)</strong>
            <span>₱180.00</span>
            <em style={{ opacity: prog(t, 1.6, 0.4) }}>Live</em>
          </div>
        </div>
      )}
      {/* The path, step by step. */}
      <div className="st-path" style={P ? { left: 60, right: 60, top: 220 } : { left: 160, right: 160, top: 34 }}>
        {JOURNEY.map((label, k) => (
          <span key={label} className={k === stage ? 'is-on' : k < stage ? 'is-done' : ''} style={{ opacity: prog(t, 0.3 + k * 0.08, 0.5) }}>{label}</span>
        ))}
      </div>
      {!P && (
        <div className="st-copy" style={{ left: mix(820, 1280, center), top: 420, width: 520, opacity: prog(t, 6.0, 0.6) }}>
          <Words key={JOURNEY[stage]} className="st-h-md" t={t} at={stage < 2 ? 6.0 : [0, 0, 6.4, 9.6, 12.8, 16.0][stage]} text={JOURNEY[Math.max(2, stage)]} />
        </div>
      )}
      {!P && t < 4.8 && (
        <div className="st-copy" style={{ left: 760, top: 430, width: 380, opacity: window2(t, 0.6, 3.9) }}>
          <Words className="st-h-md" t={t} at={0.7} text="You publish it." />
        </div>
      )}
    </div>
  );
}

// ── 08 · Local discovery ──────────────────────────────────────────────
const PLACES = [
  { at: 0.2, text: 'Oriental Mindoro', screen: 'live-municipals' },
  { at: 2.0, text: 'Bongabong', screen: 'live-stores' },
  { at: 3.8, text: 'Poblacion', screen: 'live-stores' },
  { at: 5.6, text: "Aling Rosa's Farm", screen: 'store' },
  { at: 7.4, text: 'Carabao mangoes', screen: 'product-mango' },
];

export function Local({ t, P }) {
  const k = PLACES.reduce((acc, p, i) => (t >= p.at ? i : acc), 0);
  const prev = PLACES[k - 1];
  const m = k === 0 ? 1 : prog(t, PLACES[k].at, 0.5, ease.inOut);
  const leave = prog(t, 11.4, 0.6, ease.in);
  const statement = prog(t, 8.8, 0.6);
  return (
    <div className="st-scene st-green">
      <div className="st-map-lines" style={{ transform: tf({ x: -t * 8, s: 1.05 }) }} />
      <div className="st-copy" style={P ? { left: 90, top: 200, width: 900 } : { left: 160, top: 300, width: 940 }}>
        <Kicker o={prog(t, 0.1, 0.5) * (1 - leave)} style={{ color: '#bbf7d0' }}>Local discovery</Kicker>
        <div className="st-crumbs" style={{ opacity: 1 - statement * 0.65 - leave }}>
          {PLACES.map((p, i) => (
            <div key={p.text} className={`st-crumb${i === k ? ' is-on' : ''}`} style={{ opacity: i > k ? 0 : i === k ? prog(t, p.at, 0.5) : 0.45, transform: `translateX(${(1 - prog(t, p.at, 0.6, ease.outQuint)) * 40 + i * (P ? 22 : 34)}px)` }}>
              <i />{p.text}
            </div>
          ))}
        </div>
        <div className="st-local-line" style={{ opacity: statement * (1 - leave) }}>
          <Words className="st-h-md st-white" t={t} at={8.9} text="Help customers discover products from their own communities." accent={[4, 5, 6, 7]} />
        </div>
      </div>
      <Phone
        src={PLACES[k].screen}
        from={prev && prev.screen !== PLACES[k].screen && m < 1 ? prev.screen : null}
        mix={m}
        x={P ? 280 : 1230}
        y={(P ? 760 : 70) + (1 - prog(t, 0, 0.9, ease.outQuint)) * 200}
        w={P ? 520 : 450}
        o={prog(t, 0, 0.8) * (1 - leave)}
        shadow={1.4}
      />
    </div>
  );
}

// ── 09 · Your product is online ───────────────────────────────────────
export function Success({ t, P }) {
  const screen = t < 4.4 ? 'store' : t < 7.6 ? 'seller-notifications' : 'seller-orders';
  const prev = t < 4.4 ? null : t < 7.6 ? 'store' : 'seller-notifications';
  const m = prev ? prog(t, t < 7.6 ? 4.4 : 7.6, 0.5, ease.inOut) : 1;
  const ping = prog(t, 4.6, 0.5, ease.back);
  const leave = prog(t, 11.4, 0.6, ease.in);
  return (
    <div className="st-scene st-warm">
      <div className="st-glow st-glow-big" style={{ left: P ? 100 : 400, top: P ? 300 : -100, opacity: 0.8 }} />
      <Phone
        src={screen}
        from={prev}
        mix={m}
        x={P ? 280 : 1190}
        y={(P ? 700 : 70) + (1 - prog(t, 0, 0.9, ease.outQuint)) * 180}
        w={P ? 520 : 450}
        o={prog(t, 0, 0.7) * (1 - leave)}
      >
        {t > 4.4 && t < 7.8 && <Focus o={ping} x={8} y={92} w={374} h={92} r={14} />}
        <Tap t={t} at={7.6} x={287} y={407} />
      </Phone>
      {t > 4.5 && t < 7.8 && (
        <div className="st-bell" style={P ? { left: 700, top: 640 } : { left: 1560, top: 90 }}>
          <span style={{ transform: `scale(${ping}) rotate(${Math.sin(t * 18) * 12 * (1 - prog(t, 5.2, 0.8))}deg)` }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
          </span>
        </div>
      )}
      <div className="st-copy st-swap" style={P ? { left: 90, top: 200, width: 900 } : { left: 160, top: 360, width: 920 }}>
        <div className="st-stack" style={{ opacity: 1 - leave }}>
          <Words className="st-h-xl" t={t} at={0.3} out={4.0} text="Your product is now online." accent={[3, 4]} />
        </div>
        <div className="st-stack" style={{ opacity: 1 - leave }}>
          <Words className="st-h-lg" t={t} at={4.6} out={7.8} text="An order arrives." />
        </div>
        <div className="st-stack" style={{ opacity: 1 - leave }}>
          <Words className="st-h-lg" t={t} at={8.2} text="Your next customer could be closer than you think." accent={[6, 7]} />
        </div>
      </div>
    </div>
  );
}

// ── 10 · Sell it on E-MOORM ───────────────────────────────────────────
const WALL = [SHOT('photo-mango'), SHOT('photo-vegetables'), ASSET('fruits.jpg'), SHOT('photo-shrimp'), SHOT('photo-hens'), ASSET('handicrafts.jpg'), SHOT('photo-onions'), ASSET('seafood.jpg'), SHOT('photo-seafood'), ASSET('vegetables.jpg'), ASSET('wellness.jpg'), SHOT('photo-mango')];

export function Cta({ t, P, onStart }) {
  const cols = P ? 3 : 6;
  const wallDim = prog(t, 0.4, 1.6, ease.inOut);
  const logo = prog(t, 8.6, 0.9, ease.back);
  const cta = prog(t, 11.6, 0.7, ease.back);
  return (
    <div className="st-scene st-dark">
      <div className="st-wall" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, opacity: mix(1, t < 4 ? 0.42 : mix(0.42, 0.18, prog(t, 4, 1)), wallDim), transform: `scale(${mix(1.08, 1.0, prog(t, 0, 4, ease.out))})` }}>
        {[...WALL, ...WALL].slice(0, cols * (P ? 6 : 3)).map((src, i) => (
          <div key={i} className="st-wall-cell" style={{ transform: `translateY(${(i % 2 ? -1 : 1) * (t * 6) % 40}px)` }}>
            <img src={src} alt="" />
          </div>
        ))}
      </div>
      <div className="st-shade st-shade-soft" style={{ opacity: mix(0.35, 0.6, wallDim) }} />
      <div className="st-center" style={{ width: P ? 940 : 1500, textAlign: 'center' }}>
        <div className="st-stack" style={{ minHeight: P ? 150 : 140 }}>
          <Words className="st-h-xl st-white" t={t} at={1.0} out={8.2} text="Have something to sell?" />
        </div>
        <div className="st-stack" style={{ minHeight: P ? 150 : 140 }}>
          <Words className="st-h-xl st-white" t={t} at={4.4} out={8.2} text="Sell it on E-MOORM." accent={[3]} />
        </div>
      </div>
      {logo > 0 && (
        <div className="st-end">
          <img src="/brand-icon.png" alt="" style={{ width: P ? 200 : 170, transform: `scale(${logo})`, opacity: clamp(logo) }} />
          <div className="st-end-word" style={{ opacity: prog(t, 8.9, 0.5), transform: `translateY(${(1 - prog(t, 8.9, 0.7, ease.outQuint)) * 30}px)` }}>E-MOORM</div>
          <div className="st-end-tag" style={{ opacity: prog(t, 9.6, 0.6) }}>
            <Words t={t} at={9.6} text="Grow local. Sell local." />
          </div>
          <button type="button" className="st-cta" onClick={onStart} style={{ opacity: clamp(cta), transform: `scale(${mix(0.85, 1, cta)})`, pointerEvents: cta > 0.5 ? 'auto' : 'none' }}>
            Start Selling on E-MOORM
          </button>
        </div>
      )}
    </div>
  );
}
