import { modeLabel, liveMode } from '../../lib/availability';
import './TodayTag.css';

/**
 * The kind of an Available Today listing (Ready now, Made to order,
 * Pre-order) as a small coloured tag, set before the product's name.
 */
export default function TodayTag({ mode, className = '' }) {
  if (!mode) return null;
  const kind = mode.toLowerCase().replace(/_/g, '-');
  return <span className={`today-tag is-${kind} ${className}`.trim()}>{modeLabel(mode)}</span>;
}

/** On a product card: the tag when the product is a live Available Today item. */
export function ProductTodayTag({ product }) {
  const mode = liveMode(product);
  return mode ? <TodayTag mode={mode} /> : null;
}
