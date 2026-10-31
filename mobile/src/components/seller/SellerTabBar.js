import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatCircleDotsIcon, HouseIcon, MegaphoneIcon, PackageIcon, UserIcon } from '../../lib/icons';
import { colors, font, ink, t, themed, veil } from '../../theme';
import { GlassBackdrop, floatingTabBar, liquidGlass } from '../Glass';
import { openAccountSheet } from '../AccountSheet';
import { longPressTab, pressTab } from '../tabBarEvents';
import { useSellerShell } from './SellerShell';

// The tabs, by route name in app/seller/(tabs).
const TABS = {
  index: { label: 'Home', Icon: HouseIcon },
  products: { label: 'My products', Icon: PackageIcon },
  messages: { label: 'Chat', Icon: ChatCircleDotsIcon, badge: '/seller/messages' },
  marketing: { label: 'Marketing', Icon: MegaphoneIcon },
  menu: { label: 'Me', Icon: UserIcon },
};

/**
 * The Seller Center's phone tab bar (web SellerLayout.jsx .sc-tabbar--app,
 * SellerMobile.css): Home, My products, Chat, Marketing, Me. A light icon
 * that fills in on the active tab, 11px labels, green when active, and the
 * unread chats as a red count on Chat. For <Tabs tabBar={…}>.
 */
export default function SellerTabBar(nav) {
  const { state } = nav;
  const insets = useSafeAreaInsets();
  const { waiting } = useSellerShell();
  const current = state.routes[state.index]?.name;

  return (
    <View
      style={[styles.bar, liquidGlass && styles.barGlass, floatingTabBar && styles.barOver, { paddingBottom: Math.max(8, insets.bottom) }]}
      accessibilityRole="tablist"
      accessibilityLabel="Seller sections"
    >
      <GlassBackdrop radius={0} white={0.62} />
      {state.routes.filter((route) => TABS[route.name]).map((route) => {
        const { label, Icon, badge } = TABS[route.name];
        const active = route.name === current;
        const color = active ? t.primary[600] : t.neutral[500];
        const count = badge ? Number(waiting[badge]?.count || 0) : 0;
        const onPress = () => pressTab(nav, route, active);
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count ? `${label}, ${count} unread` : label}
            onPress={onPress}
            onLongPress={() => {
              longPressTab(nav, route);
              // Hold Me: the account sheet (switch account, log out).
              if (route.name === 'menu') openAccountSheet();
            }}
            delayLongPress={350}
            style={styles.tab}
          >
            <View>
              <Icon size={28} color={color} weight={active ? 'fill' : 'light'} />
              {count > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
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
  // iOS 26: Liquid Glass behind the icons instead of the website's white.
  barGlass: { backgroundColor: 'transparent' },
  // iOS 26: over the bottom of the page, full width, so the page shows through.
  barOver: { position: 'absolute', left: 0, right: 0, bottom: 0, boxShadow: undefined },
  bar: {
    flexDirection: 'row',
    minHeight: 68,
    paddingTop: 7,
    paddingHorizontal: 6,
    backgroundColor: veil(0.98),
    boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 16, color: ink(0.08) }],
  },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { maxWidth: '100%', fontSize: 11, lineHeight: 12.1, ...font(500) },
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
  badgeText: { fontSize: 9, lineHeight: 10, color: colors.white, ...font(700) },
}));
