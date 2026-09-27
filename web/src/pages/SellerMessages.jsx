import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatCircleDots, Sparkle, X } from '@phosphor-icons/react';
import Messenger from '../components/messenger/Messenger';
import SellerPageHead from '../components/seller/SellerPageHead';
import { usePhoneLayout } from '../hooks/useMobileNav';
import './SellerDashboard.css';

const TIP_KEY = 'emoorm-seller-chat-tip';

const tipDismissed = () => {
  try { return localStorage.getItem(TIP_KEY) === '1'; } catch { return false; }
};

export default function SellerMessages() {
  const isPhone = usePhoneLayout();
  const [showTip, setShowTip] = useState(() => !tipDismissed());

  const hideTip = () => {
    setShowTip(false);
    try { localStorage.setItem(TIP_KEY, '1'); } catch { /* the tip just shows again */ }
  };

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="Messages"
          subtitle="Conversations with your buyers"
          // Phones have Ate Moormy's button in the Chat header instead.
          actions={isPhone ? null : (
            <Link to="/seller/assistant" className="btn-seller-outline sa-open" title="Ate Moormy, your AI assistant">
              <Sparkle size={16} weight="fill" /> Ask Ate Moormy
            </Link>
          )}
        />
        {/* Phones (the Chat tab): a one-time tip. */}
        {isPhone && showTip && (
          <div className="scm-tip" role="note">
            <ChatCircleDots size={20} weight="fill" />
            <span>Messages from your buyers show here. Quick replies win more orders.</span>
            <button type="button" onClick={hideTip} aria-label="Dismiss tip"><X size={16} weight="bold" /></button>
          </div>
        )}
        <div className="seller-card seller-chat-card" style={{ padding: 0, overflow: 'hidden' }}>
          <Messenger role="seller" filterChips={isPhone} />
        </div>
      </div>
    </div>
  );
}
