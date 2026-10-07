import SellerPageHead from '../components/seller/SellerPageHead';
import DealList from '../components/offers/DealList';
import '../components/offers/Offers.css';

/*
 * Seller Center: the deals buyers started on the shop's livestock. Each is
 * talked over in its chat (accept, answer with a price, or decline; then
 * meet and mark it as done), so a deal opens its chat.
 */

export default function SellerOffers() {
  return (
    <div className="seller-dashboard">
      <div className="seller-container of-page">
        <SellerPageHead title="Offers" subtitle="Buyers' offers on your livestock. Talk each one over in chat, meet, then mark it as done." />
        <DealList side="seller" />
      </div>
    </div>
  );
}
