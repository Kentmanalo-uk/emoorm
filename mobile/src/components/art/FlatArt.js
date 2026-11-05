import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';

/**
 * The twenty marks on the home shortcuts.
 *
 * Their own SVG, drawn here: nothing in this file comes from the app's
 * icon set, which is a line set and reads as a toolbar. A row of
 * shortcuts is meant to be found by colour before it is read.
 *
 * The rule, taken from the reference and applied to all twenty:
 *
 *   one hue per mark, in two values -- a pale TINT for the part facing
 *   you or catching the light, a stronger DEEP for the body -- and white
 *   used only for the glyph inside. No third colour, no outline, no
 *   gradient, no shadow.
 *
 * Two values is what separates this from a flat silhouette: the lid of a
 * box, the lit side of a pin, the near face of a die. It gives depth
 * without a gradient, which is the whole trick of the style.
 *
 * Both values stay legible on the dark page as well as the white one --
 * the tints are bright enough to show on #15181D, and the deeps are kept
 * at the middle of each ramp rather than the dark end. White inside a
 * filled shape is white whatever is behind it.
 *
 * Everything is on a 48 x 48 grid.
 */

const box = (size) => ({ width: size, height: size, viewBox: '0 0 48 48' });
const CUT = '#FFFFFF';

/* Each pair is [tint, deep] of a single hue. */
const ORANGE = ['#FDBA74', '#F97316'];
const PINK = ['#F9A8D4', '#EC4899'];
const RED = ['#FCA5A5', '#EF4444'];
const VIOLET = ['#C4B5FD', '#8B5CF6'];
const SKY = ['#7DD3FC', '#0EA5E9'];
const BLUE = ['#93C5FD', '#3B82F6'];
const GREEN = ['#6EE7B7', '#10B981'];
const EMERALD = ['#6EE7B7', '#059669'];
const ROSE = ['#FDA4AF', '#F43F5E'];
const AMBER = ['#FCD34D', '#F59E0B'];
const TEAL = ['#5EEAD4', '#0D9488'];

/** The pairs by name, for callers that want a mark in a different hue. */
export const TONES = {
  orange: ORANGE, pink: PINK, red: RED, violet: VIOLET, sky: SKY,
  blue: BLUE, green: GREEN, emerald: EMERALD, rose: ROSE, amber: AMBER, teal: TEAL,
};

/** Today's Menu: a pot, lid catching the light, a fork and spoon on it. */
export function PotArt({ size = 34, tone }) {
  const [tint, deep] = tone || ORANGE;
  return (
    <Svg {...box(size)}>
      <G fill="none" stroke={tint} strokeWidth="3" strokeLinecap="round">
        <Path d="M17 11c0-3 3-3.5 3-6.5" />
        <Path d="M24 10c0-3 3-3.5 3-6.5" />
        <Path d="M31 11c0-3 3-3.5 3-6.5" />
      </G>
      <Rect x="3" y="24" width="7" height="9" rx="3.5" fill={deep} />
      <Rect x="38" y="24" width="7" height="9" rx="3.5" fill={deep} />
      <Path d="M7 21h34v13a8 8 0 0 1-8 8H15a8 8 0 0 1-8-8z" fill={deep} />
      <Rect x="5" y="15" width="38" height="7" rx="3.5" fill={tint} />
      <Circle cx="24" cy="12" r="3.4" fill={tint} />
      <G fill={CUT}>
        <Rect x="17.6" y="26" width="2.8" height="12" rx="1.4" />
        <Rect x="15" y="26" width="2.2" height="6" rx="1.1" />
        <Rect x="20.8" y="26" width="2.2" height="6" rx="1.1" />
        <Path d="M28 26h3.4a2.6 2.6 0 0 1 2.6 2.6v3.4a2.6 2.6 0 0 1-2.6 2.6h-.7v3.9a1.65 1.65 0 0 1-3.3 0z" />
      </G>
    </Svg>
  );
}

