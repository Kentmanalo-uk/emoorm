import { useId } from 'react';

/**
 * Ate Moormy's face: a friendly Filipina "ate" with round glasses, her hair
 * in a neat bun, a green blouse, on the brand's pink-to-green circle. Drawn
 * with soft gradients and highlights so she reads as a small 3D figure.
 * Decorative: wherever she appears, her name is said beside her.
 */
export default function MoormyFace({ size = 40, className = '' }) {
  const id = `mf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const url = (n) => `url(#${id}-${n})`;
  return (
    <svg
      className={`mmy-face ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset="1" stopColor="#10b981" />
        </linearGradient>
        <radialGradient id={`${id}-gloss`} cx="0.3" cy="0.2" r="0.7">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-skin`} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#e7b48f" />
          <stop offset="0.65" stopColor="#c98b62" />
          <stop offset="1" stopColor="#a96a45" />
        </radialGradient>
        <linearGradient id={`${id}-neck`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9c5f3d" />
          <stop offset="1" stopColor="#bf7f57" />
        </linearGradient>
        <linearGradient id={`${id}-hair`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#3a2620" />
          <stop offset="1" stopColor="#120a08" />
        </linearGradient>
        <linearGradient id={`${id}-shirt`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <radialGradient id={`${id}-lens`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </radialGradient>
        <clipPath id={`${id}-clip`}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>

      <g clipPath={url('clip')}>
        <circle cx="60" cy="60" r="60" fill={url('bg')} />

        {/* The figure, drawn a fifth larger than its sketch so her face reads at chat size. */}
        <g transform="matrix(1.2 0 0 1.2 -12 -6)">

        {/* Hair behind the head, falling to the shoulders. */}
        <path d="M30 56 C28 32 42 20 60 20 C78 20 92 32 90 56 L92 86 C85 91 78 90 74 84 L46 84 C42 90 35 91 28 86 Z" fill={url('hair')} />

        {/* Shoulders and blouse. */}
        <path d="M14 122 C16 98 36 86 60 86 C84 86 104 98 106 122 Z" fill={url('shirt')} />
        <path d="M49 86 L60 100 L71 86 Z" fill="#c98b62" />
        <path d="M49 86 L60 100 L71 86" fill="none" stroke="#065f46" strokeWidth="1.6" strokeLinejoin="round" opacity="0.5" />
        <path d="M24 108 C34 96 46 92 54 92" fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.22" />

        {/* Neck, shaded under the chin. */}
        <rect x="52" y="70" width="16" height="20" rx="7" fill={url('neck')} />

        {/* Ears and gold earrings. */}
        <ellipse cx="38.5" cy="57" rx="4.2" ry="5.4" fill="#bf7f57" />
        <ellipse cx="81.5" cy="57" rx="4.2" ry="5.4" fill="#bf7f57" />
        <circle cx="38.5" cy="64.5" r="2.3" fill="#fbbf24" />
        <circle cx="81.5" cy="64.5" r="2.3" fill="#fbbf24" />
        <circle cx="37.9" cy="63.9" r="0.8" fill="#fff7d1" />
        <circle cx="80.9" cy="63.9" r="0.8" fill="#fff7d1" />

        {/* Face. */}
        <ellipse cx="60" cy="55" rx="22" ry="25" fill={url('skin')} />

        {/* Bun on top, and bangs swept to one side. */}
        <circle cx="60" cy="19" r="10" fill={url('hair')} />
        <path d="M53 15 C56 11 63 11 66 14" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" opacity="0.25" />
        <path d="M37 50 C36 33 47 26 60 26 C74 26 85 34 83 50 C79 42 72 38 64 37 C58 41 48 43 37 50 Z" fill={url('hair')} />
        <path d="M45 33 C50 29 57 28 63 29" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.22" />

        {/* Eyebrows. */}
        <path d="M45.5 46 C48 44.4 52 44.4 55 45.6" fill="none" stroke="#2a1a15" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M65 45.6 C68 44.4 72 44.4 74.5 46" fill="none" stroke="#2a1a15" strokeWidth="1.8" strokeLinecap="round" />

        {/* Eyes, with a glint. */}
        <ellipse cx="51" cy="54" rx="2.6" ry="3.1" fill="#2a1a15" />
        <ellipse cx="69" cy="54" rx="2.6" ry="3.1" fill="#2a1a15" />
        <circle cx="51.9" cy="53" r="0.9" fill="#ffffff" />
        <circle cx="69.9" cy="53" r="0.9" fill="#ffffff" />

        {/* Round glasses. */}
        <circle cx="51" cy="54" r="7.6" fill={url('lens')} stroke="#3b2622" strokeWidth="2.2" />
        <circle cx="69" cy="54" r="7.6" fill={url('lens')} stroke="#3b2622" strokeWidth="2.2" />
        <path d="M58.6 53.2 C59.6 52 60.4 52 61.4 53.2" fill="none" stroke="#3b2622" strokeWidth="2" strokeLinecap="round" />
        <path d="M43.4 53 L39.5 51.5" stroke="#3b2622" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M76.6 53 L80.5 51.5" stroke="#3b2622" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M46.5 50 C47.8 48.6 49.6 48 51.4 48.2" fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
        <path d="M64.5 50 C65.8 48.6 67.6 48 69.4 48.2" fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />

        {/* Nose, blush and smile. */}
        <path d="M60 58 C59.2 61 58.6 62.6 60.6 63.2" fill="none" stroke="#9c5f3d" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="45.5" cy="64" rx="4.2" ry="2.5" fill="#f472b6" opacity="0.38" />
        <ellipse cx="74.5" cy="64" rx="4.2" ry="2.5" fill="#f472b6" opacity="0.38" />
        <path d="M52.5 67 Q60 74.5 67.5 67 Q60 70.5 52.5 67 Z" fill="#b8475e" />
        <path d="M55.5 69.4 Q60 71.6 64.5 69.4" fill="none" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" opacity="0.7" />

        </g>

        {/* Light from the top left over the whole figure. */}
        <circle cx="60" cy="60" r="60" fill={url('gloss')} />
      </g>
    </svg>
  );
}
