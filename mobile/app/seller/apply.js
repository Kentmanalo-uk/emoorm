import { Redirect } from 'expo-router';

// /seller/apply: the website's address for the seller application, which
// the app keeps at /seller-apply (links such as the footer's keep working).
export default function SellerApplyRedirect() {
  return <Redirect href="/seller-apply" />;
}
