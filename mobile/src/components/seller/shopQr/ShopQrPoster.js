import { forwardRef, memo, useId, useMemo } from 'react';
import Svg, {
  Circle, ClipPath, Defs, G, Image as SvgImage, LinearGradient, Path, Rect, Stop, Text as SvgText, parse,
} from 'react-native-svg';
import { create as createQr } from 'qrcode/lib/core/qrcode';
import { fontFamily } from '../../../theme';
import { BRAND_GREEN, BRAND_VIEWBOX, BRAND_WHITE, DM_SANS } from './posterData';
import {
  CAP, FOOT, LINK, MID, NAME_W, NAME_WEIGHT, POSTER_H, POSTER_W, SCAN,
  fitText, layoutName, posterLayout, qrRuns, templateOf,
} from './shopQrTemplates';

export { DEFAULT_TEMPLATE, POSTER_H, POSTER_W, TEMPLATES } from './shopQrTemplates';

/*
 * The Shop QR poster (web/src/lib/shopQrPoster.js, drawn here with
 * react-native-svg): 1240 × 1748 (A6 at 300 dpi). The screen shows it scaled
 * to fit and turns it into a PNG at full size with the Svg's toDataURL.
 *
 * The designs (Minimal, Green, Night, Cream, Split, Sunny), their layout and
 * their graphics come from shopQrTemplates.js, an identical copy of the
 * website's file, so both draw the same posters: this file only turns the
 * layout and its plain shapes into Svg elements.
 *
 * Text widths come from DM Sans advance widths measured in a browser
 * (posterData.js), not measureText, so names fit the way the website's do.
 */

/** The public site. A QR must open the real shop wherever the app was pointed. */
export const SITE_ORIGIN = 'https://emoorm.shop';
export const shopQrUrl = (slug) => `${SITE_ORIGIN}/store/${encodeURIComponent(slug)}`;
export const shopQrLabel = (slug) => shopQrUrl(slug).replace(/^https?:\/\//, '').replace(/^www\./, '');

const FAMILY = { 500: fontFamily.medium, 700: fontFamily.bold };

/** The code's modules: { size, cells } with cells[y * size + x] = 1 for dark. Error correction H. */
export function qrMatrix(text) {
  const { modules } = createQr(text, { errorCorrectionLevel: 'H' });
  const cells = new Uint8Array(modules.size * modules.size);
  for (let i = 0; i < cells.length; i += 1) cells[i] = modules.data[i] ? 1 : 0;
  return { size: modules.size, cells };
}

// ── Text widths (DM Sans, as the website's canvas measures them) ──────────
const plain = (text) => {
  const s = String(text);
  return typeof s.normalize === 'function' ? s.normalize('NFD') : s;
};

export function textWidth(text, weight, size, spacing = 0) {
  const table = DM_SANS[weight] || DM_SANS[500];
  let w = 0;
  let n = 0;
  for (const ch of plain(text)) {
    const c = ch.charCodeAt(0);
    if (c >= 0x300 && c < 0x370) continue; // accents ride on the letter before
    w += c >= 32 && c < 127 ? table[c - 32] : 620;
    n += 1;
  }
  return (w * size) / 1000 + spacing * n;
}

// The E-MOORM marks, parsed once (posterData.js holds the website's SVGs).
const [VB_X, VB_Y, VB_W] = BRAND_VIEWBOX.split(/\s+/).map(Number);
const marks = {};
const brandMark = (variant) => {
  if (marks[variant] === undefined) {
    try {
      marks[variant] = parse(variant === 'white' ? BRAND_WHITE : BRAND_GREEN)?.children || false;
    } catch {
      marks[variant] = false;
    }
  }
  return marks[variant] || null;
};

function Mark({ x, y, size, variant = 'green' }) {
  const children = brandMark(variant);
  if (!children) return null;
  return <G transform={`translate(${x} ${y}) scale(${size / VB_W}) translate(${-VB_X} ${-VB_Y})`}>{children}</G>;
}

/** The QR's dark modules as one path, run by run (finder eyes and the logo hole left out). */
function qrPath(matrix, { m, qx, qy, hole }) {
  // Half a pixel down so rows join without a hairline when scaled.
  return qrRuns(matrix, hole)
    .map(([x, y, len]) => `M${qx + x * m} ${qy + y * m}h${len * m}v${m + 0.5}h${-len * m}z`)
    .join('');
}

/** One of the layout's plain shapes (shopQrTemplates.js) as an Svg element. */
function Shape({ s }) {
  const paint = {
    fill: s.fill || 'none',
    ...(s.stroke ? { stroke: s.stroke, strokeWidth: s.sw || 1 } : null),
  };
  if (s.t === 'rect') return <Rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r || 0} ry={s.r || 0} {...paint} />;
  if (s.t === 'circle') return <Circle cx={s.cx} cy={s.cy} r={s.r} {...paint} />;
  if (s.t === 'path') return <Path d={s.d} {...paint} strokeLinecap={s.cap || 'butt'} />;
  if (s.t === 'text') {
    return (
      <SvgText x={s.x} y={s.y} textAnchor="middle" fontFamily={FAMILY[s.weight] || fontFamily.bold} fontSize={s.size} fill={s.fill}>
        {s.text}
      </SvgText>
    );
  }
  return null;
}

/**
 * The poster. Props: name, town (not drawn; kept for callers), slug,
 * template (a design's key; Minimal when left out), logoUri (a data: or
 * file: URI, or null for the initial), width (on screen), onLogoLoad. The
 * ref is the Svg (ref.current.toDataURL(cb, { width: 1240, height: 1748 })).
 */
