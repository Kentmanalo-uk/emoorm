import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import SellerPage from '../../../src/components/seller/SellerPage';
import { SellerProductsHeader } from '../../../src/components/seller/SellerTopBars';
import SellerProductsList from '../../../src/components/seller/products/SellerProductsList';

// /seller/products (My products): the phone list of web/src/pages/
// SellerProducts.jsx. The bar is SellerProductsHeader (+ Add product, bell, ⋯);
// the body brings its own FlatList (SellerProductsList).
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
      <SellerProductsList />
    </SellerPage>
  );
}
