/*
 * The site's icon gradients, defined once for the whole page (App.jsx).
 * styles/iconTiles.css fills icons that used to sit on a tinted tile with
 * them (`fill: url(#gi-green)`), so those icons stand on their own: filled,
 * light at the top left into deep at the bottom right.
 *
 * In the icons' own 24 x 24 space (userSpaceOnUse), so every path of an
 * icon shares one sweep, and a straight line (no height) still paints.
 * Not display:none: Firefox draws nothing from gradients hidden that way.
 */
const GRADIENT_TONES = {
  green: ['#34D399', '#047857'],
  amber: ['#FCD34D', '#D97706'],
  red: ['#FCA5A5', '#DC2626'],
  rose: ['#FDA4AF', '#E11D48'],
  blue: ['#93C5FD', '#2563EB'],
  violet: ['#C4B5FD', '#7C3AED'],
  teal: ['#5EEAD4', '#0F766E'],
  orange: ['#FDBA74', '#C2410C'],
  slate: ['#CBD5E1', '#64748B'],
};

export default function IconGradients() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
    >
      <defs>
        {Object.entries(GRADIENT_TONES).map(([name, [from, to]]) => (
          <linearGradient key={name} id={`gi-${name}`} gradientUnits="userSpaceOnUse" x1="3" y1="2" x2="21" y2="22">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}
