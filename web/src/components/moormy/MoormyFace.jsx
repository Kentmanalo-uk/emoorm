import { useId } from 'react';

/**
 * Ate Moormy's face (the app's is mobile/src/components/inbox/MoormyFace.js): a friendly
 * Filipina "ate" with round glasses and her hair in a bun, on the brand's
 * green disc in her pink shirt. Decorative: her name is always said beside
 * her.
 *
 * Drawn the way the app's flat marks are (components/art/FlatArt.jsx): flat
 * fills only, each thing in two values of its own colour -- a pale one
 * where the light falls, a stronger one for the body -- with white for the
 * glass and the glints. No gradients, no shading ramps, no hairlines.
 *
 * She used to be a small painting: nine gradients, a gloss layer, blush at
 * 38% over a three-stop skin ramp, and strokes down to 1px. At 40pt, where
 * she is nearly always seen, none of that survived -- it turned to a
 * smudge, and it sat oddly beside a grid of flat marks on the same screen.
 * Flat shapes hold their edges at any size.
 *
 * The brand's pink and green are both still here: the green is the disc
 * she sits on, the pink is what she is wearing.
 */

const GREEN = '#10B981';
const GREEN_LIT = '#6EE7B7';
const PINK = '#F472B6';
const PINK_LIT = '#F9A8D4';
const SKIN = '#E7B48F';
const SKIN_DEEP = '#C98B62';
const HAIR = '#2E1D18';
const HAIR_LIT = '#4A312A';
const INK = '#2A1A15';
const CUT = '#FFFFFF';

export default function MoormyFace({ size = 40, className = '' }) {
  // Its own id per instance: two avatars on a page would share one clip.
  const clip = `mmy${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg className={`mmy-face ${className}`.trim()} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}><circle cx="60" cy="60" r="60" /></clipPath>
      </defs>

      <g clipPath={`url(#${clip})`}>
        {/* The disc, lit from the top left. */}
        <circle cx="60" cy="60" r="60" fill={GREEN} />
        <path d="M60 0A60 60 0 0 0 0 60a60 60 0 0 0 17.6 42.4L102.4 17.6A59.8 59.8 0 0 0 60 0z" fill={GREEN_LIT} />

        {/* Shoulders, and the collar catching the light. */}
        <path d="M60 84c20 0 36 12 38 36H22c2-24 18-36 38-36z" fill={PINK} />
        <path d="M60 84c-20 0-36 12-38 36h20c1.5-16 8-26 18-30z" fill={PINK_LIT} />

        {/* The hair behind her, and the bun. An ellipse, not a block: a
            flat-bottomed shape wider than her face leaves two straight
            dark edges down her cheeks, and the whole thing reads as a
            rectangle rather than as hair. */}
        <ellipse cx="60" cy="48" rx="28" ry="33" fill={HAIR} />
        <circle cx="60" cy="15" r="11" fill={HAIR} />

        <rect x="52" y="64" width="16" height="20" rx="7" fill={SKIN_DEEP} />

        {/* Her ears, then her face over the hair. */}
        <ellipse cx="36" cy="54" rx="5" ry="6.5" fill={SKIN_DEEP} />
        <ellipse cx="84" cy="54" rx="5" ry="6.5" fill={SKIN_DEEP} />
        <ellipse cx="60" cy="51" rx="23" ry="25" fill={SKIN} />
        {/* The fringe: thin where it is parted, thick at the temples, and
            meeting the hairline at both ends so it has no loose edge. */}
        <path d="M37 48c0-14 10-23 23-23s23 9 23 23c-4-8-12-12-21-13-8 3-16 7-25 13z" fill={HAIR} />
        <path d="M43 34c4-5 10-8 17-8-7 3-12 7-14 13-2-1-3-3-3-5z" fill={HAIR_LIT} />

        {/* Round glasses: white glass, a thick frame, a bridge and two arms. */}
        <g fill={CUT}>
          <circle cx="49" cy="52" r="10" />
          <circle cx="71" cy="52" r="10" />
        </g>
        <g fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
          <circle cx="49" cy="52" r="10" />
          <circle cx="71" cy="52" r="10" />
          <path d="M59 51.5h2" />
          <path d="M39 50l-5-2" />
          <path d="M81 50l5-2" />
        </g>
        <g fill={INK}>
          <circle cx="49" cy="53" r="3.2" />
          <circle cx="71" cy="53" r="3.2" />
        </g>
        {/* One glint across each lens. */}
        <g fill={CUT} opacity="0.9">
          <circle cx="45.5" cy="48.5" r="1.8" />
          <circle cx="67.5" cy="48.5" r="1.8" />
        </g>

        {/* Cheeks, and a smile. */}
        <g fill={PINK_LIT}>
          <ellipse cx="40" cy="62" rx="4.5" ry="3" />
          <ellipse cx="80" cy="62" rx="4.5" ry="3" />
        </g>
        <path d="M52 66c2.5 4.5 13.5 4.5 16 0 1 6-17 6-16 0z" fill={INK} />
      </g>
    </svg>
  );
}
