import SellerPage from '../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../src/components/seller/SellerPlaceholder';

// /seller/marketing. STUB: the bar is done (SellerTabHeader "Marketing" with
// the bell and ⋯). Port the body from web/src/pages/SellerMarketing.jsx +
// SellerApp.css (.smk-*).
export default function SellerMarketingScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerMarketing.jsx" />
    </SellerPage>
  );
}
