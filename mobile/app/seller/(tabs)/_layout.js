import { Tabs } from 'expo-router';
import SellerTabBar from '../../../src/components/seller/SellerTabBar';

// The phone tab bar's five pages (web SellerLayout PHONE_TABS): Home, My
// products, Chat, Marketing, Me. Every other Seller Center page is outside
// this group, so the bar shows on these five only, as on the website.
export default function SellerTabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: '#fff' } }} tabBar={(props) => <SellerTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="products" options={{ title: 'My products' }} />
      <Tabs.Screen name="messages" options={{ title: 'Chat' }} />
      <Tabs.Screen name="marketing" options={{ title: 'Marketing' }} />
      <Tabs.Screen name="menu" options={{ title: 'Me' }} />
    </Tabs>
  );
}
