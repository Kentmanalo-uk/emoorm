import { Redirect } from 'expo-router';

// /seller/setup: shop setup was removed on the website; old links land on Home.
export default function SellerSetupRedirect() {
  return <Redirect href="/seller" />;
}
