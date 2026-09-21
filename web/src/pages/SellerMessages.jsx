import React from 'react';
import Messenger from '../components/messenger/Messenger';
import SellerPageHead from '../components/seller/SellerPageHead';
import './SellerDashboard.css';

export default function SellerMessages() {
  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Messages"
          subtitle="Conversations with your buyers"
        />
        <div className="seller-card" style={{ padding: 0, overflow: 'hidden' }}>
          <Messenger role="seller" />
        </div>
      </div>
    </div>
  );
}
