import { useEffect, useState } from 'react';
import axios from './axios';

/**
 * Continue with mobile number: on while the server can send texts and the
 * super admin has it switched on (/auth/phone/config, login). Asked once per
 * page load.
 */
let configPromise = null;

export function usePhoneLogin() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    if (!configPromise) {
      configPromise = axios.get('/auth/phone/config')
        .then((res) => Boolean(res.data?.login))
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