/** New Arrivals: a sparkle, its two smaller ones in the paler pink. */
export function SparkArt({ size = 34, tone }) {
  const [tint, deep] = tone || PINK;
  // Four points pulled in towards the middle: each arm is one quadratic
  // curve bending through the centre, which gives a sparkle its waist.
  const star = (cx, cy, r) => [
    `M${cx} ${cy - r}`,
    `Q${cx} ${cy} ${cx + r} ${cy}`,
    `Q${cx} ${cy} ${cx} ${cy + r}`,
    `Q${cx} ${cy} ${cx - r} ${cy}`,
    `Q${cx} ${cy} ${cx} ${cy - r}`,
    'Z',
  ].join(' ');
  return (
    <Svg {...box(size)}>
      <Path d={star(20, 20, 17)} fill={deep} />
      <Path d={star(37, 34, 9.5)} fill={tint} />
      <Path d={star(10, 38, 7)} fill={tint} />
    </Svg>
  );
}

/** Best Sellers: a chart whose bars climb. */
export function TrendArt({ size = 34, tone }) {
  const [tint, deep] = tone || RED;
  return (
    <Svg {...box(size)}>
      <Rect x="3" y="4" width="42" height="40" rx="10" fill={deep} />
      <G fill={tint}>
        <Rect x="10" y="26" width="6.5" height="11" rx="2.6" />
        <Rect x="20.75" y="21" width="6.5" height="16" rx="2.6" />
        <Rect x="31.5" y="15" width="6.5" height="22" rx="2.6" />
      </G>
      <Path d="M11 20l9.5-6.5 6.5 4 9.5-7.5" stroke={CUT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Polygon points="39,7 39,16 30.5,11" fill={CUT} />
    </Svg>
  );
}

/** Budget Finds: a piggy bank taking a coin. */
export function PiggyArt({ size = 34, tone }) {
  const [tint, deep] = tone || VIOLET;
  return (
    <Svg {...box(size)}>
      {/* The coin, the ear and the snout all have to break the body's
          outline to be seen at all -- tucked inside it they read as one
          lump. The ear clears the back, the snout clears the right. */}
      <Circle cx="23" cy="7" r="5.5" fill={deep} />
      <Rect x="20.2" y="5.7" width="5.6" height="2.6" rx="1.3" fill={CUT} />
      <G fill={deep}>
        <Rect x="11" y="33" width="6" height="9.5" rx="3" />
        <Rect x="28" y="33" width="6" height="9.5" rx="3" />
        <Polygon points="7.5,9.5 20,16 9.5,23.5" />
        <Ellipse cx="40" cy="28" rx="6" ry="5" />
      </G>
      <Ellipse cx="22.5" cy="28" rx="17" ry="13" fill={tint} />
      <G fill={CUT}>
        <Rect x="17" y="19.5" width="11.5" height="3.2" rx="1.6" />
        <Circle cx="14.5" cy="26" r="2.4" />
        <Circle cx="39" cy="26.5" r="1.5" />
        <Circle cx="41.8" cy="29.2" r="1.5" />
      </G>
    </Svg>
  );
}

/** All Products: four tiles, two of each tone. */
export function GridArt({ size = 34, tone }) {
  const [tint, deep] = tone || SKY;
  return (
    <Svg {...box(size)}>
      <Rect x="4" y="4" width="18.5" height="18.5" rx="5.5" fill={deep} />
      <Rect x="25.5" y="4" width="18.5" height="18.5" rx="5.5" fill={tint} />
      <Rect x="4" y="25.5" width="18.5" height="18.5" rx="5.5" fill={tint} />
      <Rect x="25.5" y="25.5" width="18.5" height="18.5" rx="5.5" fill={deep} />
    </Svg>
  );
}

/** Municipals: two blocks of a town, the nearer one deeper. */
export function TownArt({ size = 34, tone }) {
  const [tint, deep] = tone || GREEN;
  return (
    <Svg {...box(size)}>
      <Rect x="4" y="8" width="20" height="35" rx="4" fill={tint} />
      <Rect x="25" y="18" width="19" height="25" rx="4" fill={deep} />
      <G fill={CUT}>
        <Rect x="8.5" y="13" width="4.6" height="4.6" rx="1.4" />
        <Rect x="15.5" y="13" width="4.6" height="4.6" rx="1.4" />
        <Rect x="8.5" y="21.5" width="4.6" height="4.6" rx="1.4" />
        <Rect x="15.5" y="21.5" width="4.6" height="4.6" rx="1.4" />
        <Rect x="11.5" y="31" width="5.5" height="12" rx="1.8" />
        <Rect x="29" y="24" width="4.4" height="4.4" rx="1.3" />
        <Rect x="35.5" y="24" width="4.4" height="4.4" rx="1.3" />
        <Rect x="29" y="32.5" width="4.4" height="4.4" rx="1.3" />
        <Rect x="35.5" y="32.5" width="4.4" height="4.4" rx="1.3" />
      </G>
    </Svg>
  );
}

/** Store Map: a folded map, the middle panel turned away. */
export function MapArt({ size = 34, tone }) {
  const [tint, deep] = tone || BLUE;
  return (
    <Svg {...box(size)}>
      <Polygon points="3,11 17,6 17,37 3,42" fill={tint} />
      <Polygon points="31,11 45,6 45,37 31,42" fill={tint} />
      <Polygon points="17,6 31,11 31,42 17,37" fill={deep} />
      <Path d="M24 13.5a7.8 7.8 0 0 1 7.8 7.8c0 5.6-7.8 13-7.8 13s-7.8-7.4-7.8-13A7.8 7.8 0 0 1 24 13.5z" fill={CUT} />
      <Circle cx="24" cy="21" r="3.1" fill={deep} />
    </Svg>
  );
}

/** Photo Search: a camera, its top plate lit. */
export function CameraArt({ size = 34, tone }) {
  const [tint, deep] = tone || PINK;
  return (
    <Svg {...box(size)}>
      <Rect x="15" y="6" width="17" height="9" rx="3.5" fill={tint} />
      <Rect x="3" y="12" width="42" height="31" rx="8" fill={deep} />
      <Rect x="3" y="12" width="42" height="7" rx="3.5" fill={tint} />
      <Circle cx="24" cy="29" r="10.5" fill={CUT} />
      <Circle cx="24" cy="29" r="6" fill={tint} />
      <Circle cx="38.5" cy="27" r="2.4" fill={tint} />
    </Svg>
  );
}

/** Following: a shop, its awning out. */
export function ShopArt({ size = 34, tone }) {
  const [tint, deep] = tone || EMERALD;
  return (
    <Svg {...box(size)}>
      <Rect x="7" y="18" width="34" height="25" rx="4" fill={deep} />
      <Path d="M4 7h40v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" fill={tint} />
      <G fill={CUT}>
        <Rect x="13.5" y="9" width="7" height="10" />
        <Rect x="27.5" y="9" width="7" height="10" />
        <Rect x="17.5" y="26" width="13" height="17" rx="2.5" />
      </G>
      <Circle cx="27" cy="35" r="1.6" fill={deep} />
    </Svg>
  );
}

/** Wishlist: a heart with a glint on its lit lobe. */
export function HeartArt({ size = 34, tone }) {
  const [tint, deep] = tone || ROSE;
  return (
    <Svg {...box(size)}>
      <Path d="M24 43.5S3.5 30.5 3.5 17.6A11.8 11.8 0 0 1 24 10 11.8 11.8 0 0 1 44.5 17.6C44.5 30.5 24 43.5 24 43.5z" fill={deep} />
      <Path d="M14.5 6.5A12 12 0 0 1 24 10a13.4 13.4 0 0 0-5.4 8.9C17.3 27 22 34.6 29 41.3 26 43 24 43.5 24 43.5S3.5 30.5 3.5 17.6A11.8 11.8 0 0 1 14.5 6.5z" fill={tint} />
      <Path d="M12 14.6a8.4 8.4 0 0 0-3.8 5.3 2.6 2.6 0 0 0 5 1.4 3.3 3.3 0 0 1 1.5-2.1 2.6 2.6 0 0 0-2.7-4.6z" fill={CUT} />
    </Svg>
  );
}

/** My Orders: a parcel, lid lit, taped. */
export function ParcelArt({ size = 34, tone }) {
  const [tint, deep] = tone || EMERALD;
  return (
    <Svg {...box(size)}>
      <Path d="M5 19h38v19a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill={deep} />
      <Rect x="3" y="8" width="42" height="12" rx="4" fill={tint} />
      <G fill={CUT}>
        <Rect x="20.4" y="8" width="7.2" height="12" />
        <Rect x="21.5" y="19" width="5" height="9" rx="2.5" />
      </G>
    </Svg>
  );
}

/** My Offers: a price tag. */
/** Go live: a video camera, its lens lit, the white "on air" dot (web FlatArt LiveArt). */
export function LiveArt({ size = 34, tone }) {
  const [tint, deep] = tone || ROSE;
  return (
    <Svg {...box(size)}>
      <Rect x="4" y="12" width="30" height="24" rx="7" fill={deep} />
      <Path d="M34 21.5 44 15v18l-10-6.5z" fill={tint} />
      <Circle cx="19" cy="24" r="6.5" fill={tint} />
      <Circle cx="19" cy="24" r="3" fill={CUT} />
      <Circle cx="10.5" cy="17.5" r="2.2" fill={CUT} />
    </Svg>
  );
}

export function TagArt({ size = 34, tone }) {
  const [tint, deep] = tone || AMBER;
  return (
    <Svg {...box(size)}>
      <Path d="M25 3.5h15.5A4 4 0 0 1 44.5 7.5V23a5 5 0 0 1-1.5 3.6L26.6 43a5 5 0 0 1-7.1 0L5 28.5a5 5 0 0 1 0-7.1L21.4 5a5 5 0 0 1 3.6-1.5z" fill={deep} />
      <Path d="M25 3.5h15.5A4 4 0 0 1 44.5 7.5V23a5 5 0 0 1-1.5 3.6l-6 6L13 8.6 21.4 5A5 5 0 0 1 25 3.5z" fill={tint} />
      <Circle cx="35.5" cy="12.5" r="4.4" fill={CUT} />
      <Path d="M15 26l5.5 5.5 9.5-9.5" stroke={CUT} strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/** Returns: a parcel with the arrow turning back. */
export function ReturnArt({ size = 34, tone }) {
  const [tint, deep] = tone || ORANGE;
  return (
    <Svg {...box(size)}>
      <Path d="M5 19h38v19a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5z" fill={deep} />
      <Rect x="3" y="8" width="42" height="12" rx="4" fill={tint} />
      {/* A plain arrow turning back: a loop drawn at this size is a smudge. */}
      <Path d="M23 27h7.5a5.5 5.5 0 0 1 0 11H25" stroke={CUT} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Polygon points="24,22.5 24,31.5 16.5,27" fill={CUT} />
    </Svg>
  );
}

/** My Reviews: a star, its smaller one paler. */
export function StarArt({ size = 34, tone }) {
  const [tint, deep] = tone || AMBER;
  const star = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 ? r * 0.45 : r;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
  };
  return (
    <Svg {...box(size)}>
      <Polygon points={star(21, 21, 18)} fill={deep} />
      <Polygon points={star(38, 36, 9)} fill={tint} />
      <Polygon points={star(21, 21, 7.2)} fill={CUT} />
    </Svg>
  );
}

/** Addresses: a pin, lit down one side. */
export function PinArt({ size = 34, tone }) {
  const [tint, deep] = tone || SKY;
  return (
    <Svg {...box(size)}>
      <Ellipse cx="24" cy="42" rx="9.5" ry="3.4" fill={tint} />
      <Path d="M24 3a14.5 14.5 0 0 1 14.5 14.5C38.5 28.5 24 40.5 24 40.5S9.5 28.5 9.5 17.5A14.5 14.5 0 0 1 24 3z" fill={deep} />
      <Path d="M24 3v37.5S9.5 28.5 9.5 17.5A14.5 14.5 0 0 1 24 3z" fill={tint} />
      <Circle cx="24" cy="17.2" r="5.8" fill={CUT} />
    </Svg>
  );
}

/** Scan QR: the code's corners, its loose squares paler. */
export function QrArt({ size = 34, tone }) {
  const [tint, deep] = tone || SKY;
  const corner = (x, y) => (
    <G key={`${x}-${y}`}>
      <Rect x={x} y={y} width="15" height="15" rx="4.5" fill={deep} />
      <Rect x={x + 4.5} y={y + 4.5} width="6" height="6" rx="2" fill={CUT} />
    </G>
  );
  return (
    <Svg {...box(size)}>
      {corner(3, 3)}
      {corner(30, 3)}
      {corner(3, 30)}
      <G fill={tint}>
        <Rect x="30" y="30" width="7" height="7" rx="2.2" />
        <Rect x="39.5" y="30" width="5.5" height="5.5" rx="1.8" />
        <Rect x="30" y="39.5" width="5.5" height="5.5" rx="1.8" />
        <Rect x="39" y="39" width="6" height="6" rx="2" />
        <Rect x="20.5" y="20.5" width="7" height="7" rx="2.2" />
      </G>
    </Svg>
  );
}

/** Help Centre: a lifebuoy. */
export function BuoyArt({ size = 34, tone }) {
  const [tint, deep] = tone || BLUE;
  return (
    <Svg {...box(size)}>
      <Circle cx="24" cy="24" r="21" fill={deep} />
      {/* The four breaks are the pale tone, not white: white here is the
          same colour as the page, so on a light background the ring stops
          looking like a ring and becomes a cross on a disc. */}
      <G fill={tint}>
        <Rect x="20.4" y="3.4" width="7.2" height="11.6" />
        <Rect x="20.4" y="33" width="7.2" height="11.6" />
        <Rect x="3.4" y="20.4" width="11.6" height="7.2" />
        <Rect x="33" y="20.4" width="11.6" height="7.2" />
      </G>
      <Circle cx="24" cy="24" r="9.5" fill={CUT} />
    </Svg>
  );
}

/** Customer Care: a headset, the band lit. */
export function HeadsetArt({ size = 34, tone }) {
  const [tint, deep] = tone || VIOLET;
  return (
    <Svg {...box(size)}>
      <Path d="M8 26v-4a16 16 0 0 1 32 0v4" stroke={tint} strokeWidth="7" strokeLinecap="round" fill="none" />
      <G fill={deep}>
        <Rect x="2.5" y="20" width="12" height="18" rx="6" />
        <Rect x="33.5" y="20" width="12" height="18" rx="6" />
        <Circle cx="26.5" cy="44" r="3.6" />
      </G>
      <Path d="M39.5 38v1.5a4.5 4.5 0 0 1-4.5 4.5h-5.5" stroke={deep} strokeWidth="3.6" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/** Feedback: two speech bubbles. */
export function BubbleArt({ size = 34, tone }) {
  const [tint, deep] = tone || PINK;
  return (
    <Svg {...box(size)}>
      <Path d="M19 16h22a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H29l-8 7v-7h-2a5 5 0 0 1-5-5V21a5 5 0 0 1 5-5z" fill={tint} />
      <Path d="M7 4h22a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5H17l-8 7v-7H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill={deep} />
      <G fill={CUT}>
        <Circle cx="11" cy="15" r="3" />
        <Circle cx="18" cy="15" r="3" />
        <Circle cx="25" cy="15" r="3" />
      </G>
    </Svg>
  );
}

/** Start Selling: a megaphone. */
export function MegaphoneArt({ size = 34, tone }) {
  const [tint, deep] = tone || ORANGE;
  return (
    <Svg {...box(size)}>
      <Path d="M37 9v32L14 32.5v-17z" fill={deep} />
      <Path d="M37 9v32l-7-2.6V11.6z" fill={tint} />
      <Rect x="3" y="16" width="11" height="16" rx="4.5" fill={deep} />
      <Path d="M9 32h7l-1.8 11.4a2.8 2.8 0 0 1-5.6 0z" fill={tint} />
      <Path d="M41.5 18a8.5 8.5 0 0 1 0 14" stroke={tint} strokeWidth="3.6" strokeLinecap="round" fill="none" />
      <G fill={CUT}>
        <Rect x="19" y="20" width="9" height="3.2" rx="1.6" />
        <Rect x="19" y="26" width="6" height="3.2" rx="1.6" />
      </G>
    </Svg>
  );
}

/* ── The seller's shop tools ─────────────────────────────────────────── */

/**
 * My products: cartons of stock.
 *
 * Three of them at different heights, the middle one in front -- one box
 * on its own would be the same silhouette as Returns, which sits four
 * tiles away in the same grid. Each carries a white label band rather
 * than a notch out of its top edge, which read as a bite taken out.
 */
export function PackageArt({ size = 34, tone }) {
  const [tint, deep] = tone || ORANGE;
  return (
    <Svg {...box(size)}>
      <Rect x="3" y="21" width="14.5" height="23" rx="3.5" fill={tint} />
      <Rect x="30.5" y="17" width="14.5" height="27" rx="3.5" fill={tint} />
      <Rect x="15.5" y="10" width="17" height="34" rx="3.5" fill={deep} />
      <G fill={CUT}>
        <Rect x="5.5" y="27" width="9.5" height="3.4" rx="1.7" />
        <Rect x="33" y="24" width="9.5" height="3.4" rx="1.7" />
        <Rect x="18" y="17" width="12" height="3.8" rx="1.9" />
        <Rect x="18" y="24" width="7.5" height="3.8" rx="1.9" />
      </G>
    </Svg>
  );
}

/** My orders: a receipt with its torn foot. */
export function ReceiptArt({ size = 34, tone }) {
  const [tint, deep] = tone || BLUE;
  return (
    <Svg {...box(size)}>
      <Path d="M8 3h32a3 3 0 0 1 3 3v39l-5.8-3.5L31.4 45l-5.8-3.5L19.8 45 14 41.5 8.2 45 5 43V6a3 3 0 0 1 3-3z" fill={deep} />
      <Path d="M8 3h32a3 3 0 0 1 3 3v8H5V6a3 3 0 0 1 3-3z" fill={tint} />
      <G fill={CUT}>
        <Rect x="11" y="20" width="26" height="3.4" rx="1.7" />
        <Rect x="11" y="27" width="26" height="3.4" rx="1.7" />
        <Rect x="11" y="34" width="16" height="3.4" rx="1.7" />
      </G>
    </Svg>
  );
}

/** Performance: bars with the newest one tallest. */
export function ChartArt({ size = 34, tone }) {
  const [tint, deep] = tone || VIOLET;
  return (
    <Svg {...box(size)}>
      <Rect x="4" y="4" width="40" height="40" rx="10" fill={deep} />
      <G fill={tint}>
        <Rect x="11" y="27" width="7" height="11" rx="2.8" />
        <Rect x="20.5" y="21" width="7" height="17" rx="2.8" />
        <Rect x="30" y="14" width="7" height="24" rx="2.8" />
      </G>
      <Circle cx="33.5" cy="10" r="4.2" fill={CUT} />
    </Svg>
  );
}

/** Finance: a wallet with a card showing. */
export function WalletArt({ size = 34, tone }) {
  const [tint, deep] = tone || GREEN;
  return (
    <Svg {...box(size)}>
      {/* The note has to clear the wallet's mouth to be seen as a note. */}
      <Rect x="11" y="3" width="26" height="14" rx="3" fill={tint} />
      <Rect x="16" y="8" width="16" height="3.4" rx="1.7" fill={CUT} />
      <Rect x="3" y="13" width="42" height="31" rx="7" fill={deep} />
      <Path d="M29 22h16v13H29a6.5 6.5 0 0 1 0-13z" fill={tint} />
      <Circle cx="34" cy="28.5" r="3.4" fill={CUT} />
    </Svg>
  );
}

/** Add product: a plus. */
export function PlusArt({ size = 34, tone }) {
  const [tint, deep] = tone || TEAL;
  return (
    <Svg {...box(size)}>
      <Circle cx="24" cy="24" r="21" fill={deep} />
      <Path d="M24 3a21 21 0 0 0-14.8 35.8l29.6-29.6A20.9 20.9 0 0 0 24 3z" fill={tint} />
      <G fill={CUT}>
        <Rect x="20.6" y="12" width="6.8" height="24" rx="3.4" />
        <Rect x="12" y="20.6" width="24" height="6.8" rx="3.4" />
      </G>
    </Svg>
  );
}

/* ── The rest of the Seller Center ───────────────────────────────────── */

/** Decorate my shop: a brush with paint on it. */
export function BrushArt({ size = 34, tone }) {
  const [tint, deep] = tone || PINK;
  return (
    <Svg {...box(size)}>
      <Path d="M30.5 4.6l12.9 12.9a3 3 0 0 1 0 4.3L26 39.2l-17.2-17.2L26 4.6a3 3 0 0 1 4.5 0z" fill={tint} />
      <Path d="M43.4 17.5a3 3 0 0 1 0 4.3L26 39.2l-8.6-8.6 17.2-17.2z" fill={deep} />
      <Path d="M12 24.5l11.5 11.5-6.9 6.9a8.1 8.1 0 0 1-11.5-11.5z" fill={deep} />
      <Circle cx="12.5" cy="35.5" r="3.4" fill={CUT} />
    </Svg>
  );
}

/** Settings: a cog. */
export function GearArt({ size = 34, tone }) {
  const [tint, deep] = tone || VIOLET;
  // Eight teeth, each a rounded bar on its own spoke.
  const teeth = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (Math.PI / 4) * i;
    const cx = 24 + Math.cos(a) * 17;
    const cy = 24 + Math.sin(a) * 17;
    teeth.push(
      <Rect
        key={i}
        x={cx - 5}
        y={cy - 5}
        width="10"
        height="10"
        rx="3"
        fill={tint}
        transform={`rotate(${(i * 45).toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})`}
      />,
    );
  }
  return (
    <Svg {...box(size)}>
      {teeth}
      <Circle cx="24" cy="24" r="16" fill={deep} />
      <Circle cx="24" cy="24" r="6.5" fill={CUT} />
    </Svg>
  );
}

/** Verify identity: an ID card. */
export function IdCardArt({ size = 34, tone }) {
  const [tint, deep] = tone || SKY;
  return (
    <Svg {...box(size)}>
      <Rect x="3" y="8" width="42" height="32" rx="6" fill={deep} />
      <Rect x="3" y="8" width="42" height="8" rx="4" fill={tint} />
      <Circle cx="17" cy="26" r="5.5" fill={CUT} />
      <Path d="M17 33c-4.4 0-8 2.4-8 5.4V40h16v-1.6c0-3-3.6-5.4-8-5.4z" fill={CUT} />
      <G fill={tint}>
        <Rect x="28" y="22" width="13" height="3.2" rx="1.6" />
        <Rect x="28" y="29" width="9" height="3.2" rx="1.6" />
      </G>
    </Svg>
  );
}

/** Chat: a bubble with a reply behind it. */
export function ChatArt({ size = 34, tone }) {
  const [tint, deep] = tone || GREEN;
  return (
    <Svg {...box(size)}>
      <Path d="M20 14h21a5 5 0 0 1 5 5v11a5 5 0 0 1-5 5h-8l-7 6v-6h-6a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5z" fill={tint} />
      <Path d="M7 4h20a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5h-8l-7 6v-6H7a5 5 0 0 1-5-5V9a5 5 0 0 1 5-5z" fill={deep} />
      <G fill={CUT}>
        <Rect x="8" y="9" width="18" height="3" rx="1.5" />
        <Rect x="8" y="15" width="11" height="3" rx="1.5" />
      </G>
    </Svg>
  );
}

/** Questions: a question mark in a bubble. */
export function QuestionArt({ size = 34, tone }) {
  const [tint, deep] = tone || BLUE;
  return (
    <Svg {...box(size)}>
      <Path d="M8 4h32a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H24l-11 8v-8H8a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6z" fill={deep} />
      <Path d="M8 4h32a6 6 0 0 1 6 6v6H2v-6a6 6 0 0 1 6-6z" fill={tint} />
      <Path d="M24 22.5a3.5 3.5 0 1 0-3.5-3.5" stroke={CUT} strokeWidth="4" strokeLinecap="round" fill="none" />
      <Rect x="22" y="22.5" width="4" height="5" rx="2" fill={CUT} />
      <Circle cx="24" cy="31" r="2.6" fill={CUT} />
    </Svg>
  );
}

/** Delivery: a van. */
export function TruckArt({ size = 34, tone }) {
  const [tint, deep] = tone || ORANGE;
  return (
    <Svg {...box(size)}>
      <Rect x="2" y="12" width="25" height="21" rx="4" fill={deep} />
      <Path d="M27 17h8.5a4 4 0 0 1 3.3 1.8l5.5 8.2a4 4 0 0 1 .7 2.2V29a4 4 0 0 1-4 4H27z" fill={tint} />
      <Rect x="31" y="21" width="8" height="6" rx="2" fill={CUT} />
      <G fill={deep}>
        <Circle cx="13" cy="36" r="6" />
        <Circle cx="36" cy="36" r="6" />
      </G>
      <G fill={CUT}>
        <Circle cx="13" cy="36" r="2.4" />
        <Circle cx="36" cy="36" r="2.4" />
      </G>
    </Svg>
  );
}

/** Notifications: a bell. */
export function BellArt({ size = 34, tone }) {
  const [tint, deep] = tone || AMBER;
  return (
    <Svg {...box(size)}>
      <Path d="M24 4a13 13 0 0 1 13 13v8l4 6.5a2 2 0 0 1-1.7 3H8.7a2 2 0 0 1-1.7-3L11 25v-8A13 13 0 0 1 24 4z" fill={deep} />
      <Path d="M24 4a13 13 0 0 0-13 13v8l-4 6.5a2 2 0 0 0-.3 1H24z" fill={tint} />
      <Path d="M18.5 38h11a5.5 5.5 0 0 1-11 0z" fill={deep} />
      <Circle cx="24" cy="4" r="3.6" fill={tint} />
    </Svg>
  );
}
