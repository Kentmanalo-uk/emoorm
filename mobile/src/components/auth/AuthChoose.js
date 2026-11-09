import { useId, useState } from 'react';
import {
  StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop,
} from 'react-native-svg';
import AuthScene from '../art/AuthScenes';
import stopPaint from '../../lib/stopPaint';
import { font, t, themed } from '../../theme';
import { LIGHT } from '../../theme/palettes';

/*
 * The first step of the Log in and Sign up sheets (web/src/pages/AuthSheet.css
 * .auth-choose, Login.jsx / Register.jsx while `choosing`): a colourful band
 * with a headline, a line under it and the door's 3D scene; then, on white
 * under a gentle curve, the ways in as off-white buttons, the account link,
 * Trouble signing in?, and the terms at the foot of the screen.
 */

/** The band's top edge: the colour the website gives the status bar over it. */
export const BAND_STATUS_BAR = '#ffbede';

/* The band: deep pink through peach into mint (linear-gradient 165deg), with
   soft pink and green patches for depth and a light glow behind the headline.
   Each patch: [width %, height %, x %, y %, colour], fading out at 72%. Listed
   top first, as CSS lists backgrounds. */
const BAND_STOPS = [[0, '#ffb3d9'], [0.28, '#ffd0e6'], [0.46, '#ffe4cf'], [0.72, '#c6f4dd'], [1, '#9ee8c7']];
const BAND_PATCHES = [
  [55, 30, 50, 14, [255, 255, 255, 0.6]],
  [42, 26, 8, 34, [244, 114, 182, 0.55]],
  [40, 26, 96, 22, [52, 211, 153, 0.5]],
  [46, 28, 88, 52, [251, 146, 60, 0.32]],
  [48, 28, 14, 58, [16, 185, 129, 0.38]],
];
const rgba = ([r, g, b], a) => `rgba(${r}, ${g}, ${b}, ${a})`;

/**
 * The band, painted behind the whole sheet (it stays put while the sheet
 * scrolls, as the website's background on its scroll box does). `top`: the
 * status bar's height, filled with the band's top edge colour, the band
 * starting under it as it does under the browser's bar.
 */
export function AuthBand({ top = 0 }) {
  const uid = `ab${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [box, setBox] = useState(null);
  const onLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    if (!box || box.w !== width || box.h !== height) setBox({ w: width, h: height });
  };

  let art = null;
  if (box && box.w > 0 && box.h > 0) {
    const { w, h } = box;
    // CSS's gradient line for 165deg across a w × h box.
    const a = (165 * Math.PI) / 180;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    art = (
      <Svg width={w} height={h}>
        <Defs>
          <LinearGradient
            id={`${uid}l`}
            gradientUnits="userSpaceOnUse"
            x1={w / 2 - dx * half}
            y1={h / 2 - dy * half}
            x2={w / 2 + dx * half}
            y2={h / 2 + dy * half}
          >
            {BAND_STOPS.map(([o, c]) => <Stop key={o} offset={o} stopColor={c} />)}
          </LinearGradient>
          {BAND_PATCHES.map(([, , , , [r, g, b, alpha]], i) => (
            // Over the ellipse's own box, so the patch is as wide and tall as asked.
            <RadialGradient key={`${uid}r${i}`} id={`${uid}r${i}`} cx="0.5" cy="0.5" r="0.5" fx="0.5" fy="0.5">
              <Stop offset="0" {...stopPaint(rgba([r, g, b], alpha))} />
              <Stop offset="0.72" {...stopPaint(rgba([r, g, b], 0))} />
              <Stop offset="1" {...stopPaint(rgba([r, g, b], 0))} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x="0" y="0" width={w} height={h} fill={`url(#${uid}l)`} />
        {BAND_PATCHES.map((_, i) => BAND_PATCHES.length - 1 - i).map((i) => {
          const [pw, ph, px, py] = BAND_PATCHES[i];
          return (
            <Ellipse
              key={i}
              cx={(px / 100) * w}
              cy={(py / 100) * h}
              rx={(pw / 100) * w}
              ry={(ph / 100) * h}
              fill={`url(#${uid}r${i})`}
            />
          );
        })}
      </Svg>
    );
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {top ? <View style={[styles.statusStrip, { height: top }]} /> : null}
      <View style={styles.band} onLayout={onLayout}>{art}</View>
    </View>
  );
}

