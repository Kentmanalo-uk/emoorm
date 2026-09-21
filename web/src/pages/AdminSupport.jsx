import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../components/admin/AdminLayout';
import SupportChat from '../components/support/SupportChat';
import axios from '../lib/axios';
import '../components/admin/AdminLayout.css';

export default function AdminSupport() {
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get('c');
  // Set by "Message them" in the shell search, which knows a user id but not
  // whether a conversation with them exists yet.
  const openFor = searchParams.get('to');
  const [resolving, setResolving] = useState(false);
  // A StrictMode double-mount would otherwise fire the request twice.
  const requested = useRef(null);

  useEffect(() => {
    if (!openFor || requested.current === openFor) return;
    requested.current = openFor;
    setResolving(true);

    // Opens the existing conversation with this user, or starts one. Either
    // way the id comes back and the URL is rewritten to the normal ?c= form,
    // so a refresh or a shared link behaves like any other thread.
    axios.post(`/support/chat/users/${openFor}`, {})
      .then((res) => setSearchParams({ c: res.data.id }, { replace: true }))
      .catch((err) => {
        toast.error(err?.message || 'Could not open a conversation with that person');
        setSearchParams({}, { replace: true });
      })
      .finally(() => setResolving(false));
  }, [openFor, setSearchParams]);

  return (
    <AdminLayout>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Support Messages</h1>
      </div>
      <SupportChat
        key={conversationId || (resolving ? 'opening' : 'inbox')}
        mode="admin"
        initialConversationId={conversationId}
      />
    </AdminLayout>
  );
}
