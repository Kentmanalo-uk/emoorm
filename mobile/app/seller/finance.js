import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/finance — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerFinance.jsx.
export default function SellerFinanceScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerFinance.jsx" />
    </SellerPage>
  );
}
