import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';

const ProfileReviews = () => (
  <div className="profile-section">
    <h3 className="profile-section-title">My Reviews</h3>
    <div className="empty-state">
      <Star size={48} />
      <p className="empty-state-text">You haven't written any reviews yet.</p>
      <Link to="/profile/orders" className="empty-state-button">
        Review a Purchase
      </Link>
    </div>
  </div>
);

export default ProfileReviews;
