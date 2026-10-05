import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/support — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerSupport.jsx.
export default function SellerSupportScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerSupport.jsx" />
    </SellerPage>
  );
}
