import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/today — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerToday.jsx.
export default function SellerTodayScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerToday.jsx" />
    </SellerPage>
  );
}
