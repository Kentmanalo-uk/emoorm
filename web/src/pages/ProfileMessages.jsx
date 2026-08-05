import React from 'react';
import Messenger from '../components/messenger/Messenger';

const ProfileMessages = () => (
  <div className="profile-page-wrap">
    <header className="profile-page-header">
      <h1 className="profile-page-title">Messages</h1>
    </header>
    <Messenger role="buyer" className="msgr-shell-flat" />
  </div>
);

export default ProfileMessages;
