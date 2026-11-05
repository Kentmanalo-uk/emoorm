import Svg, {
  Circle, Ellipse, G, Path, Rect, Text as SvgText,
} from 'react-native-svg';

/*
 * The things the mascot handles on the first-visit sheets
 * (SellerGuideMascot): flat shapes in two values of their own colour, like
 * the app's other art (art/FlatArt.js). Each fills the box it is given;
 * the viewBox says its proportions. Static -- the scene moves them.
 */

const fill = { width: '100%', height: '100%' };

const BROWN = '#C08457';
const BROWN_DEEP = '#9A6234';
const BROWN_LIT = '#DDB083';
const WOOD = '#B7791F';
const STEEL = '#94A3B8';
const STEEL_DEEP = '#64748B';
const INK = '#334155';

// ---- held in the hand (48 x 48, the hand at the bottom middle) ----

export const Tomato = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Circle cx="24" cy="28" r="15" fill="#EF4444" />
    <Ellipse cx="18" cy="23" rx="4.5" ry="3" fill="#FCA5A5" opacity={0.7} />
    <Path d="M24 13l3 3.5 4.5-1-2 4 3.5 2.5-5 .5L24 26l-1.5-3.5-5-.5 3.5-2.5-2-4 4.5 1z" fill="#22C55E" />
  </Svg>
);

export const Mango = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Path d="M14 30c0-10 8-17 17-15 6 1.5 7 9 3 16-4 7-12 11-17 8-2-1.5-3-4.5-3-9z" fill="#F59E0B" />
    <Path d="M18 30c0-6 4-10 9-10" stroke="#FCD34D" strokeWidth="3" strokeLinecap="round" fill="none" />
    <Path d="M31 15c1-3 4-5 7-5-1 3-3 5-7 5z" fill="#22C55E" />
  </Svg>
);

export const Drumstick = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="20.5" y="26" width="7" height="16" rx="3.5" fill="#FEF3C7" />
    <Circle cx="20.5" cy="43" r="3.5" fill="#FEF3C7" />
    <Circle cx="27.5" cy="43" r="3.5" fill="#FEF3C7" />
    <Ellipse cx="24" cy="17" rx="12" ry="14" fill="#D97706" />
    <Ellipse cx="20" cy="12" rx="4.5" ry="5.5" fill="#F59E0B" />
  </Svg>
);

export const Magnifier = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="21" y="27" width="6" height="19" rx="3" fill={WOOD} />
    <Circle cx="24" cy="15" r="12" fill="#BAE6FD" opacity={0.55} />
    <Circle cx="24" cy="15" r="12" fill="none" stroke={STEEL_DEEP} strokeWidth="4.5" />
    <Path d="M17 11a8 8 0 0 1 6-5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" fill="none" />
  </Svg>
);

export const Camera = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="15" y="9" width="11" height="7" rx="2" fill={STEEL_DEEP} />
    <Rect x="5" y="14" width="38" height="26" rx="6" fill={INK} />
    <Circle cx="24" cy="27" r="9" fill={STEEL} />
    <Circle cx="24" cy="27" r="5.5" fill="#1E293B" />
    <Circle cx="22" cy="25" r="1.8" fill="#fff" />
    <Rect x="34" y="18" width="5" height="3.5" rx="1.5" fill="#FDE68A" />
  </Svg>
);

export const Megaphone = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    {/* Wide end up: it points the way the arm reaches. */}
    <Path d="M18 34L8 6h32L30 34z" fill="#EC4899" />
    <Path d="M14 12h20l-1.5 5h-17z" fill="#F9A8D4" />
    <Rect x="18" y="33" width="12" height="7" rx="2" fill="#BE185D" />
    <Rect x="21" y="38" width="6" height="8" rx="2" fill={INK} />
  </Svg>
);

export const Bell = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Circle cx="24" cy="8" r="3.5" fill="#D97706" />
    <Path d="M24 9c-8 0-12 6-12 13v8l-4 5h32l-4-5v-8c0-7-4-13-12-13z" fill="#FBBF24" />
    <Path d="M17 21c0-4 2-7 5-8" stroke="#FDE68A" strokeWidth="3" strokeLinecap="round" fill="none" />
    <Circle cx="24" cy="38" r="4.5" fill="#D97706" />
  </Svg>
);

