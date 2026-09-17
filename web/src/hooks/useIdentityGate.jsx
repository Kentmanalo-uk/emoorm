import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import {
  IDENTITY_REQUIRED_MESSAGE,
  IDENTITY_VERIFICATION_PATH,
  fetchIdentityStatus,
} from '../lib/identity';

/**
 * Client-side checkout gate. It only improves UX — the backend rejects
 * orders from unverified buyers regardless.
 *
 *   const { requireVerifiedIdentity, identityDialog } = useIdentityGate();
 *   if (!(await requireVerifiedIdentity())) return;
 */
export default function useIdentityGate() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const showIdentityRequired = useCallback(() => setOpen(true), []);

  const requireVerifiedIdentity = useCallback(async () => {
    try {
      const status = await fetchIdentityStatus();
      if (!status?.requiredForCheckout || status.status === 'VERIFIED') return true;
    } catch (error) {
      toast.error(error?.message || 'Could not check your verification status');
      return false;
    }
    setOpen(true);
    return false;
  }, []);

  const identityDialog = (
    <ConfirmDialog
      open={open}
      title="Identity verification required"
      message={IDENTITY_REQUIRED_MESSAGE}
      confirmLabel="Verify identity"
      cancelLabel="Not now"
      onConfirm={() => {
        setOpen(false);
        navigate(IDENTITY_VERIFICATION_PATH);
      }}
      onCancel={() => setOpen(false)}
    />
  );

  return { requireVerifiedIdentity, showIdentityRequired, identityDialog };
}
