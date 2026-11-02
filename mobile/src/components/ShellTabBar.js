import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, ChatCircleIcon, HouseIcon, ShoppingCartIcon, UserIcon } from '../lib/icons';
import { GlassBackdrop, floatingTabBar, liquidGlass } from './Glass';
import { openAccountSheet } from './AccountSheet';
import { longPressTab, pressTab } from './tabBarEvents';
import { colors, font, ink, t, text, themed, veil } from '../theme';

// The website draws these at 21 with --icon-zoom 1.4 in its phone view
// (.mobile-bottom-nav in Header.css), so 29 is the same icon at the same
// size, and the label under it is the website's 9px.
const ICON = 29;
// Lines stay this thick on screen, however large a tab's drawing is.
const STROKE = 1.5;

// The five drawings do not fill their square alike: at one size the bell is
// 14 units wide and sits 2 low, the person is 13, the rest are 16 to 18. These
// draw those two larger (and the bell higher) so all five look one size. A
// count rides on top of the icon and has no say in any of this.
const TABS = {
  index: { label: 'Home', Icon: HouseIcon },
  cart: { label: 'Cart', Icon: ShoppingCartIcon },
  messages: { label: 'Messages', Icon: ChatCircleIcon },
  notifications: { label: 'Notifications', Icon: BellIcon, size: 33, lift: -2 },
  profile: { label: 'Profile', Icon: UserIcon, size: 33 },
};

/**
 * The buyer bottom navigation on phones (web .mobile-bottom-nav): five tabs,
 * a light icon that fills in on the active tab, the label always shown, red
 * counts on the icon's corner. It belongs to the five tab pages only, so it
 * hides on the other routes living in the tab navigator (products, orders).
 * badges: { [routeName]: number }
 *
 * iOS 26: the same bar, full width, lying over the bottom of the page with a
 * Liquid Glass background the page shows through (the product page's bottom
 * bar's look). Elsewhere it sits under the page, white.
 */
export default function ShellTabBar({ badges = {}, ...nav }) {
  const { state } = nav;
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  if (!TABS[current]) return null;

  return (
    <View
      style={[
        styles.bar,
        liquidGlass && styles.barGlass,
        floatingTabBar && styles.barOver,
        { paddingBottom: Math.max(8, insets.bottom) },
      ]}
      accessibilityRole="tablist"
    >
      <GlassBackdrop radius={0} white={0.62} />
      {state.routes.filter((route) => TABS[route.name]).map((route) => {
        const { label, Icon, size = ICON, lift = 0 } = TABS[route.name];
        const active = route.name === current;
        const color = active ? t.primary[600] : text.muted;
        const count = Number(badges[route.name] || 0);
        const onPress = () => pressTab(nav, route, active);
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count ? `${label}, ${count}` : label}
            onPress={onPress}
            onLongPress={() => {
              longPressTab(nav, route);
              // Hold Profile: the account sheet (switch account, log out).
              if (route.name === 'profile') openAccountSheet();
            }}
            delayLongPress={350}
            style={styles.tab}
          >
            <View style={styles.iconBox}>
              <Icon size={size} color={color} weight={active ? 'fill' : 'light'} strokeWidth={STROKE * (ICON / size)} style={lift ? { top: lift } : undefined} />
              {count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  // iOS 26: over the bottom of the page, full width, so it shows through.
  barOver: { position: 'absolute', left: 0, right: 0, bottom: 0, boxShadow: undefined },
  // iOS 26: Liquid Glass behind the icons instead of the website's white.
  barGlass: { backgroundColor: 'transparent' },
  bar: {
    flexDirection: 'row',
    minHeight: 74,
    paddingTop: 7,
    paddingHorizontal: 6,
    // Solid, not 98%: at 0.98 a page scrolling underneath showed
    // faintly through the bar, which read as a rendering fault rather
    // than as depth. The iOS 26 glass bar above is a separate style and
    // still shows through on purpose.
    backgroundColor: veil(1),
    boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 16, color: ink(0.08) }],
  },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3 },
  // The icon keeps this box whether or not it is wearing a count. The
  // badge is laid over its top-right corner from outside the flow, so a
  // tab with a number on it is exactly as wide as one without and the
  // icon never gives up room to make space for it.
  iconBox: { width: ICON, height: ICON, alignItems: 'center', justifyContent: 'center' },
  // 9, as the website's .mobile-bottom-nav (Header.css).
  label: { fontSize: 9, lineHeight: 11, ...font(500) },
  badge: {
    position: 'absolute',
    top: -7,
    right: -10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.danger[500],
  },
  // The badge is the same red in either mode, so its count stays white.
  badgeText: { fontSize: 9, lineHeight: 10, color: colors.white, ...font(500) },
}));