export const BigStar = () => (
  <Svg {...fill} viewBox="0 0 24 24">
    <Path d="M12 1.5l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L12 18 5.5 21.4l1.3-7.2L1.5 9.1l7.3-1z" fill="#FBBF24" />
    <Path d="M12 5l1.8 3.8 4.1.6" stroke="#FDE68A" strokeWidth="1.6" strokeLinecap="round" fill="none" />
  </Svg>
);

export const Coin = () => (
  <Svg {...fill} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="10" fill="#F59E0B" />
    <Circle cx="12" cy="12" r="7" fill="#FBBF24" />
    <SvgText x="12" y="16" fontSize="10" fontWeight="bold" fill="#B45309" textAnchor="middle">₱</SvgText>
  </Svg>
);

export const Phone = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="11" y="2" width="26" height="44" rx="6" fill={INK} />
    <Rect x="14" y="7" width="20" height="32" rx="2.5" fill="#E0F2FE" />
    <Rect x="16" y="11" width="12" height="5" rx="2.5" fill="#F9A8D4" />
    <Rect x="20" y="19" width="12" height="5" rx="2.5" fill="#6EE7B7" />
    <Rect x="16" y="27" width="10" height="5" rx="2.5" fill="#F9A8D4" />
  </Svg>
);

export const Brush = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="21" y="22" width="6" height="24" rx="3" fill={WOOD} />
    <Rect x="19.5" y="15" width="9" height="9" rx="2" fill={STEEL} />
    <Path d="M19.5 15c0-6 2-11 4.5-13 2.5 2 4.5 7 4.5 13z" fill="#EC4899" />
  </Svg>
);

export const Wrench = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="20.5" y="16" width="7" height="30" rx="3.5" fill={STEEL_DEEP} />
    <Path d="M14 10a10 10 0 0 0 20 0l-6 0 0-8a10 10 0 0 0-8 0l0 8z" fill={STEEL} />
  </Svg>
);

export const Pencil = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="20" y="10" width="8" height="34" rx="1.5" fill="#FBBF24" />
    <Rect x="20" y="38" width="8" height="6" rx="1.5" fill="#F472B6" />
    <Path d="M20 10l4-8 4 8z" fill="#FDE68A" />
    <Path d="M22.6 5.2L24 2l1.4 3.2z" fill={INK} />
  </Svg>
);

export const Parcel = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="6" y="10" width="36" height="32" rx="3" fill={BROWN} />
    <Rect x="6" y="10" width="36" height="8" rx="3" fill={BROWN_LIT} />
    <Rect x="21" y="10" width="6" height="32" fill="#FDE68A" opacity={0.85} />
  </Svg>
);

export const OpenSign = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Path d="M14 16L24 6l10 10" stroke={INK} strokeWidth="2" fill="none" />
    <Circle cx="24" cy="6" r="2.5" fill={STEEL_DEEP} />
    <Rect x="3" y="15" width="42" height="22" rx="5" fill="#10B981" />
    <SvgText x="24" y="31" fontSize="12" fontWeight="bold" fill="#fff" textAnchor="middle">OPEN</SvgText>
    <Rect x="21" y="36" width="6" height="10" rx="2" fill={WOOD} />
  </Svg>
);

export const ListCard = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="7" y="3" width="34" height="43" rx="5" fill="#fff" stroke="#BBF7D0" strokeWidth="2" />
    {[12, 21, 30, 39].map((y, i) => (
      <G key={y}>
        <Circle cx="14" cy={y} r="2.8" fill={i % 2 ? '#F472B6' : '#34D399'} />
        <Rect x="20" y={y - 2} width={i % 2 ? 14 : 17} height="4" rx="2" fill="#CBD5E1" />
      </G>
    ))}
  </Svg>
);

// ---- on the shelf ----

// The box being packed: its back (behind the hand) and its front (in front).
export const BoxBack = () => (
  <Svg {...fill} viewBox="0 0 60 40">
    <Path d="M4 12L-4 2h16l6 10z" fill={BROWN_LIT} />
    <Path d="M56 12l8-10H48l-6 10z" fill={BROWN_LIT} />
    <Rect x="4" y="10" width="52" height="30" fill={BROWN_DEEP} />
  </Svg>
);
export const BoxFront = () => (
  <Svg {...fill} viewBox="0 0 60 40">
    <Rect x="4" y="14" width="52" height="26" rx="2" fill={BROWN} />
    <Rect x="4" y="14" width="52" height="5" fill={BROWN_LIT} />
    <Rect x="26" y="14" width="8" height="26" fill="#FDE68A" opacity={0.75} />
  </Svg>
);

