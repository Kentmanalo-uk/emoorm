import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, X } from '@phosphor-icons/react';
import { clearSetupReturn, useSetupReturn } from '../../lib/setupReturn';
import './SetupReturnPill.css';

/**
 * Seller Center pages reached from the guided setup show this pill, so the
 * seller can go back to the setup where they left it, or close it and stay.
 */
export default function SetupReturnPill() {
  const step = useSetupReturn();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!step || pathname.startsWith('/seller/welcome')) return null;
  return (
    <div className="srp" role="region" aria-label="Guided setup">
      <button type="button" className="srp-back" onClick={() => navigate(`/seller/welcome?step=${encodeURIComponent(step)}`)}>
        <ArrowLeft size={16} weight="bold" /> Back to setup
      </button>
      <button type="button" className="srp-close" onClick={clearSetupReturn} aria-label="Close and stay here">
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
