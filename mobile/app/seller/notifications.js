import SellerPage from '../../src/components/seller/SellerPage';
import SellerNotifications from '../../src/components/SellerNotifications';
import { useSellerShell } from '../../src/components/seller/SellerShell';

// /seller/notifications: web/src/pages/Notifications.jsx (mode="SELLER"
// bare shell="seller") on phones. The bar (SellerBackBar) names the page;
// the list refreshes the bell's count after a change, and shows the
// "Private until approved" line at its top (it scrolls with the list).
export default function SellerNotificationsScreen() {
  const { refreshCounts } = useSellerShell();
  return (
    <SellerPage scroll={false} privateLine={false}>
      <SellerNotifications onUnreadChange={refreshCounts} />
    </SellerPage>
  );
}
