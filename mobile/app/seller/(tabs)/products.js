import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SellerPage from '../../../src/components/seller/SellerPage';
import { SellerProductsHeader } from '../../../src/components/seller/SellerTopBars';
import { LegacyProducts } from '../../../src/components/seller/legacy/LegacySellerScreens';

// /seller/products (My products). STUB: the bar is done (SellerProductsHeader:
// + Add product, bell, ⋯). Port the body from web/src/pages/SellerProducts.jsx
// (the phone list); until then the old inventory keeps the page useful.
export default function SellerProductsScreen() {
  const router = useRouter();
  const { edit } = useLocalSearchParams();
  // The website edits a product at /seller/products?edit=<id> (no tab bar):
  // the app's product form is /seller/products/new?edit=<id>.
  useEffect(() => {
    if (edit) router.replace({ pathname: '/seller/products/new', params: { edit } });
  }, [edit, router]);
  return (
    <SellerPage header={<SellerProductsHeader />} scroll={false}>
      <LegacyProducts />
    </SellerPage>
  );
}
