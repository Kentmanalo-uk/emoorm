import { useId } from 'react';
import { shopCoverArt, shopLogoArt } from '../../lib/shopArt';

/**
 * A shop's generated picture (lib/shopArt), for when it has none of its own.
 * Both fill the box they are put in; the box keeps its own shape and crop.
 */

const FILL = { display: 'block', width: '100%', height: '100%' };

const Shapes = ({ list }) => list.map(([Tag, attrs, children], i) => (
  <Tag key={i} {...attrs}>{children ? <Shapes list={children} /> : null}</Tag>
));

function Art({ art, width, height, slice, className, children }) {
  const id = `sa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      className={className || undefined}
      style={FILL}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={slice ? 'xMidYMid slice' : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={art.from} />
          <stop offset="1" stopColor={art.to} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
      <Shapes list={art.shapes} />
      {children}
    </svg>
  );
}

export function ShopLogoArt({ name, className }) {
  const art = shopLogoArt(name);
  return (
    <Art art={art} width={art.size} height={art.size} className={className}>
      {art.label && (
        <text x="50" y={art.labelY + 2} textAnchor="middle" fill="#fff" fontFamily="var(--font-heading)" fontSize="36" fontWeight="800">
          {art.label}
        </text>
      )}
    </Art>
  );
}

export function ShopCoverArt({ name, className }) {
  const art = shopCoverArt(name);
  return <Art art={art} width={art.width} height={art.height} slice className={className} />;
}
