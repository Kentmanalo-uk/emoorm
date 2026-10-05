import SellerPage from '../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../src/components/seller/SellerPlaceholder';

// /seller/products/new — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerProducts.jsx (the product form; ?edit=<id> edits).
export default function SellerProductFormScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerProducts.jsx" />
    </SellerPage>
  );
}
