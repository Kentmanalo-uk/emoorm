import React from 'react';
import Messenger from '../components/messenger/Messenger';
import './SellerDashboard.css';

export default function SellerMessages() {
  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <div className="seller-header">
          <div>
            <h1>Messages</h1>
            <p className="seller-welcome">Conversations with your buyers</p>
          </div>
        </div>
        <div className="seller-card" style={{ padding: 0, overflow: 'hidden' }}>
          <Messenger role="seller" />
        </div>
      </div>
    </div>
  );
}
