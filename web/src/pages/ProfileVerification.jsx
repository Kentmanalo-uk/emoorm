import { useState } from 'react';
import { Link } from 'react-router-dom';
import IdentityVerifier from '../components/identity/IdentityVerifier';
import './ProfileVerification.css';

export default function ProfileVerification() {
  const [status, setStatus] = useState(null);

  return (
    <div className="profile-page-wrap idv-wrap">
      <header className="profile-page-header">
        <h1 className="profile-page-title">Identity Verification</h1>
        <p className="idv-subtitle">
          {status?.requiredForCheckout === false
            ? 'Verification is optional right now, but a verified account is ready if it becomes required.'
            : 'Verified identity is required before checking out.'}
        </p>
      </header>

      <IdentityVerifier
        verifiedText="Your identity is verified. You can check out and place orders."
        onStatus={setStatus}
      />

      {status?.status === 'VERIFIED' && (
        <p className="idv-note">
          Changing your name or barangay in <Link to="/profile/settings">Settings</Link> will require you to verify again.
        </p>
      )}
    </div>
  );
}
