import { useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import SupportChat from '../components/support/SupportChat';
import SellerPageHead from '../components/seller/SellerPageHead';
import './SellerDashboard.css';

/*
 * Message the admin: the seller's cases with the municipal admin office of
 * the shop's town (the same help chat buyers use, from the seller's side).
 */
export default function SellerSupport() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const ctx = useOutletContext();
  const town = ctx?.store?.municipality?.name;
  const conversationId = searchParams.get('c');
  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Message the admin"
          subtitle={town
            ? `Questions about your shop go to the municipal admin of ${town}.`
            : 'Questions about your shop go to your municipal admin.'}
        />
        <SupportChat
          key={conversationId || 'inbox'}
          mode="user"
          initialConversationId={conversationId}
          initialDraft={location.state?.draft || ''}
        />
      </div>
    </div>
  );
}
