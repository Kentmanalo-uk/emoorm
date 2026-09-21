import { useLocation, useSearchParams } from 'react-router-dom';
import SupportChat from '../components/support/SupportChat';
import SellerPageHead from '../components/seller/SellerPageHead';
import './SellerDashboard.css';

export default function SellerSupport() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const conversationId = searchParams.get('c');
  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Admin Messages"
          subtitle="Conversations with your municipal admin"
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
