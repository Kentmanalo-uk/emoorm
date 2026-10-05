import SellerPage from '../../../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../../../src/components/seller/SellerPlaceholder';

// /seller/decorate/templates/:key — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerDecorate.jsx (SellerTemplatePreview).
export default function SellerTemplatePreviewScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerDecorate.jsx" />
    </SellerPage>
  );
}
