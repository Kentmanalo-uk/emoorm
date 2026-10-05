import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatCircleDotsIcon, HouseIcon, MegaphoneIcon, PackageIcon, UserIcon } from 'phosphor-react-native';
import { font, t } from '../../theme';
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
export default function SellerTabBar({ state, navigation }) {
  const insets = useSafeAreaInsets();
  const { waiting } = useSellerShell();
  const current = state.routes[state.index]?.name;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom) }]} accessibilityRole="tablist" accessibilityLabel="Seller sections">
      {state.routes.filter((route) => TABS[route.name]).map((route) => {
        const { label, Icon, badge } = TABS[route.name];
        const active = route.name === current;
        const color = active ? t.primary[600] : t.neutral[500];
        const count = badge ? Number(waiting[badge]?.count || 0) : 0;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={count ? `${label}, ${count} unread` : label}
            onPress={onPress}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
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

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    minHeight: 68,
    paddingTop: 7,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: t.neutral[200],
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 16, color: 'rgba(15, 23, 42, 0.08)' }],
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
  badgeText: { fontSize: 9, lineHeight: 10, color: '#fff', ...font(700) },
});
