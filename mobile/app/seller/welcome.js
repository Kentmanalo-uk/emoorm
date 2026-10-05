import SellerPage from '../../src/components/seller/SellerPage';
import SellerPlaceholder from '../../src/components/seller/SellerPlaceholder';

// /seller/welcome: the guided setup right after applying. STUB. On the
// website it is a full screen outside the Seller Center shell with its own
// top (.sw-top: the steps' progress bar and Skip), so it has no seller bar.
// Port it from web/src/pages/SellerWelcome.jsx + .css; its pictures are
// SellerGuideArt scenes (welcome, identity, business, branding, about,
// delivery, pickup, payment, product, ready). Before sending the seller to
// another page for a step, call setSetupReturn(stepKey) (src/lib/setupReturn.js)
// and read the `step` param when coming back; clearSetupReturn() when done.
export default function SellerWelcomeScreen() {
  return (
    <SellerPage header={false} privateLine={false}>
      <SellerPlaceholder source="web/src/pages/SellerWelcome.jsx" />
    </SellerPage>
  );
}
