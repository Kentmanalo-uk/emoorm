import React from 'react';
import { Link } from 'react-router-dom';
import { Star } from '@phosphor-icons/react';

const ProfileReviews = () => (
  <div className="profile-page-wrap">
    <header className="profile-page-header">
      <h1 className="profile-page-title">My Reviews</h1>
    </header>

    <div className="profile-section">
      <div className="empty-state">
        <Star size={40} strokeWidth={1.5} weight="fill" />
        <p className="empty-state-text">No reviews yet</p>
        <p className="empty-state-hint">
          Once your order is completed you can rate the product and leave a review.
        </p>
        <Link to="/profile/orders" className="empty-state-button">Review a Purchase</Link>
      </div>
    </div>
  </div>
);

export default ProfileReviews;
