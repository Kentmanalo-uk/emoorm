import { useEffect, useState } from 'react';
import axios from '../lib/axios';
import useAuthStore from '../store/authStore';

/**
 * Brings the signed-in account in the app up to date with what is saved
 * (it may have changed on another device), once when the page opens.
 * @returns {Boolean} true once the saved account has been read (or could not be)
 */
export default function useFreshAccount() {
  const updateUser = useAuthStore((s) => s.updateUser);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    let cancelled = false;
    axios.get('/auth/profile')
      .then((res) => {
        if (!cancelled && res?.data?.id) updateUser({ ...useAuthStore.getState().user, ...res.data });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFresh(true); });
    return () => { cancelled = true; };
  }, [updateUser]);

  return fresh;
}
