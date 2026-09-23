import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatCircleDots } from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import axios from '../../lib/axios';

const MESSAGEABLE = new Set(['BUYER', 'SELLER']);

/**
 * Opens (or reuses) a direct conversation with a buyer or seller and jumps to
 * it in the admin Support Messages inbox. Hidden for admin accounts.
 */
export default function MessageUserButton({ userId, role, label = 'Message', size = 14, className = 'admin-btn admin-btn-gray' }) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);

  if (!userId || (role && !MESSAGEABLE.has(role))) return null;

  const open = async () => {
    setOpening(true);
    try {
      const res = await axios.post(`/support/cases/for-user/${userId}`, {});
      navigate(`/admin/support?c=${res.data.id}`);
    } catch (err) {
      toast.error(err.message || 'Unable to open a conversation');
      setOpening(false);
    }
  };

  return (
    <button type="button" className={className} disabled={opening} onClick={open}>
      <ChatCircleDots size={size} weight="fill" /> {opening ? 'Opening…' : label}
    </button>
  );
}
