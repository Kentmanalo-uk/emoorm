import SellerPage from '../../src/components/seller/SellerPage';
import { useState } from 'react';
import DealList from '../../src/components/offers/DealList';

/**
 * /seller/offers (web/src/pages/SellerOffers.jsx): the deals buyers started
 * on the shop's livestock. Each is talked over in its chat (accept, answer
 * with a price, or decline; then meet and mark it as done), so a deal opens
 * its chat. On phones the page's heading gives way to the bar's title.
 */
export default function SellerOffersScreen() {
  const [pullKey, setPullKey] = useState(0);
  return (
    <SellerPage title="Offers" contentStyle={{ flexGrow: 1 }} onRefresh={() => setPullKey((key) => key + 1)}>
      <DealList side="seller" refreshKey={pullKey} />
    </SellerPage>
  );
}
