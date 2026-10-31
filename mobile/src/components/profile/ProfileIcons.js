import { useState } from 'react';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { ikionShapes } from '../../lib/ikionNative';
import { PackageIcon, ShoppingBagIcon, StorefrontIcon, TruckIcon } from '../../lib/icons';

// Ids unique on the page: a gradient referenced by a twin id inside a hidden
// screen paints nothing on the web build.
let seq = 0;
export const useSvgId = (prefix) => useState(() => `${prefix}${(seq += 1)}`)[0];

/**
 * The default profile picture (web/src/components/ui/GradientUserIcon.jsx):
 * a head-and-shoulders bust in E-MOORM's pink, a little light green at the
 * top of the head, deeper pink at the shoulders. At `size` it fills a round
 * avatar, the shoulders running off the bottom edge.
 */
export function GradientUserIcon({ size = 64 }) {
  const id = useSvgId('pfgu');
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#A7F3D0" />
          <Stop offset="0.3" stopColor="#F9A8D4" />
          <Stop offset="0.55" stopColor="#F472B6" />
          <Stop offset="1" stopColor="#DB2777" />
        </LinearGradient>
      </Defs>
      {/* One shape, so the gradient runs over the whole bust (head top 13.5 to 64). */}
      <Path d="M32 13.5a11.5 11.5 0 1 0 0 23a11.5 11.5 0 1 0 0-23ZM11 64C11 49 20.5 40.5 32 40.5S53 49 53 64Z" fill={`url(#${id})`} />
    </Svg>
  );
}

/*
 * The My Purchase icons, filled, in the tool grids' green gradient
 * (web ToolGradients: #4ade80 at the top left into #047857): the website's
 * ShoppingBag, Package, Truck and Storefront, drawn here so the gradient
 * can paint them.
 */
const ICONS = { bag: ShoppingBagIcon, package: PackageIcon, truck: TruckIcon, store: StorefrontIcon };

export function GreenToolIcon({ name, size = 27 }) {
  const id = useSvgId('pfgt');
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4ade80" />
          <Stop offset="1" stopColor="#047857" />
        </LinearGradient>
      </Defs>
      <G fill={`url(#${id})`}>{ikionShapes(ICONS[name], { paint: `url(#${id})` })}</G>
    </Svg>
  );
}
