import { useEffect, useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  SealCheck, MapPin, CalendarBlank, ChatCircle, PencilSimple as Pencil,
} from '@phosphor-icons/react';
import toast from 'react-hot-toast';
import Layout from '../components/layout/Layout';
import axios from '../lib/axios';
import './PublicProfile.css';
import UserAvatar from '../components/ui/UserAvatar';

const monthYear = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
};

/**
 * The public face of a buyer-only account: who they are, roughly where, how
 * long they have been here and whether their identity was checked — nothing
 * private. A seller account has no page of its own here: its public face is
 * its shop, so we redirect to /store/:slug.
 */
export default function PublicProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [openingChat, setOpeningChat] = useState(false);

  const query = useQuery({
    queryKey: ['public-profile', id],
    queryFn: async () => (await axios.get(`/profiles/${id}`)).data,
    retry: (count, err) => err?.status !== 404 && count < 2,
  });
  const profile = query.data || null;
  const status = query.isLoading ? 'loading'
    : query.error ? (query.error.status === 404 ? 'missing' : 'error')
      : 'ready'; // loading | ready | missing | error

  useEffect(() => {
    const previous = document.title;
    if (profile?.fullName) document.title = `${profile.fullName} · Emoorm`;
    return () => { document.title = previous; };
  }, [profile]);

  const messageBuyer = async () => {
    setOpeningChat(true);
    try {
      const res = await axios.post('/messages/conversations', { buyerId: id });
      navigate(`/seller/messages?c=${res.data.id}`);
    } catch (err) {
      toast.error(err.message || 'Could not open the conversation');
    } finally {
      setOpeningChat(false);
    }
  };

  const shell = (children) => (
    <Layout>
      <div className="pp">
        <div className="container">{children}</div>
      </div>
    </Layout>
  );

  if (status === 'loading') return shell(<div className="pp-card pp-muted">Loading profile…</div>);

  if (status !== 'ready') {
    return shell(
      <div className="pp-card pp-empty">
        <h1>{status === 'missing' ? 'Profile not found' : 'Could not load this profile'}</h1>
        <p>{status === 'missing' ? 'This account may have been closed.' : 'Please try again in a moment.'}</p>
        <Link to="/" className="pp-btn pp-btn--primary">Back to home</Link>
      </div>,
    );
  }

  // A seller's public profile is their shop.
  if (profile.isSeller && profile.store?.slug) {
    return <Navigate to={`/store/${profile.store.slug}`} replace />;
  }

  const initial = (profile.fullName || '?').trim().charAt(0).toUpperCase();
  const place = [profile.municipality?.name, profile.province].filter(Boolean).join(', ');

  return shell(
    <>
      {profile.isOwnProfile && (
        <div className="pp-own-note">
          <span>This is how your profile looks to sellers and other buyers.</span>
          <Link to="/profile/settings" className="pp-own-link"><Pencil size={14} /> Edit profile</Link>
        </div>
      )}

      <section className="pp-card pp-head">
        <div className="pp-avatar">
          <UserAvatar src={profile.profilePhoto} name={initial} alt={profile.fullName} />
        </div>

        <h1 className="pp-name">
          {profile.fullName}
          {profile.identityVerified && (
            <span className="pp-verified" title="Identity verified with a government ID">
              <SealCheck size={18} weight="fill" /> Verified
            </span>
          )}
        </h1>

        {profile.username && <p className="pp-username">@{profile.username}</p>}

        <div className="pp-meta">
          {place && <span><MapPin size={14} /> {place}</span>}
          {profile.memberSince && (
            <span><CalendarBlank size={14} /> Member since {monthYear(profile.memberSince)}</span>
          )}
        </div>

        {profile.canChat && (
          <button type="button" className="pp-btn pp-btn--primary pp-chat" onClick={messageBuyer} disabled={openingChat}>
            <ChatCircle size={16} /> {openingChat ? 'Opening…' : 'Chat'}
          </button>
        )}
      </section>
    </>,
  );
}