/**
 * The step itself, inside the sheet's scroll box (AuthSheet with `band`).
 *
 * title / sub / scene: the band's headline, its line and the scene's name
 *   (art/AuthScenes: signIn, signUp, seller, sell)
 * children: the ways in (AuthWayButton / GoogleButton with `edge`)
 * error: what the server said, under them
 * more: the account line ("New to Emoorm? Create an account")
 * onHelp / onTerms / onPrivacy: Trouble signing in?, and the terms' links
 */
export default function AuthChoose({
  title, sub, scene, children, error, more, onHelp, onTerms, onPrivacy,
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // min(232px, 60vw): large, its lower part dissolving into the band.
  const artSize = Math.min(232, Math.round(width * 0.6));
  return (
    <View style={styles.choose}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
        <View style={styles.art}>
          <AuthScene name={scene} size={artSize} fade />
        </View>
      </View>
      <View style={styles.bodyWrap}>
        {/* The gentle curve: the top of a half-ellipse as wide as the screen, 26px tall. */}
        <Svg width="100%" height={26} viewBox="0 0 100 26" preserveAspectRatio="none">
          <Path d="M0 26A50 26 0 0 1 50 0A50 26 0 0 1 100 26Z" fill={t.neutral[0]} />
        </Svg>
        <View style={[styles.body, { paddingBottom: 14 + insets.bottom }]}>
          <View style={styles.buttons}>{children}</View>
          {error ? (
            <View accessibilityRole="alert" style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {more ? <Text style={styles.more}>{more}</Text> : null}
          <Text accessibilityRole="link" onPress={onHelp} style={styles.help}>Trouble signing in?</Text>
          <View style={styles.termsBox}>
            <Text style={styles.terms}>
              By continuing, you agree to{'\n'}Emoorm&apos;s{' '}
              <Text accessibilityRole="link" style={styles.termsLink} onPress={onTerms}>Terms</Text>
              {' & '}
              <Text accessibilityRole="link" style={styles.termsLink} onPress={onPrivacy}>Privacy Policy</Text>
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** The green link inside `more` ("Create an account", "Log in"). */
export function AuthChooseLink({ children, onPress }) {
  return <Text accessibilityRole="link" onPress={onPress} style={styles.moreLink}>{children}</Text>;
}

const styles = themed(() => StyleSheet.create({
  statusStrip: { backgroundColor: BAND_STATUS_BAR },
  // Until it is measured: the band's top edge, not a white flash.
  band: { flex: 1, backgroundColor: BAND_STATUS_BAR, overflow: 'hidden' },

  // 12px under the bar: the website's sheet puts a 12px gap between its bar and the form.
  choose: { flexGrow: 1, paddingTop: 12 },
  // The band's words stay the light palette's: the band is light in either mode.
  hero: { alignItems: 'center' },
  title: {
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.25,
    color: LIGHT.primary[700],
    textAlign: 'center',
    ...font(500),
  },
  // Close under the headline: one lockup.
  sub: {
    marginTop: 2, fontSize: 14.5, lineHeight: 19.575, color: LIGHT.neutral[600], textAlign: 'center', ...font(400),
  },
  // The scene runs 22px under the white curve (the body is drawn over it).
  art: {
    marginTop: 4, marginBottom: -22, alignItems: 'center', zIndex: 0,
  },

  bodyWrap: { flexGrow: 1, marginHorizontal: -20, zIndex: 1 },
  // 28px from the curve's crest to the first button.
  body: {
    flexGrow: 1, paddingTop: 2, paddingHorizontal: 20, backgroundColor: t.neutral[0],
  },
  buttons: { gap: 12 },
  errorBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: t.danger[50],
    borderWidth: 1,
    borderColor: t.danger[200],
    borderRadius: 4,
  },
  errorText: {
    fontSize: 14, lineHeight: 22.4, color: t.danger[500], textAlign: 'center', ...font(400),
  },
  more: {
    marginTop: 22, fontSize: 14.5, lineHeight: 21.75, color: t.neutral[600], textAlign: 'center', ...font(400),
  },
  moreLink: { color: t.primary[700], ...font(500) },
  help: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 15,
    lineHeight: 22.5,
    color: t.primary[700],
    ...font(500),
  },
  // At the foot of the screen.
  termsBox: {
    marginTop: 'auto',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: t.neutral[200],
  },
  terms: {
    fontSize: 13, lineHeight: 19.5, color: t.neutral[500], textAlign: 'center', ...font(400),
  },
  termsLink: { color: t.primary[700] },
}));
