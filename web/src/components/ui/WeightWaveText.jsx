import './WeightWaveText.css';

/*
 * Words in a weight wave (the app's mobile/src/components/WeightWaveText.js,
 * on the signed-out pages' Log in button): each letter goes regular,
 * semibold, extra bold and back, one after another left to right, then they
 * all rest before the next wave. Each letter sits in a cell as wide as its
 * boldest self (a hidden bold copy under it), so nothing shifts while the
 * weight changes; the site's font is variable, so the weight glides.
 *
 *   <WeightWaveText text="Log in" />
 *
 * period: one wave and its rest, in ms
 * paused: hold still (regular weight)
 * Size and colour come from the surrounding text.
 */
export default function WeightWaveText({ text = '', period = 2800, paused = false, className = '' }) {
  const letters = [...text];
  const last = Math.max(1, letters.length - 1);
  return (
    <span
      className={`wwt${paused ? ' is-paused' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--wwt-period': `${period}ms` }}
    >
      <span className="wwt-label">{text}</span>
      <span className="wwt-letters" aria-hidden="true">
        {letters.map((raw, i) => {
          const ch = raw === ' ' ? ' ' : raw;
          // The wave runs through about 65% of the cycle; the rest is still.
          const delay = Math.round(((0.55 * i) / last) * period);
          return (
            <span key={i} className="wwt-cell" style={{ '--wwt-delay': `${delay}ms` }}>
              <span className="wwt-sizer">{ch}</span>
              <span className="wwt-glyph">{ch}</span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
