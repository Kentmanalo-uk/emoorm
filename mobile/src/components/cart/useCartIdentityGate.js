import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import apiClient from '../../api/client';
import { toast } from '../../lib/toast';
import CartConfirmDialog from './CartConfirmDialog';

// web/src/lib/identity.js
export const IDENTITY_VERIFICATION_PATH = '/verification';
export const IDENTITY_REQUIRED_MESSAGE = 'Identity verification required. Please verify your identity before checking out.';

/** The server's checkout refusal for an unverified buyer. */
export const isIdentityRequiredError = (error) => Array.isArray(error?.errors)
  && error.errors.some((item) => item?.code === 'IDENTITY_VERIFICATION_REQUIRED');

/**
 * The checkout gate (web/src/hooks/useIdentityGate.jsx). It only improves the
 * experience: the backend refuses orders from unverified buyers regardless.
 *
 *   const { requireVerifiedIdentity, identityDialog } = useCartIdentityGate();
 *   if (!(await requireVerifiedIdentity())) return;
 */
export default function useCartIdentityGate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const showIdentityRequired = useCallback(() => setOpen(true), []);

  const requireVerifiedIdentity = useCallback(async () => {
    try {
      const res = await apiClient.get('/identity-verification');
      const status = res?.data;
      if (!status?.requiredForCheckout || status.status === 'VERIFIED') return true;
    } catch (error) {
      toast.error(error?.message || 'Could not check your verification status');
      return false;
    }
    setOpen(true);
    return false;
  }, []);

  const identityDialog = (
    <CartConfirmDialog
      open={open}
      medium
      title="Identity verification required"
      message={IDENTITY_REQUIRED_MESSAGE}
      confirmLabel="Verify identity"
      cancelLabel="Not now"
      onConfirm={() => {
        setOpen(false);
        router.push(IDENTITY_VERIFICATION_PATH);
      }}
      onCancel={() => setOpen(false)}
    />
  );

  return { requireVerifiedIdentity, showIdentityRequired, identityDialog };
}