const ShopQrPoster = forwardRef(function ShopQrPoster({
  name, slug, template, logoUri, width, onLogoLoad,
}, ref) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tpl = templateOf(template);
  const url = shopQrUrl(slug);
  const label = shopQrLabel(slug);
  const matrix = useMemo(() => qrMatrix(url), [url]);
  const L = useMemo(
    () => posterLayout(layoutName((t, s) => textWidth(t, NAME_WEIGHT, s), name), matrix.size, tpl),
    [name, matrix, tpl],
  );
  const d = useMemo(() => qrPath(matrix, L.qr), [matrix, L]);
  const link = fitText((t, s) => textWidth(t, LINK.weight, s), label, LINK.size, LINK.min, NAME_W);
  const letter = (Array.from(String(name || '').trim())[0] || 'S').toUpperCase();
  const height = (width * POSTER_H) / POSTER_W;
  const { color } = tpl;
  const { cx, cy, r } = L.logo;
  const { n, m, qx, qy, hole } = L.qr;
  const hs = hole.k * m;
  const b = hs * 0.74;
  const hx = qx + hole.from * m;
  const hy = qy + hole.from * m;
  const clipId = `sqLogo${uid}`;
  const bgId = `sqBg${uid}`;

  // The foot: the mark and E-MOORM, centred together.
  const footW = FOOT.mark + FOOT.gap + textWidth(FOOT.text, FOOT.weight, FOOT.size);
  const footLeft = MID - footW / 2;

  return (
    <Svg ref={ref} width={width} height={height} viewBox={`0 0 ${POSTER_W} ${POSTER_H}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Circle cx={cx} cy={cy} r={r} />
        </ClipPath>
        {tpl.bgTo ? (
          <LinearGradient id={bgId} x1="0" y1="0" x2="0" y2={POSTER_H} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={tpl.bg} />
            <Stop offset="1" stopColor={tpl.bgTo} />
          </LinearGradient>
        ) : null}
      </Defs>

      <Rect x="0" y="0" width={POSTER_W} height={POSTER_H} fill={tpl.bgTo ? `url(#${bgId})` : tpl.bg} />

      {/* The design's graphics, the code's tile last. */}
      {L.shapes.map((s, i) => <Shape key={`s${i}`} s={s} />)}

      {/* The shop's round logo with a ring, or its initial in a circle. */}
      {logoUri ? (
        <>
          <Circle cx={cx} cy={cy} r={r} fill="#FFFFFF" />
          <SvgImage
            href={{ uri: logoUri }}
            x={cx - r}
            y={cy - r}
            width={2 * r}
            height={2 * r}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
            onLoad={onLogoLoad}
          />
          <Circle cx={cx} cy={cy} r={r} fill="none" stroke={color.ring} strokeWidth={color.ringW} />
        </>
      ) : (
        <>
          <Circle cx={cx} cy={cy} r={r} fill={color.soft} />
          <SvgText x={cx} y={cy + Math.round((96 * CAP) / 2)} textAnchor="middle" fontFamily={fontFamily.bold} fontSize="96" fill={color.letter}>
            {letter}
          </SvgText>
        </>
      )}

      {/* The name. */}
      {L.name.lines.map((line, i) => (
        <SvgText
          key={`n${i}`}
          x={MID}
          y={L.name.y + i * L.name.lineH}
          textAnchor="middle"
          fontFamily={fontFamily.bold}
          fontSize={L.name.size}
          fill={color.name}
        >
          {line}
        </SvgText>
      ))}

      {/* The code: square modules and softly rounded eyes in one ink, the mark in the middle. */}
      <Path d={d} fill={color.qr} />
      {[[0, 0], [n - 7, 0], [0, n - 7]].map(([fx, fy]) => {
        const ex = qx + fx * m;
        const ey = qy + fy * m;
        return (
          <G key={`f${fx}-${fy}`}>
            <Rect x={ex} y={ey} width={7 * m} height={7 * m} rx={1.9 * m} fill={color.qr} />
            <Rect x={ex + m} y={ey + m} width={5 * m} height={5 * m} rx={1.2 * m} fill={L.paper} />
            <Rect x={ex + 2 * m} y={ey + 2 * m} width={3 * m} height={3 * m} rx={0.8 * m} fill={color.qr} />
          </G>
        );
      })}
      <Mark x={hx + (hs - b) / 2} y={hy + (hs - b) / 2} size={b} />

      {/* Scan to visit our shop, the link, and the E-MOORM foot. */}
      <SvgText x={MID} y={L.scanY} textAnchor="middle" fontFamily={FAMILY[SCAN.weight]} fontSize={SCAN.size} fill={color.scan}>
        {SCAN.text}
      </SvgText>
      <SvgText x={MID} y={L.linkY} textAnchor="middle" fontFamily={FAMILY[LINK.weight]} fontSize={link.size} fill={color.link}>
        {link.text}
      </SvgText>
      <Mark x={footLeft} y={L.footCy - FOOT.mark / 2} size={FOOT.mark} variant={tpl.marks.foot} />
      <SvgText
        x={footLeft + FOOT.mark + FOOT.gap}
        y={Math.round(L.footCy + (FOOT.size * CAP) / 2)}
        fontFamily={FAMILY[FOOT.weight]}
        fontSize={FOOT.size}
        fill={color.foot}
      >
        {FOOT.text}
      </SvgText>
    </Svg>
  );
});

export default memo(ShopQrPoster);
