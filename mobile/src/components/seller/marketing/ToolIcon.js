import { useId } from 'react';
import Svg, { Defs, G, LinearGradient, Stop } from 'react-native-svg';

/*
 * A tool's filled icon in its own colour, nothing behind it (web
 * SellerApp.css .sh-tools .sh-tool-icon.is-<tone>, filled with
 * components/ui/ToolGradients.jsx): a lighter neighbouring hue at the top
 * left running into the deeper tone at the bottom right. No tile, no shadow.
 *
 * <ToolIcon Icon={MegaphoneIcon} tone="orange" size={30} />
 */
export const TOOL_GRADIENTS = {
  orange: ['#fbbf24', '#ea580c'],
  blue: ['#38bdf8', '#2563eb'],
  violet: ['#c084fc', '#6d28d9'],
  green: ['#4ade80', '#047857'],
  amber: ['#fde047', '#ea580c'],
  rose: ['#fda4af', '#e11d48'],
  pink: ['#f9a8d4', '#c026d3'],
  teal: ['#5eead4', '#0e7490'],
  slate: ['#cbd5e1', '#475569'],
};

// A Phosphor icon's "fill" paths (its 256-unit drawing), drawn inside our own
// <Svg> so the gradient can paint them (as EmptyArt does).
const fillPaths = (Icon) => Icon({}).props.weights.get('fill');

export default function ToolIcon({ Icon, tone = 'green', size = 30 }) {
  const id = `tg${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [from, to] = TOOL_GRADIENTS[tone] || TOOL_GRADIENTS.green;
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <G fill={`url(#${id})`}>{fillPaths(Icon)}</G>
    </Svg>
  );
}