export const Bowl = () => (
  <Svg {...fill} viewBox="0 0 60 32">
    <Ellipse cx="30" cy="9" rx="27" ry="6" fill="#FEF9C3" />
    <Circle cx="20" cy="7" r="4" fill="#fff" />
    <Circle cx="30" cy="6" r="4.5" fill="#fff" />
    <Circle cx="40" cy="7.5" r="4" fill="#fff" />
    <Circle cx="34" cy="9" r="3" fill="#F97316" />
    <Circle cx="25" cy="10" r="2.5" fill="#22C55E" />
    <Path d="M3 10h54c-2 12-13 20-27 20S5 22 3 10z" fill="#EC4899" />
    <Path d="M8 15h44" stroke="#F9A8D4" strokeWidth="3" strokeLinecap="round" />
  </Svg>
);

export const Piggy = () => (
  <Svg {...fill} viewBox="0 0 60 44">
    <Ellipse cx="30" cy="25" rx="24" ry="17" fill="#F9A8D4" />
    <Ellipse cx="22" cy="18" rx="8" ry="5" fill="#FBCFE8" />
    <Path d="M14 12l-3-9 9 5z" fill="#F472B6" />
    <Ellipse cx="53" cy="27" rx="5" ry="6" fill="#F472B6" />
    <Circle cx="44" cy="20" r="2.2" fill={INK} />
    <Rect x="24" y="8" width="14" height="3.5" rx="1.75" fill="#BE185D" />
    <Rect x="16" y="37" width="7" height="7" rx="2" fill="#F472B6" />
    <Rect x="37" y="37" width="7" height="7" rx="2" fill="#F472B6" />
  </Svg>
);

export const Easel = () => (
  <Svg {...fill} viewBox="0 0 56 64">
    <Path d="M12 64L24 6M44 64L32 6" stroke={WOOD} strokeWidth="4" strokeLinecap="round" />
    <Rect x="4" y="4" width="48" height="40" rx="3" fill="#fff" stroke={WOOD} strokeWidth="3" />
    <Rect x="8" y="46" width="40" height="4" rx="2" fill={WOOD} />
  </Svg>
);
// A dab of paint on the canvas.
export const Dab = ({ color }) => (
  <Svg {...fill} viewBox="0 0 24 24">
    <Path d="M3 13c0-6 5-10 10-9 5 .5 8 4 8 8 0 5-4 9-9 9-5 0-9-3-9-8z" fill={color} />
  </Svg>
);

export const Gear = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <G fill={STEEL}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <Rect key={a} x="20" y="1" width="8" height="10" rx="2" transform={`rotate(${a} 24 24)`} />
      ))}
    </G>
    <Circle cx="24" cy="24" r="17" fill={STEEL} />
    <Circle cx="24" cy="24" r="12" fill={STEEL_DEEP} />
    <Circle cx="24" cy="24" r="6" fill="#E2E8F0" />
  </Svg>
);

export const ChartBoard = () => (
  <Svg {...fill} viewBox="0 0 64 52">
    <Rect x="2" y="2" width="60" height="44" rx="5" fill="#fff" stroke="#BBF7D0" strokeWidth="2.5" />
    <Path d="M10 38h44" stroke="#CBD5E1" strokeWidth="2" />
    <Rect x="28" y="44" width="8" height="8" fill={STEEL_DEEP} />
  </Svg>
);

export const QuestionBoard = () => (
  <Svg {...fill} viewBox="0 0 64 52">
    <Rect x="2" y="2" width="60" height="44" rx="5" fill="#fff" stroke="#FBCFE8" strokeWidth="2.5" />
    <SvgText x="18" y="32" fontSize="20" fontWeight="bold" fill="#F472B6" textAnchor="middle">?</SvgText>
    <SvgText x="46" y="30" fontSize="16" fontWeight="bold" fill="#34D399" textAnchor="middle">?</SvgText>
    <Rect x="12" y="38" width="40" height="3" rx="1.5" fill="#E2E8F0" />
    <Rect x="28" y="44" width="8" height="8" fill={STEEL_DEEP} />
  </Svg>
);

