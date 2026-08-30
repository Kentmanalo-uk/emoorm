import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet } from 'react-native';
import { HouseIcon as Home, ShoppingCartIcon as ShoppingCart, ChatCircleIcon as MessageCircle, BellIcon as Bell, UserIcon as User } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fontFamily, spacing } from '../../src/theme';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import useCartStore from '../../src/store/cartStore';
import useAuthStore from '../../src/store/authStore';

// Bottom nav: Home (absorbs product browsing), Cart, Messages, Notifications, Profile.
// `products` and `orders` stay as routable screens (linked from Home/Profile) but are
// hidden from the tab bar via `href: null`, per expo-router's convention for that.
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const cartCount = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));
  const [messageCount, setMessageCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);

  const refreshBadges = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const [conversations, notifications] = await Promise.all([
        apiClient.get(ENDPOINTS.MESSAGES.CONVERSATIONS),
        apiClient.get(ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT),
      ]);
      setMessageCount((conversations.data || [])
        .filter((item) => item.role !== 'seller')
        .reduce((total, item) => total + Number(item.unreadCount || 0), 0));
      setNotificationCount(Number(notifications.data?.count || 0));
    } catch {
      // Badge polling is best-effort and should not interrupt navigation.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMessageCount(0);
      setNotificationCount(0);
      return undefined;
    }
    refreshBadges();
    const interval = setInterval(refreshBadges, 30000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshBadges();
    });
    return () => { clearInterval(interval); subscription.remove(); };
  }, [isAuthenticated, refreshBadges]);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontFamily: fontFamily.medium,
          fontSize: 11,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: spacing.xs,
        },
        tabBarButton: (props) => <Pressable {...props} android_ripple={null} />,
        tabBarStyle: {
          paddingTop: spacing.xs,
          paddingBottom: insets.bottom ? insets.bottom + spacing.xs : spacing.sm,
          height: 56 + (insets.bottom ? insets.bottom + spacing.xs : spacing.sm),
          borderTopWidth: StyleSheet.hairlineWidth,
          elevation: 0,
          shadowOpacity: 0,
          borderTopColor: colors.borderLight,
          backgroundColor: colors.white,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => <Home color={color} size={size} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Cart',
          tabBarBadge: cartCount || undefined,
          tabBarIcon: ({ color, size, focused }) => <ShoppingCart color={color} size={size} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarBadge: messageCount || undefined,
          tabBarIcon: ({ color, size, focused }) => <MessageCircle color={color} size={size} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarBadge: notificationCount || undefined,
          tabBarIcon: ({ color, size, focused }) => <Bell color={color} size={size} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => <User color={color} size={size} weight={focused ? 'fill' : 'regular'} />,
        }}
      />
      <Tabs.Screen name="products" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
    </Tabs>
  );
}
