import { useLocation, useSearchParams } from 'react-router-dom';
import SupportChat from '../components/support/SupportChat';
import './SellerDashboard.css';

export default function SellerSupport() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const conversationId = searchParams.get('c');
  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Admin Messages</h1>
            <p className="seller-welcome">Conversations with your municipal admin</p>
          </div>
        </div>
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
