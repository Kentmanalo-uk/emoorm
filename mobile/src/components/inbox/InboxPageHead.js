import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { border, font, t } from '../../theme';
import HeaderGlow from '../HeaderGlow';

/**
 * The title bar of the Messages and Notifications tabs on phones
 * (web .msgr-page-head / .notif-header / .login-gate-head, made solid
 * white bars with a hairline by phone-app.css): the page's top gap, then a
 * 48px row with the title (and a badge after it) and the page's tools.
 *
 * Render <InboxTopGap /> and this above the page's ScrollView: the bar stays
 * fixed at the top (as Home's search bar) and only the page under it scrolls.
 */
export default function InboxPageHead({
  title, badge, children, padLeft = 12, padRight = 12, toolGap = 8, style,
}) {
  return (
    <View style={[styles.bar, { paddingLeft: padLeft, paddingRight: padRight }, style]}>
      <View style={styles.left}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text>
        {badge}
      </View>
      {children ? <View style={[styles.tools, { gap: toolGap }]}>{children}</View> : null}
    </View>
  );
}

/** The page's padding above the bar (10px on the website) plus the status bar. */
export function InboxTopGap({ gap = 10 }) {
  const insets = useSafeAreaInsets();
  // The header's wash: from the screen's top down through the bar (49) under this gap.
  return (
    <View style={{ height: insets.top + gap, zIndex: 1 }}>
      <HeaderGlow height={insets.top + gap + BAR_HEIGHT} />
    </View>
  );
}

const BAR_HEIGHT = 49;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    height: BAR_HEIGHT,
    zIndex: 120,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  title: { flexShrink: 1, fontSize: 22, lineHeight: 25.3, color: t.neutral[900], ...font(500) },
  tools: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
});
