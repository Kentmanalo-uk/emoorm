import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/settings — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerSettings.jsx.
export default function SellerSettingsScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerSettings.jsx" />
    </SellerPage>
  );
}
