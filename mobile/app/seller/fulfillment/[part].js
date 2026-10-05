import SellerPage from '../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../src/components/seller/SellerPlaceholder';

// /seller/fulfillment/:part — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerFulfillment.jsx (one part: method, pickup, delivery, payment).
export default function SellerFulfillmentPartScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerFulfillment.jsx" />
    </SellerPage>
  );
}
