import { useId } from 'react';
import { StyleSheet } from 'react-native';
import Svg, {
  Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import { fontFamily } from '../../theme';
import { shopCoverArt, shopLogoArt } from '../../lib/shopArt';

/**
 * A shop's generated picture (lib/shopArt), for when it has none of its own.
 * Both fill the box they are put in; the box keeps its own shape and crop.
 */

const TAGS = {
  path: Path, circle: Circle, rect: Rect, ellipse: Ellipse, g: G,
};

const Shapes = ({ list }) => list.map(([tag, attrs, children], i) => {
  const Tag = TAGS[tag];
  if (!Tag) return null;
  return (
    <Tag key={i} {...attrs}>{children ? <Shapes list={children} /> : null}</Tag>
  );
});

function Art({
  art, width, height, slice, style, children,
}) {
  const id = `sa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={slice ? 'xMidYMid slice' : undefined}
      style={style}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={art.from} />
          <Stop offset="1" stopColor={art.to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
      <Shapes list={art.shapes} />
      {children}
    </Svg>
  );
}

export function ShopLogoArt({ name, style }) {
  const art = shopLogoArt(name);
  return (
    <Art art={art} width={art.size} height={art.size} style={style}>
      {art.label ? (
        <SvgText x="50" y={art.labelY + 2} textAnchor="middle" fill="#fff" fontFamily={fontFamily.extraBold} fontWeight="800" fontSize="36">
          {art.label}
        </SvgText>
      ) : null}
    </Art>
  );
}

export function ShopCoverArt({ name, style = StyleSheet.absoluteFill }) {
  const art = shopCoverArt(name);
  return <Art art={art} width={art.width} height={art.height} slice style={style} />;
}
