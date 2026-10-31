import { Fragment, useEffect } from 'react';
import { Appearance, Platform } from 'react-native';
import useThemeStore, { useResolvedScheme } from '../store/themeStore';
import { setActiveScheme, useScheme } from './index';

/**
 * Keeps the painted palette in step with the setting.
 *
 * The palette lives outside React (src/theme/index.js) so that a stylesheet
 * can read it while it is being built; this component is what connects the
 * two. It sets the palette before its children render, so nothing paints the
 * old one first, and the pages already open are rebuilt by the navigator
 * (app/_layout.js, repaintOnTheme).
 */
export default function ThemeGate({ children }) {
  const scheme = useResolvedScheme();
  const preference = useThemeStore((s) => s.preference);

  // Set during render, ahead of the children, so the first paint is right.
  // No subscription is needed here: the store already re-renders this when
  // the choice changes, and that re-render reaches the navigator, which
  // rebuilds its pages on the new palette (app/_layout.js, repaintOnTheme).
  setActiveScheme(scheme);

  /*
   * iOS draws its own parts over the app — the glass bars, sheets, menus and
   * the keyboard — so it is told which way the app is painted, and clearing
   * the override (null) hands those back to the phone's setting.
   *
   * Android is left alone on purpose. Passing null there crashes inside the
   * native module, and overriding with a value would defeat "Follow my
   * phone": setColorScheme is also what useColorScheme reads back, so the
   * app would be told its own answer and stop noticing the phone changing.
   */
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const forced = preference === 'light' || preference === 'dark';
    try { Appearance.setColorScheme(forced ? preference : null); } catch { /* older runtimes */ }
  }, [preference]);

  return <Fragment>{children}</Fragment>;
}

export { useScheme };
