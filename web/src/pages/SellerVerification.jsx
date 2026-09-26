import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, LockSimple } from '@phosphor-icons/react';
import IdentityVerifier from '../components/identity/IdentityVerifier';
import SellerPageHead from '../components/seller/SellerPageHead';
import './SellerDashboard.css';
import './ProfileVerification.css';

/*
 * Verify identity, inside the Seller Center. Sellers do this after applying
 * (it used to block the application). The result also arrives as a Seller
 * Center notification, and the dashboard reminds them until it is done.
 */
export default function SellerVerification() {
  const { refreshSetup } = useOutletContext() || {};
  const [status, setStatus] = useState(null);
  const verified = status?.status === 'VERIFIED';

  return (
    <div className="seller-dashboard">
      <div className="seller-container sv">
        <SellerPageHead
          title="Verify your identity"
          subtitle="Scan a valid government ID. We read it and match it to your account, so the admin can approve your shop faster."
        />

        <p className="sv-privacy">
          <LockSimple size={15} weight="fill" />
          <span>Your ID photo is only read, never stored. Only the result is kept.</span>
        </p>

        <IdentityVerifier
          verifiedText="Your identity is verified. Thank you! The admin can see your shop is verified."
          supportPath="/seller/support"
          onStatus={setStatus}
          onVerified={() => refreshSetup?.()}
        />

        {verified && (
          <div className="sv-after">
            <Link to="/seller/setup" className="ss-next-btn">
              Back to shop setup <ArrowRight size={17} weight="bold" />
            </Link>
            <Link to="/seller" className="sv-after-link">Go to dashboard</Link>
          </div>
        )}
      </div>
    </div>
  );
}
