import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/verification — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerVerification.jsx.
export default function SellerVerificationScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerVerification.jsx" />
    </SellerPage>
  );
}
