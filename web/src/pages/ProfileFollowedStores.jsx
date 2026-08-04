import React from 'react';
import { Link } from 'react-router-dom';
import { Store } from 'lucide-react';

const ProfileFollowedStores = () => (
  <div className="profile-section">
    <h3 className="profile-section-title">Followed Stores</h3>
    <div className="empty-state">
      <Store size={48} />
      <p className="empty-state-text">You're not following any stores yet.</p>
      <Link to="/stores" className="empty-state-button">
        Discover Stores
      </Link>
    </div>
  </div>
);

export default ProfileFollowedStores;
