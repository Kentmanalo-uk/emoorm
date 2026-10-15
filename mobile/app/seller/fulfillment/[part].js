import { useLocalSearchParams } from 'expo-router';
import SellerFulfillmentScreen from '../../../src/components/seller/fulfillment/SellerFulfillmentScreen';

// /seller/fulfillment/:part: one part (method, pickup, delivery, payment) with
// Cancel and Save changes at the bottom (web/src/pages/SellerFulfillment.jsx).
// Keyed by the part: each part starts from the saved settings.
export default function SellerFulfillmentPartScreen() {
  const { part } = useLocalSearchParams();
  const name = Array.isArray(part) ? part[0] : part;
  return <SellerFulfillmentScreen key={name || 'all'} part={name || null} />;
}
