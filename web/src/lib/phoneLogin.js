import { useEffect, useState } from 'react';
import axios from './axios';

/**
 * Continue with mobile number: on while the server can send texts (its
 * Semaphore key, /auth/phone/config). Asked once per page load.
 */
let configPromise = null;

export function usePhoneLogin() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    if (!configPromise) {
      configPromise = axios.get('/auth/phone/config')
        .then((res) => Boolean(res.data?.enabled))
        .catch(() => {
          configPromise = null;
          return false;
        });
    }
    configPromise.then((on) => { if (live) setEnabled(on); });
    return () => { live = false; };
  }, []);
  return enabled;
}
