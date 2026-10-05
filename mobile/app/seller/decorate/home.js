import SellerPage from '../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../src/components/seller/SellerPlaceholder';

// /seller/decorate/home — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerShopHome.jsx.
export default function SellerShopHomeScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerShopHome.jsx" />
    </SellerPage>
  );
}
