import { Link, useLocation, useSearchParams } from 'react-router-dom';
import SupportChat from '../components/support/SupportChat';

/**
 * My support cases: every case the person opened, the thread for the one they
 * picked, and the rating prompt once an admin resolves it. Cases can also be
 * started from here — the page used to be read-only, which made it a dead end.
 */
export default function ProfileSupport() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  return (
    <div className="profile-page-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">Help &amp; Support</h1>
        <p className="profile-page-subtitle">
          Your support cases with the municipal team. Looking for an answer instead?{' '}
          <Link to="/help" className="help-topic-link">Browse Help &amp; Support</Link>.
        </p>
      </header>
      <SupportChat
        mode="user"
        initialConversationId={searchParams.get('c')}
        initialDraft={location.state?.draft || ''}
      />
    </div>
  );
}
