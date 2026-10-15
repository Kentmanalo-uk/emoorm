/**
 * An SVG gradient stop's colour and opacity, for <Stop {...stopPaint(c)} />.
 * iOS draws an rgba() stop colour at full strength (its alpha is dropped),
 * so the alpha goes in stopOpacity (times `opacity`, if given).
 */
export default function stopPaint(c, opacity = 1) {
  const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/i.exec(String(c));
  if (!m) return { stopColor: c, stopOpacity: opacity };
  return { stopColor: `rgb(${m[1]}, ${m[2]}, ${m[3]})`, stopOpacity: Number(m[4]) * opacity };
}
