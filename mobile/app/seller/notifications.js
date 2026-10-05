import { useRouter } from 'expo-router';
import SellerPage from '../../src/components/seller/SellerPage';
import SellerNotifications from '../../src/components/SellerNotifications';
import { useSellerShell } from '../../src/components/seller/SellerShell';
import { LEGACY_ROUTES } from '../../src/components/seller/legacy/LegacySellerScreens';

// /seller/notifications. STUB: the bar is done. Port the body from
// web/src/pages/Notifications.jsx (mode="SELLER" bare shell="seller"); until
// then the app's older seller notification list keeps the page useful.
export default function SellerNotificationsScreen() {
  const router = useRouter();
  const { refreshCounts } = useSellerShell();
  return (
    <SellerPage scroll={false}>
      <SellerNotifications onNavigate={(tab) => router.push(LEGACY_ROUTES[tab] || '/seller')} onUnreadChange={refreshCounts} />
    </SellerPage>
  );
}
