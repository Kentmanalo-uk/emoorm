import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/*
 * An app's share button, drawn the way that app's own icon is drawn:
 * its mark on its own colour, and for the two that use one, its own
 * gradient.
 *
 * The marks come from Phosphor's brand set, which the website uses too.
 * The companies' actual icon files are not bundled -- they are
 * trademarked artwork, and which of them a shop may ship is the shop's
 * decision, not something to settle by downloading a PNG. Each brand
 * publishes its own assets; drop them in and this component can point at
 * them instead.
 *
 * The colours and gradient stops below are each brand's published ones.
 */

const GRADIENTS = {
  instagram: [
    ['0%', '#FEDA75'],
    ['25%', '#FA7E1E'],
    ['50%', '#D62976'],
    ['75%', '#962FBF'],
    ['100%', '#4F5BD5'],
  ],
  messenger: [
    ['0%', '#00B2FF'],
    ['50%', '#006AFF'],
    ['100%', '#A033FF'],
  ],
  telegram: [
    ['0%', '#2AABEE'],
    ['100%', '#229ED9'],
  ],
};

/**
 * @param {String} [gradient] - a key of GRADIENTS; falls back to `color`
 * @param {String} color - the brand's flat colour
 * @param {Number} [size]
 */
export default function BrandDisc({ gradient, color, size = 52, children }) {
  const stops = gradient ? GRADIENTS[gradient] : null;
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2 }]}>
      {stops ? (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
          <Defs>
            {/* Corner to corner, as these brands draw theirs. */}
            <LinearGradient id={`b-${gradient}`} x1="0%" y1="100%" x2="100%" y2="0%">
              {stops.map(([offset, stopColor]) => (
                <Stop key={offset} offset={offset} stopColor={stopColor} stopOpacity="1" />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width={size} height={size} rx={size / 2} fill={`url(#b-${gradient})`} />
        </Svg>
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.centre, !stops && { backgroundColor: color, borderRadius: size / 2 }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
});
