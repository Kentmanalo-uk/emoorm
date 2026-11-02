import { useId } from 'react';
import { Platform } from 'react-native';
import Svg, {
  Circle, ClipPath, Defs, Ellipse, G, Path, Rect,
} from 'react-native-svg';

/**
 * Ate Moormy's face (web/src/components/moormy/MoormyFace.jsx): a friendly
 * Filipina "ate" with round glasses and her hair in a bun, on the brand's
 * green disc in her pink shirt. Decorative: her name is always said beside
 * her.
 *
 * Drawn the way the app's flat marks are (components/art/FlatArt.js): flat
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

// Hidden from screen readers (react-native-svg hands these straight to the DOM on web).
const HIDDEN = Platform.OS === 'web'
  ? { 'aria-hidden': true }
  : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' };

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

export default function MoormyFace({ size = 40 }) {
  // Its own id per instance: react-native-svg hands these to the DOM on
  // web, where two avatars on a screen would share one clip.
  const clip = `mmy${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" {...HIDDEN}>
      <Defs>
        <ClipPath id={clip}><Circle cx="60" cy="60" r="60" /></ClipPath>
      </Defs>

      <G clipPath={`url(#${clip})`}>
        {/* The disc, lit from the top left. */}
        <Circle cx="60" cy="60" r="60" fill={GREEN} />
        <Path d="M60 0A60 60 0 0 0 0 60a60 60 0 0 0 17.6 42.4L102.4 17.6A59.8 59.8 0 0 0 60 0z" fill={GREEN_LIT} />

        {/* Shoulders, and the collar catching the light. */}
        <Path d="M60 84c20 0 36 12 38 36H22c2-24 18-36 38-36z" fill={PINK} />
        <Path d="M60 84c-20 0-36 12-38 36h20c1.5-16 8-26 18-30z" fill={PINK_LIT} />

        {/* The hair behind her, and the bun. An ellipse, not a block: a
            flat-bottomed shape wider than her face leaves two straight
            dark edges down her cheeks, and the whole thing reads as a
            rectangle rather than as hair. */}
        <Ellipse cx="60" cy="48" rx="28" ry="33" fill={HAIR} />
        <Circle cx="60" cy="15" r="11" fill={HAIR} />

        <Rect x="52" y="64" width="16" height="20" rx="7" fill={SKIN_DEEP} />

        {/* Her ears, then her face over the hair. */}
        <Ellipse cx="36" cy="54" rx="5" ry="6.5" fill={SKIN_DEEP} />
        <Ellipse cx="84" cy="54" rx="5" ry="6.5" fill={SKIN_DEEP} />
        <Ellipse cx="60" cy="51" rx="23" ry="25" fill={SKIN} />
        {/* The fringe: thin where it is parted, thick at the temples, and
            meeting the hairline at both ends so it has no loose edge. */}
        <Path d="M37 48c0-14 10-23 23-23s23 9 23 23c-4-8-12-12-21-13-8 3-16 7-25 13z" fill={HAIR} />
        <Path d="M43 34c4-5 10-8 17-8-7 3-12 7-14 13-2-1-3-3-3-5z" fill={HAIR_LIT} />

        {/* Round glasses: white glass, a thick frame, a bridge and two arms. */}
        <G fill={CUT}>
          <Circle cx="49" cy="52" r="10" />
          <Circle cx="71" cy="52" r="10" />
        </G>
        <G fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round">
          <Circle cx="49" cy="52" r="10" />
          <Circle cx="71" cy="52" r="10" />
          <Path d="M59 51.5h2" />
          <Path d="M39 50l-5-2" />
          <Path d="M81 50l5-2" />
        </G>
        <G fill={INK}>
          <Circle cx="49" cy="53" r="3.2" />
          <Circle cx="71" cy="53" r="3.2" />
        </G>
        {/* One glint across each lens. */}
        <G fill={CUT} opacity="0.9">
          <Circle cx="45.5" cy="48.5" r="1.8" />
          <Circle cx="67.5" cy="48.5" r="1.8" />
        </G>

        {/* Cheeks, and a smile. */}
        <G fill={PINK_LIT}>
          <Ellipse cx="40" cy="62" rx="4.5" ry="3" />
          <Ellipse cx="80" cy="62" rx="4.5" ry="3" />
        </G>
        <Path d="M52 66c2.5 4.5 13.5 4.5 16 0 1 6-17 6-16 0z" fill={INK} />
      </G>
    </Svg>
  );
}