export const Clipboard = () => (
  <Svg {...fill} viewBox="0 0 48 56">
    <Rect x="4" y="6" width="40" height="50" rx="5" fill={WOOD} />
    <Rect x="8" y="12" width="32" height="40" rx="2" fill="#fff" />
    <Rect x="16" y="2" width="16" height="9" rx="3" fill={STEEL_DEEP} />
    {[22, 32, 42].map((y) => (
      <G key={y}>
        <Rect x="12" y={y - 3} width="6" height="6" rx="1.5" fill="none" stroke="#CBD5E1" strokeWidth="1.6" />
        <Rect x="21" y={y - 1.5} width="15" height="3" rx="1.5" fill="#E2E8F0" />
      </G>
    ))}
  </Svg>
);
// A tick for one of the clipboard's boxes.
export const Tick = () => (
  <Svg {...fill} viewBox="0 0 12 12">
    <Path d="M2 6.5l2.6 2.6L10 3" stroke="#10B981" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

export const Truck = () => (
  <Svg {...fill} viewBox="0 0 64 40">
    <Rect x="2" y="6" width="38" height="24" rx="3" fill="#10B981" />
    <Rect x="8" y="12" width="14" height="10" rx="2" fill="#A7F3D0" />
    <Path d="M40 12h12l9 10v8H40z" fill="#059669" />
    <Path d="M44 15h7l6 7H44z" fill="#E0F2FE" />
    <Circle cx="14" cy="32" r="6" fill={INK} />
    <Circle cx="14" cy="32" r="2.5" fill={STEEL} />
    <Circle cx="50" cy="32" r="6" fill={INK} />
    <Circle cx="50" cy="32" r="2.5" fill={STEEL} />
  </Svg>
);

export const Bulb = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Path d="M24 3C15 3 9 9.5 9 18c0 6 3.5 9.5 6 12.5 1.5 1.8 2 3.5 2 5.5h14c0-2 .5-3.7 2-5.5 2.5-3 6-6.5 6-12.5C39 9.5 33 3 24 3z" fill="#FDE047" />
    <Path d="M16 16c0-4.5 3-8 7.5-8.5" stroke="#FEF9C3" strokeWidth="3" strokeLinecap="round" fill="none" />
    <Rect x="17" y="36" width="14" height="5" rx="2" fill={STEEL} />
    <Rect x="19" y="41" width="10" height="4" rx="2" fill={STEEL_DEEP} />
  </Svg>
);

export const Bubble = ({ color = '#fff', dots = '#94A3B8' }) => (
  <Svg {...fill} viewBox="0 0 48 36">
    <Path d="M6 4h36a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H18l-9 7 2-7H6a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill={color} stroke="#E2E8F0" strokeWidth="1.5" />
    <Circle cx="15" cy="16" r="3" fill={dots} />
    <Circle cx="24" cy="16" r="3" fill={dots} />
    <Circle cx="33" cy="16" r="3" fill={dots} />
  </Svg>
);

// Sound coming out of the megaphone: two arcs.
export const Shout = () => (
  <Svg {...fill} viewBox="0 0 24 32">
    <Path d="M4 6a14 14 0 0 1 0 20" stroke="#EC4899" strokeWidth="3" strokeLinecap="round" fill="none" />
    <Path d="M12 2a20 20 0 0 1 0 28" stroke="#F9A8D4" strokeWidth="3" strokeLinecap="round" fill="none" />
  </Svg>
);

// A camera's flash: a white burst.
export const Flash = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Path d="M24 2l4 14 14-6-8 13 14 5-14 4 8 13-14-6-4 14-4-14-14 6 8-13-14-4 14-5-8-13 14 6z" fill="#FEF9C3" />
    <Circle cx="24" cy="24" r="8" fill="#fff" />
  </Svg>
);

// The arrow round a parcel being sent back.
export const ReturnRing = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Path d="M40 24A16 16 0 1 1 33 10.8" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" fill="none" />
    <Path d="M28 6l8 4-5 7z" fill="#10B981" />
  </Svg>
);

