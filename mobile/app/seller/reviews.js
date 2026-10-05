import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/reviews — STUB: the bar is done (SellerPage → SellerBackBar with the
// phone title). Port the body from web/src/pages/SellerReviews.jsx.
export default function SellerReviewsScreen() {
  return (
    <SellerPage>
      <SellerPlaceholder source="web/src/pages/SellerReviews.jsx" />
    </SellerPage>
  );
}
