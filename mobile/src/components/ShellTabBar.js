import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, ChatCircleIcon, HouseIcon, ShoppingCartIcon, UserIcon } from 'phosphor-react-native';
import { border, font, t, text } from '../theme';

const TABS = {
  index: { label: 'Home', Icon: HouseIcon },
  cart: { label: 'Cart', Icon: ShoppingCartIcon },
  messages: { label: 'Messages', Icon: ChatCircleIcon },
  notifications: { label: 'Notifications', Icon: BellIcon },
  profile: { label: 'Profile', Icon: UserIcon },
};

/**
 * The buyer bottom navigation on phones (web .mobile-bottom-nav): five tabs,
 * a light icon that fills in on the active tab, the label always shown, red
 * counts on the icon's corner. It belongs to the five tab pages only, so it
 * hides on the other routes living in the tab navigator (products, orders).
 * badges: { [routeName]: number }
 */
export default function ShellTabBar({ state, navigation, badges = {} }) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  if (!TABS[current]) return null;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom) }]} accessibilityRole="tablist">
      {state.routes.filter((route) => TABS[route.name]).map((route) => {
        const { label, Icon } = TABS[route.name];
        const active = route.name === current;
        const color = active ? t.primary[600] : text.muted;
        const count = Number(badges[route.name] || 0);
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count ? `${label}, ${count}` : label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={styles.tab}
          >
            <View>
              <Icon size={28} color={color} weight={active ? 'fill' : 'light'} />
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    minHeight: 74,
    paddingTop: 7,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: border.default,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 16, color: 'rgba(15, 23, 42, 0.08)' }],
  },
  tab: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, lineHeight: 12.1, ...font(500) },
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
  badgeText: { fontSize: 9, lineHeight: 10, color: t.neutral[0], ...font(500) },
});
