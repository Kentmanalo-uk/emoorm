import React from 'react';
import { MessageSquare } from 'lucide-react';

const ProfileMessages = () => (
  <div className="profile-section">
    <h3 className="profile-section-title">Messages</h3>
    <div className="empty-state">
      <MessageSquare size={48} />
      <p className="empty-state-text">No messages yet.</p>
      <p className="empty-state-hint">
        When you contact a store, your conversations will appear here.
      </p>
    </div>
  </div>
);

export default ProfileMessages;
