import SellerPage from '../../../src/components/seller/SellerPage';
import { SellerHomeHeader } from '../../../src/components/seller/SellerTopBars';
import { LegacyOverview } from '../../../src/components/seller/legacy/LegacySellerScreens';

// /seller (Home). STUB: the shop header is done (SellerHomeHeader). Port the
// body from web/src/pages/SellerDashboard.jsx (PhoneHome) + SellerApp.css
// (.sh-*); until then the old overview keeps the page useful.
export default function SellerHomeScreen() {
  return (
    <SellerPage header={<SellerHomeHeader />} scroll={false}>
      <LegacyOverview />
    </SellerPage>
  );
}
