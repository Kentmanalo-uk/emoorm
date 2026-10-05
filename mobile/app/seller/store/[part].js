import SellerPage from '../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../src/components/seller/SellerPlaceholder';

// /seller/store/:part — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerStore.jsx (one part: about, branding, location, colors).
export default function SellerStorePartScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerStore.jsx" />
    </SellerPage>
  );
}
