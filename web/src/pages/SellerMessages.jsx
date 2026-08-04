import React from 'react';
import { MessageSquare } from 'lucide-react';
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
        <div className="seller-card">
          <div className="seller-empty" style={{ padding: '48px 16px' }}>
            <MessageSquare size={36} />
            <p>No messages yet.</p>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>
              Buyers can reach you through order chat once conversations are enabled.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
