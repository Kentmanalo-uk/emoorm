import SellerPage from '../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../src/components/seller/SellerPlaceholder';

// /seller/fulfillment — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerFulfillment.jsx.
export default function SellerFulfillmentScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerFulfillment.jsx" />
    </SellerPage>
  );
}
