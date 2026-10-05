import { StyleSheet, Text, View } from 'react-native';
import { CaretLeftIcon } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { border, font, t, text } from '../theme';
import ShellBarButton from './ShellBarButton';
import ShellPageMenu from './ShellPageMenu';

/**
 * The back bar of an inner page on phones (web .layout-back-bar): back arrow,
 * the page title, then the page's own actions and the ⋯ page menu.
 *
 * action: the page's own button(s) at the right end, before the menu
 *   (use ShellBarButton for the website's 40px plain icon look).
 * menu: false hides the ⋯ menu (pages whose website version has no bar menu).
 * menuItems: this page's own actions listed first in the ⋯ menu
 *   ([{ key, Icon, label, onPress?, to?, danger? }]).
 * onBack / backTo: what Back does; by default it goes back, or to backTo
 *   (Home) when there is no history.
 * subtitle: a second line under the title. The website's bar has none, so
 *   ported pages put that text in the page instead.
 */
export default function ScreenHeader({
  title, subtitle, action, menu = true, menuItems, onBack, backTo = '/',
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const goBack = onBack || (() => (router.canGoBack() ? router.back() : router.replace(backTo)));
  return (
    <View style={[styles.bar, { paddingTop: insets.top, height: 52 + insets.top }]}>
      <ShellBarButton label="Back" onPress={goBack}>
        <CaretLeftIcon size={22} weight="bold" color={text.strong} />
      </ShellBarButton>
      <View style={styles.text}>
        {title ? <Text style={styles.title} numberOfLines={1} accessibilityRole="header">{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {action || menu ? (
        <View style={styles.end}>
          {action}
          {menu ? <ShellPageMenu extra={menuItems} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    backgroundColor: t.neutral[0],
    borderBottomWidth: 1,
    borderBottomColor: border.default,
    zIndex: 120,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, lineHeight: 22.8, color: text.strong, ...font(500) },
  subtitle: { fontSize: 13, lineHeight: 16, color: text.muted, ...font(400) },
  end: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: 'auto' },
});
