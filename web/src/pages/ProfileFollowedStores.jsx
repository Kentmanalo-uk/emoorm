import React from 'react';
import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';

const ProfileFollowedStores = () => (
  <div className="profile-page-wrap">
    <header className="profile-page-header">
      <h1 className="profile-page-title">Followed Stores</h1>
    </header>

    <div className="profile-section">
      <div className="empty-state">
        <Store size={40} strokeWidth={1.5} />
        <p className="empty-state-text">You are not following any stores yet</p>
        <p className="empty-state-hint">
          Discover local sellers and follow them to see their newest products first.
        </p>
        <Link to="/stores" className="empty-state-button">Discover Stores</Link>
      </div>
    </div>
  </div>
);

export default ProfileFollowedStores;
