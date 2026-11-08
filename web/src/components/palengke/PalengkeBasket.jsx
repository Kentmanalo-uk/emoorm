import { useId } from 'react';

/**
 * The Palengke page's picture: a woven market basket full of fresh produce
 * (pechay, an eggplant, a carrot, tomatoes and calamansi), a pink price tag
 * hanging from its handle. Drawn in the glossy 3D look of the shortcut marks
 * (art/PopArt.jsx): light from the top left, every face softened along its
 * edges (the puff filter), a gloss where a curve catches the light, no
 * shadow on the page.
 */
export default function PalengkeBasket({ size = 160, className = '' }) {
  const id = `plgb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const u = (name) => `url(#${id}${name})`;
  const puff = u('p');
  const gloss = (d, o = 0.6) => <path d={d} fill="#fff" opacity={o} filter={u('s')} />;

  return (
    <svg
      className={className}
      width={size}
      height={size * (150 / 160)}
      viewBox="0 0 160 150"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Soft edges: a light rim along the top left, a shade along the bottom right. */}
        <filter id={`${id}p`} x="-10" y="-10" width="180" height="170" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feComponentTransfer in="SourceAlpha" result="out">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feGaussianBlur in="out" stdDeviation="2.4" result="soft" />
          <feOffset in="soft" dx="1.8" dy="2.3" result="litEdge" />
          <feFlood floodColor="#fff" floodOpacity="0.7" />
          <feComposite in2="litEdge" operator="in" />
          <feComposite in2="SourceAlpha" operator="in" result="lit" />
          <feOffset in="soft" dx="-2.2" dy="-2.8" result="shadeEdge" />
          <feFlood floodColor="#1B1035" floodOpacity="0.24" />
          <feComposite in2="shadeEdge" operator="in" />
          <feComposite in2="SourceAlpha" operator="in" result="shade" />
          <feMerge>
            <feMergeNode in="SourceGraphic" />
            <feMergeNode in="shade" />
            <feMergeNode in="lit" />
          </feMerge>
        </filter>
        <filter id={`${id}s`} x="-10" y="-10" width="180" height="170" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>

        {/* The basket: rattan, honey into amber. */}
        <linearGradient id={`${id}wb`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE1A1" />
          <stop offset="0.45" stopColor="#F2B655" />
          <stop offset="1" stopColor="#D27F24" />
        </linearGradient>
        <linearGradient id={`${id}wr`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF0C8" />
          <stop offset="0.55" stopColor="#F7C66B" />
          <stop offset="1" stopColor="#DC8E31" />
        </linearGradient>
        <linearGradient id={`${id}wh`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#D88A2E" />
          <stop offset="0.3" stopColor="#FFD58A" />
          <stop offset="0.7" stopColor="#F2B04E" />
          <stop offset="1" stopColor="#C8741E" />
        </linearGradient>
        <clipPath id={`${id}c`}>
          <path d="M24 88h112l-10.4 40a10 10 0 0 1-9.7 7.5H44.1a10 10 0 0 1-9.7-7.5z" />
        </clipPath>

        {/* Pechay leaves. */}
        <linearGradient id={`${id}lf`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B8F5A6" />
          <stop offset="0.5" stopColor="#3FCB5E" />
          <stop offset="1" stopColor="#14904A" />
        </linearGradient>
        <linearGradient id={`${id}lf2`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9BEA8E" />
          <stop offset="0.55" stopColor="#25B158" />
          <stop offset="1" stopColor="#0E7A43" />
        </linearGradient>
        {/* Eggplant. */}
        <linearGradient id={`${id}eg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#D9B8FF" />
          <stop offset="0.45" stopColor="#9152E8" />
          <stop offset="1" stopColor="#5B23B8" />
        </linearGradient>
        {/* Carrot. */}
        <linearGradient id={`${id}ca`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#FFC27A" />
          <stop offset="0.45" stopColor="#FF8A2A" />
          <stop offset="1" stopColor="#E3561E" />
        </linearGradient>
        {/* Tomatoes. */}
        <radialGradient id={`${id}to`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFC2B4" />
          <stop offset="0.45" stopColor="#F43F4C" />
          <stop offset="1" stopColor="#C21F45" />
        </radialGradient>
        {/* Calamansi. */}
        <radialGradient id={`${id}cl`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#E8FFB0" />
          <stop offset="0.5" stopColor="#8FD13F" />
          <stop offset="1" stopColor="#4C9A22" />
        </radialGradient>
        {/* Green tops and caps. */}
        <linearGradient id={`${id}st`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9BF0CC" />
          <stop offset="0.5" stopColor="#22C78C" />
          <stop offset="1" stopColor="#0B7F5C" />
        </linearGradient>
        {/* The tag: E-MOORM's pink. */}
        <linearGradient id={`${id}tg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFC6E4" />
          <stop offset="0.5" stopColor="#F55DB3" />
          <stop offset="1" stopColor="#D4409E" />
        </linearGradient>
      </defs>

      {/* The handle, behind everything in the basket. */}
      <g filter={puff}>
        <path d="M34 90C30 38 56 10 80 10s50 28 46 80" fill="none" stroke={u('wh')} strokeWidth="8" strokeLinecap="round" />
      </g>
      <path d="M40 60c3-22 17-38 32-41" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" filter={u('s')} />

      {/* Pechay at the back on the left: three leaves fanning out. */}
      <g filter={puff}>
        <path d="M44 92C24 80 18 50 28 34c12 8 22 32 22 58z" fill={u('lf2')} />
      </g>
      <g filter={puff}>
        <path d="M52 94C40 70 42 34 56 20c10 14 14 46 4 74z" fill={u('lf')} />
      </g>
      <path d="M57 90c-2-20-1-42 0-62" fill="none" stroke="#EFFFF0" strokeOpacity="0.85" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M44 88c-6-14-10-30-12-46" fill="none" stroke="#EFFFF0" strokeOpacity="0.7" strokeWidth="2.2" strokeLinecap="round" />
      {gloss('M49 52c0-9 2-17 5-23 .6-1.2 2.2-.6 1.8.6-2 6-3 13-3.4 22-.1 1.6-3.4 1.8-3.4.4z', 0.7)}

      {/* The eggplant, leaning out on the right. */}
      <g filter={puff}>
        <path d="M96 92c-6-16 0-38 14-50 11-9 24-9 28-2 4 7-1 18-10 26-11 10-17 20-19 28z" fill={u('eg')} />
      </g>
      {gloss('M108 50c6-6 14-9 20-7 1 .5.8 1.9-.3 1.9-5.4.1-11 2.4-16.4 6.6-1.5 1.1-4.1-.3-3.3-1.5z', 0.75)}
      <g filter={puff}>
        <path d="M126 38c4-7 11-9 16-7-1 5-6 8-10 9 3 2 5 6 4 9-5 0-9-3-10-7z" fill={u('st')} />
      </g>
      <path d="M137 33l6-9" stroke="#0B7F5C" strokeWidth="3.2" strokeLinecap="round" />

      {/* The carrot, standing up in the middle. */}
      <g filter={puff}>
        <path d="M74 22c3-9 7-14 10-14s-1 9-4 13c5-6 11-9 13-8s-4 8-9 11c6-2 11-1 12 1s-7 5-13 4z" fill={u('st')} />
      </g>
      <g filter={puff}>
        <path d="M73 28c7-4 15-2 18 4L87 94H75z" fill={u('ca')} />
      </g>
      <g stroke="#C9481A" strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round">
        <path d="M76 44h5" />
        <path d="M83 56h5" />
        <path d="M77 68h4" />
      </g>
      {gloss('M76 34c2-2 5-2.6 7.4-2 1 .3.8 1.6-.2 1.6-2 .2-3.8 1-5.2 2.4-.9.9-2.8-.8-2-2z', 0.8)}

      {/* The basket's front: woven rattan. */}
      <g filter={puff}>
        <path d="M24 88h112l-10.4 40a10 10 0 0 1-9.7 7.5H44.1a10 10 0 0 1-9.7-7.5z" fill={u('wb')} />
      </g>
      <g clipPath={u('c')} fill="none" strokeLinecap="round">
        <g stroke="#B9661B" strokeOpacity="0.38" strokeWidth="2.4">
          <path d="M20 104h120" />
          <path d="M20 119h120" />
        </g>
        <g stroke="#FFF3D6" strokeOpacity="0.55" strokeWidth="1.4">
          <path d="M20 101.5h120" />
          <path d="M20 116.5h120" />
          <path d="M20 131.5h120" />
        </g>
        <g stroke="#B9661B" strokeOpacity="0.26" strokeWidth="2">
          {[38, 52, 66, 80, 94, 108, 122].map((x, i) => (
            <path key={x} d={i % 2 ? `M${x} 90v10m0 8v8m0 8v8` : `M${x} 98v8m0 8v8`} />
          ))}
        </g>
      </g>
      {gloss('M33 100c1.4 9 3.4 18 6 26 .4 1.4-1.6 2-2.2.7-3-8-5.2-17-6.2-26-.1-1.4 2.3-1.8 2.4-.7z', 0.55)}

      {/* Tomatoes and calamansi heaped over the brim. */}
      <g filter={puff}><circle cx="40" cy="86" r="8" fill={u('cl')} /></g>
      {gloss('M35 83.4c.5-2 2-3.6 3.9-4 .6-.1.9.7.3 1-1.4.6-2.4 1.8-2.9 3.2-.2.6-1.5.4-1.3-.2z', 0.85)}
      <g filter={puff}><circle cx="120" cy="86" r="8" fill={u('cl')} /></g>
      {gloss('M115 83.4c.5-2 2-3.6 3.9-4 .6-.1.9.7.3 1-1.4.6-2.4 1.8-2.9 3.2-.2.6-1.5.4-1.3-.2z', 0.85)}

      {/* The rim. */}
      <g filter={puff}>
        <rect x="18" y="84" width="124" height="13" rx="6.5" fill={u('wr')} />
      </g>
      <path d="M26 87.2h108" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />

      <g filter={puff}><circle cx="60" cy="84" r="14.5" fill={u('to')} /></g>
      <g filter={puff}><path d="M60 70.8l2.6 3.6 4.2-1.2-1.8 4 3.6 2.4-4.4.4-1.2 4.2-3-3.2-3 3.2-1.2-4.2-4.4-.4 3.6-2.4-1.8-4 4.2 1.2z" fill={u('st')} /></g>
      {gloss('M50 81c1-4 4-7 8-8 1-.2 1.4 1 .5 1.4-3 1.4-5 3.6-6 6.6-.4 1-2.8 1-2.5 0z', 0.75)}

      <g filter={puff}><circle cx="102" cy="86" r="12.5" fill={u('to')} /></g>
      <g filter={puff}><path d="M102 74.8l2.3 3.1 3.7-1-1.6 3.5 3.1 2.1-3.8.3-1 3.6-2.7-2.7-2.6 2.7-1-3.6-3.8-.3 3.1-2.1-1.6-3.5 3.7 1z" fill={u('st')} /></g>
      {gloss('M93.4 83.4c1-3.4 3.4-6 6.6-6.8.9-.2 1.3.9.5 1.3-2.6 1.2-4.4 3.2-5.2 5.8-.3.9-2.2.7-1.9-.3z', 0.75)}

      <g filter={puff}><circle cx="81" cy="90" r="9" fill={u('cl')} /></g>
      {gloss('M75.5 87.5c.6-2.4 2.3-4 4.4-4.4.7-.1 1 .8.4 1.1-1.6.7-2.7 1.9-3.2 3.5-.2.7-1.8.5-1.6-.2z', 0.85)}

      {/* A pink price tag on a string from the handle. */}
      <path d="M124 62c3 5 6 9 9 11" fill="none" stroke="#8A5A2B" strokeWidth="1.4" strokeLinecap="round" />
      <g transform="rotate(16 138 90)">
        <g filter={puff}>
          <path d="M131 72.5h12a4 4 0 0 1 4 4V100a4 4 0 0 1-4 4h-12a4 4 0 0 1-4-4V76.5a4 4 0 0 1 4-4z" fill={u('tg')} />
        </g>
        <circle cx="137" cy="78.5" r="2" fill="#B02C82" />
        <circle cx="137" cy="78.5" r="1.2" fill="#FFE6F3" />
        {/* A small heart printed on it, pressed in a little. */}
        <path d="M137 97.5s-6-3.8-6-7.6a3.2 3.2 0 0 1 6-1.6 3.2 3.2 0 0 1 6 1.6c0 3.8-6 7.6-6 7.6z" fill="#B02C82" opacity="0.4" transform="translate(.4 .6)" />
        <path d="M137 97.5s-6-3.8-6-7.6a3.2 3.2 0 0 1 6-1.6 3.2 3.2 0 0 1 6 1.6c0 3.8-6 7.6-6 7.6z" fill="#fff" />
      </g>
    </svg>
  );
}
