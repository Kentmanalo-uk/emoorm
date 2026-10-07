import DealList from '../components/offers/DealList';
import '../components/offers/Offers.css';

/*
 * The buyer's offers on livestock: each is talked over in its chat with the
 * seller, so a deal opens its chat.
 */

export default function ProfileOffers() {
  return (
    <div className="profile-page-wrap of-page">
      <header className="profile-page-header">
        <h1 className="profile-page-title">My Offers</h1>
        <p className="profile-page-subtitle">Your offers on livestock. Talk them over in chat, meet the seller, and pay in person.</p>
      </header>
      <DealList side="buyer" />
    </div>
  );
}
