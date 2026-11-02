import { Tabs, usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import apiClient from '../../src/api/client';
import { ENDPOINTS } from '../../src/api/endpoints';
import ShellTabBar from '../../src/components/ShellTabBar';
import useCartStore from '../../src/store/cartStore';
import useAuthStore from '../../src/store/authStore';

// Bottom nav (the website's .mobile-bottom-nav): Home, Cart, Messages,
// Notifications, Profile. Products and My Purchase live outside the tabs
// (app/products.js, app/orders.js), so the bar shows on these five only, as
// the website shows it.
//
// Every phone shows the website's bar and icons (ShellTabBar); on iOS 26 its
// background is Liquid Glass.
export default function TabsLayout() {
  const pathname = usePathname();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const cartCount = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0));
  const [messageCount, setMessageCount] = useState(0);
  const [notificationCount, setNotificationCount] = useState(0);

  // The same counts the website's header reads.
  const refreshBadges = useCallback(async () => {
    if (!isAuthenticated) return;
    const [notifications, chats] = await Promise.all([
      apiClient.get(ENDPOINTS.NOTIFICATIONS.UNREAD_COUNT, { params: { audience: 'BUYER' } }).catch(() => null),
      apiClient.get('/messages/unread-count').catch(() => null),
    ]);
    if (notifications) setNotificationCount(Number(notifications.data?.count || 0));
    if (chats) setMessageCount(Number(chats.data?.count || 0));
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setMessageCount(0);
      setNotificationCount(0);
      return undefined;
    }
    // Only while the app is in front. A timer keeps firing with the
    // app in the background -- a request every 30 seconds, waking the
    // radio, for counts nobody is looking at. Nothing is lost by
    // stopping: the listener below refreshes the moment it comes back.
    let interval = null;
    const start = () => { interval = interval || setInterval(refreshBadges, 30000); };
    const stop = () => { if (interval) { clearInterval(interval); interval = null; } };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { refreshBadges(); start(); } else stop();
    });
    return () => { stop(); subscription.remove(); };
  }, [isAuthenticated, refreshBadges]);

  // Opening a tab (reading chats there, say) refreshes the counts.
  useEffect(() => { refreshBadges(); }, [pathname, refreshBadges]);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => (
        <ShellTabBar {...props} badges={{ cart: cartCount, messages: messageCount, notifications: notificationCount }} />
      )}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
