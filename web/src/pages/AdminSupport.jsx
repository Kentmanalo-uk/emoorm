import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/admin/AdminLayout';
import SupportChat from '../components/support/SupportChat';
import '../components/admin/AdminLayout.css';

export default function AdminSupport() {
  const [searchParams] = useSearchParams();
  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Support Messages</h1>
      </div>
      <SupportChat key={searchParams.get('c') || 'inbox'} mode="admin" initialConversationId={searchParams.get('c')} />
    </AdminLayout>
  );
}
