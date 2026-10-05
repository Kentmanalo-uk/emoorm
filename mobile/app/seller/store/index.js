import SellerPage from '../../../src/components/seller/SellerPage';
import { LegacyStoreSettings } from '../../../src/components/seller/legacy/LegacySellerScreens';

// /seller/store (Shop profile). STUB: the bar is done (SellerBackBar "Shop
// profile", ⋯). Port the body from web/src/pages/SellerStore.jsx (the list
// of parts, each opening /seller/store/<part>); until then the old store
// editor keeps the page useful.
export default function SellerStoreScreen() {
  return (
    <SellerPage scroll={false}>
      <LegacyStoreSettings />
    </SellerPage>
  );
}
