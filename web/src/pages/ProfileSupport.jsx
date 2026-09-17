import { useLocation, useSearchParams } from 'react-router-dom';
import SupportChat from '../components/support/SupportChat';

export default function ProfileSupport() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  return (
    <div className="profile-page-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">Support Messages</h1>
      </header>
      <SupportChat
        mode="user"
        initialConversationId={searchParams.get('c')}
        initialDraft={location.state?.draft || ''}
      />
    </div>
  );
}
