/**
 * Each tool colour as a gradient: a lighter neighbouring hue at the top left
 * running into the deeper tone at the bottom right. Tool grids (seller Home's
 * Shop tools, admin Home's Admin tools) fill their icons with these through
 * `.sh-tools .sh-tool-icon.is-<tone> svg { fill: url(#sh-grad-<tone>) }`
 * (SellerApp.css); still no tile or shadow behind them.
 */
const TOOL_GRADIENTS = {
  orange: ['#fbbf24', '#ea580c'],
  blue: ['#38bdf8', '#2563eb'],
  violet: ['#c084fc', '#6d28d9'],
  green: ['#4ade80', '#047857'],
  amber: ['#fde047', '#ea580c'],
  rose: ['#fda4af', '#e11d48'],
  pink: ['#f9a8d4', '#c026d3'],
  teal: ['#5eead4', '#0e7490'],
  slate: ['#cbd5e1', '#475569'],
  // The brand sweep, bright pink into bright green (Profile's My Purchase).
  brand: ['#ff4fa7', '#14d27c'],
};

/** The gradients, once per page, for the icons to point at (fill: url(#…)). */
export default function ToolGradients() {
  return (
    <svg className="sh-tool-gradients" width="0" height="0" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(TOOL_GRADIENTS).map(([tone, [from, to]]) => (
          <linearGradient key={tone} id={`sh-grad-${tone}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}
