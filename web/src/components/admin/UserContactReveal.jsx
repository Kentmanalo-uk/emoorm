import { useState } from 'react';
import RevealButton from './RevealButton';

/**
 * A person's email, phone and street as admins see them: masked by the
 * server, with "Show contact" for a case (asks why; the server logs it).
 * Drop-in rows for an `.admin-detail-grid`.
 *
 * @param {Object} user - The masked user (email, contactNumber from the API)
 * @param {Boolean} [withAddress] - Also a row for the street address
 */
export default function UserContactReveal({ user, withAddress = false }) {
  const [revealed, setRevealed] = useState(null); // { id, data }
  // Kept against whose details they are: another person opens masked.
  const shown = revealed && revealed.id === user?.id ? revealed.data : null;
  const setShown = (data) => setRevealed({ id: user?.id, data });

  return (
    <>
      <div><label>Email</label><p>{shown ? shown.email : (user?.email || '—')}</p></div>
      <div><label>Contact</label><p>{shown ? (shown.contactNumber || '—') : (user?.contactNumber || '—')}</p></div>
      {withAddress && shown && (
        <div className="admin-detail-full"><label>Registered address</label><p>{shown.address || '—'}</p></div>
      )}
      {!shown && user?.id && (
        <div className="admin-detail-full">
          <RevealButton
            endpoint={`/auth/users/${user.id}/reveal`}
            label="Show contact"
            title={`Show ${user.fullName || 'this person'}'s contact details?`}
            onRevealed={setShown}
          />
        </div>
      )}
    </>
  );
}
