import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/*
 * Ikions (ikions.cloud, the website's icons) on phones. @ikions/react makes
 * every icon with createIkion(name, displayName, { outline, filled }) and
 * draws a DOM <svg>; metro.config.js hands its icon modules this file
 * instead, so the same drawings render with react-native-svg.
 *
 * Props as on the web: size (24), color, variant ('outline' | 'filled'),
 * strokeWidth (outline only, 1.75), plus any react-native-svg prop.
 * The app's own icons, with Phosphor's names and props, are src/lib/icons.js.
 */

const SHAPES = { path: Path, circle: Circle, rect: Rect, ellipse: Ellipse };
export const DEFAULT_SIZE = 24;
export const DEFAULT_STROKE_WIDTH = 1.75;

// The drawing's shapes; parts in the current colour take `paint` if given.
const draw = (nodes, paint) => nodes.map(([tag, attrs], i) => {
  const Shape = SHAPES[tag];
  if (!Shape) return null;
  const props = paint
    ? Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, v === 'currentColor' ? paint : v]))
    : attrs;
  return <Shape key={i} {...props} />;
});

export function createIkion(iconName, displayName, nodes) {
  function Icon({
    size = DEFAULT_SIZE, color = '#000', variant = 'outline', strokeWidth = DEFAULT_STROKE_WIDTH,
    title, children, ...rest
  }) {
    const filled = variant === 'filled';
    const paint = filled
      ? { fill: color }
      : { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' };
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" color={color} accessibilityLabel={title} {...rest}>
        <G {...paint}>{draw(nodes[filled ? 'filled' : 'outline'])}</G>
        {children}
      </Svg>
    );
  }
  Icon.displayName = displayName;
  Icon.ikion = { name: iconName, nodes };
  return Icon;
}

/**
 * An icon's shapes on its 24-unit grid, to place inside another <Svg> (to
 * fill with a gradient, or as part of a scene):
 *
 *   <Svg viewBox="0 0 24 24"><G fill={url}>{ikionShapes(StarIcon, { paint: url })}</G></Svg>
 *
 * `paint` also colours the parts the drawing gives the current colour (dots,
 * and the stroked bits some filled icons have).
 */
export function ikionShapes(Icon, { variant = 'filled', paint } = {}) {
  const nodes = Icon?.ikion?.nodes;
  return nodes ? draw(nodes[variant === 'filled' ? 'filled' : 'outline'], paint) : null;
}