// A product on a little stand, being photographed.
export const Stand = () => (
  <Svg {...fill} viewBox="0 0 40 44">
    <Rect x="4" y="30" width="32" height="14" rx="3" fill="#E2E8F0" />
    <Rect x="4" y="30" width="32" height="4" rx="2" fill="#F1F5F9" />
    <Rect x="11" y="10" width="18" height="21" rx="4" fill="#FBBF24" />
    <Rect x="13" y="4" width="14" height="8" rx="2" fill="#EC4899" />
    <Rect x="14" y="17" width="12" height="8" rx="2" fill="#fff" />
  </Svg>
);

// ---- more of the scenes' things ----

export const Spoon = () => (
  <Svg {...fill} viewBox="0 0 24 48">
    <Rect x="10" y="18" width="4" height="28" rx="2" fill={STEEL} />
    <Ellipse cx="12" cy="11" rx="8" ry="10" fill={STEEL} />
    <Ellipse cx="12" cy="9" rx="5.5" ry="5" fill="#fff" />
    <Circle cx="10" cy="9" r="1.6" fill="#F97316" />
  </Svg>
);

// A market stall: striped awning over a counter of produce.
export const Stall = () => (
  <Svg {...fill} viewBox="0 0 100 80">
    <Rect x="10" y="22" width="5" height="58" fill={WOOD} />
    <Rect x="85" y="22" width="5" height="58" fill={WOOD} />
    {[0, 1, 2, 3, 4].map((i) => (
      <Path key={i} d={`M${6 + i * 17.6} 8h17.6v14a8.8 8.8 0 0 1-17.6 0z`} fill={i % 2 ? '#fff' : '#EC4899'} />
    ))}
    <Rect x="4" y="4" width="92" height="6" rx="3" fill="#BE185D" />
    <Rect x="8" y="56" width="84" height="24" rx="3" fill="#10B981" />
    <Rect x="8" y="56" width="84" height="6" rx="3" fill="#6EE7B7" />
    <Circle cx="26" cy="50" r="7" fill="#EF4444" />
    <Circle cx="38" cy="51" r="6" fill="#F59E0B" />
    <Circle cx="50" cy="50" r="7" fill="#22C55E" />
    <Circle cx="63" cy="51" r="6" fill="#EF4444" />
    <Circle cx="75" cy="50" r="7" fill="#FBBF24" />
  </Svg>
);

// The campaign board, and a poster for it.
export const CampaignBoard = () => (
  <Svg {...fill} viewBox="0 0 80 72">
    <Rect x="36" y="56" width="8" height="16" fill={STEEL_DEEP} />
    <Rect x="2" y="2" width="76" height="56" rx="6" fill="#fff" stroke="#FBCFE8" strokeWidth="2.5" />
    <Rect x="8" y="8" width="64" height="10" rx="5" fill="#EC4899" />
    <SvgText x="40" y="16" fontSize="8" fontWeight="bold" fill="#fff" textAnchor="middle">BIG SALE</SvgText>
    <Rect x="10" y="24" width="18" height="26" rx="3" fill="#D1FAE5" />
    <Rect x="52" y="24" width="18" height="26" rx="3" fill="#FCE7F3" />
    <Rect x="31" y="24" width="18" height="26" rx="3" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 2" />
  </Svg>
);
export const Poster = () => (
  <Svg {...fill} viewBox="0 0 18 26">
    <Rect x="0" y="0" width="18" height="26" rx="3" fill="#FBBF24" />
    <Path d="M9 5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L9 13.2l-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#fff" />
    <Rect x="3" y="18" width="12" height="3" rx="1.5" fill="#fff" />
    <Circle cx="9" cy="2" r="1.8" fill="#EC4899" />
  </Svg>
);

// A pointer stick for the chart.
export const Pointer = () => (
  <Svg {...fill} viewBox="0 0 12 48">
    <Rect x="4.5" y="4" width="3" height="42" rx="1.5" fill={WOOD} />
    <Circle cx="6" cy="4" r="3.5" fill="#EC4899" />
  </Svg>
);

