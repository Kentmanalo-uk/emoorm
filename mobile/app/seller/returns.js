import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/returns — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerReturns.jsx.
export default function SellerReturnsScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerReturns.jsx" />
    </SellerPage>
  );
}
