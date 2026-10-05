import SellerPage from '../../src/components/seller/SellerPage';
import { LegacyInsights } from '../../src/components/seller/legacy/LegacySellerScreens';

// /seller/analytics. STUB: the bar is done (SellerBackBar "Analytics", ⋯).
// Port the body from web/src/pages/SellerAnalytics.jsx; until then the old
// insights keep the page useful.
export default function SellerAnalyticsScreen() {
  return (
    <SellerPage scroll={false}>
      <LegacyInsights />
    </SellerPage>
  );
}