// A buyer's review: a face, five stars and lines.
export const ReviewCard = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Rect x="3" y="5" width="42" height="38" rx="6" fill="#fff" stroke="#FDE68A" strokeWidth="2" />
    <Circle cx="12" cy="15" r="4.5" fill="#F9A8D4" />
    {[0, 1, 2, 3, 4].map((i) => (
      <Path key={i} d={`M${21 + i * 5} 12l1.1 2.3 2.5.3-1.8 1.7.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.7 2.5-.3z`} fill="#FBBF24" />
    ))}
    <Rect x="8" y="25" width="32" height="3.5" rx="1.75" fill="#E2E8F0" />
    <Rect x="8" y="32" width="24" height="3.5" rx="1.75" fill="#E2E8F0" />
  </Svg>
);
export const StarOutline = () => (
  <Svg {...fill} viewBox="0 0 24 24">
    <Path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill="#fff" stroke="#FDE68A" strokeWidth="1.6" strokeLinejoin="round" />
  </Svg>
);

// A card of information, floating for the assistant to look over.
export const InfoCard = ({ tone = '#34D399' }) => (
  <Svg {...fill} viewBox="0 0 40 30">
    <Rect x="1" y="1" width="38" height="28" rx="5" fill="#fff" stroke="#E2E8F0" strokeWidth="1.5" />
    <Rect x="6" y="7" width="8" height="8" rx="2" fill={tone} />
    <Rect x="17" y="8" width="17" height="3" rx="1.5" fill="#CBD5E1" />
    <Rect x="6" y="19" width="28" height="3" rx="1.5" fill="#E2E8F0" />
  </Svg>
);

// An old telephone handset, held to the ear.
export const Handset = () => (
  <Svg {...fill} viewBox="0 0 24 48">
    <Path d="M6 6c0-3 2-4 5-4h4v10h-4v24h4v10h-4c-3 0-5-1-5-4z" fill="#10B981" />
    <Rect x="13" y="1" width="8" height="12" rx="3" fill="#059669" />
    <Rect x="13" y="35" width="8" height="12" rx="3" fill="#059669" />
  </Svg>
);

// The municipal admin on the other end: a friendly face with a headset.
export const AdminFace = () => (
  <Svg {...fill} viewBox="0 0 40 40">
    <Circle cx="20" cy="20" r="18" fill="#D1FAE5" />
    <Circle cx="20" cy="22" r="11" fill="#E7B48F" />
    <Path d="M9 20c0-8 5-12 11-12s11 4 11 12c-2-5-6-7-11-7s-9 2-11 7z" fill="#2E1D18" />
    <Circle cx="16" cy="22" r="1.6" fill={INK} />
    <Circle cx="24" cy="22" r="1.6" fill={INK} />
    <Path d="M16.5 26.5q3.5 3 7 0" stroke={INK} strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <Path d="M8 22a12 12 0 0 1 24 0" stroke={INK} strokeWidth="2" fill="none" />
    <Rect x="6" y="20" width="4" height="7" rx="2" fill={INK} />
    <Path d="M8 27q2 6 8 6" stroke={INK} strokeWidth="1.6" fill="none" />
  </Svg>
);

// The shop sign, closed side.
export const ClosedSign = () => (
  <Svg {...fill} viewBox="0 0 48 48">
    <Path d="M14 16L24 6l10 10" stroke={INK} strokeWidth="2" fill="none" />
    <Circle cx="24" cy="6" r="2.5" fill={STEEL_DEEP} />
    <Rect x="3" y="15" width="42" height="22" rx="5" fill={STEEL} />
    <SvgText x="24" y="30.5" fontSize="10" fontWeight="bold" fill="#fff" textAnchor="middle">CLOSED</SvgText>
    <Rect x="21" y="36" width="6" height="10" rx="2" fill={WOOD} />
  </Svg>
);

// A speech bubble with a question mark, or the tick that answers it.
export const AskBubble = ({ answered }) => (
  <Svg {...fill} viewBox="0 0 40 36">
    <Path d="M6 2h28a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H16l-8 7 1.5-7H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z" fill={answered ? '#D1FAE5' : '#FCE7F3'} />
    {answered ? (
      <Path d="M12 15.5l5 5 11-10" stroke="#10B981" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    ) : (
      <SvgText x="20" y="22" fontSize="17" fontWeight="bold" fill="#EC4899" textAnchor="middle">?</SvgText>
    )}
  </Svg>
);

