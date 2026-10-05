import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/questions — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerQuestions.jsx.
export default function SellerQuestionsScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerQuestions.jsx" />
    </SellerPage>
  );
}
