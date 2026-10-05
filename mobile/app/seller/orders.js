import SellerPage from '../../src/components/seller/SellerPage';
import { LegacyOrders } from '../../src/components/seller/legacy/LegacySellerScreens';

// /seller/orders (My orders). STUB: the bar is done (SellerBackBar "My
// orders", ⋯). Port the body from web/src/pages/SellerOrders.jsx +
// SellerOrders.css / SellerPhoneFit.css; until then the old order list (with
// its status flows) keeps the page useful.
export default function SellerOrdersScreen() {
  return (
    <SellerPage scroll={false}>
      <LegacyOrders />
    </SellerPage>
  );
}
