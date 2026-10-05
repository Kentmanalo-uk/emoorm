import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * The thin camera drawn in the website's phone search bars (SearchStart.jsx
 * .ss-camera, Products.jsx .srch-m-camera): a 20-unit drawing shown at 26px.
 */
export default function SearchCameraGlyph({ size = 26, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <Rect x="2" y="5" width="16" height="11" rx="2" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <Circle cx="10" cy="10" r="2.5" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      <Path d="M7 5L8 3H12L13 5" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
    </Svg>
  );
}
