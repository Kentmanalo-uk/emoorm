import { useEffect, useState } from 'react';
import apiClient from '../../api/client';

/**
 * Continue with mobile number (web/src/lib/phoneLogin.js): on while the
 * server can send texts and the super admin has it switched on
 * (GET /auth/phone/config says `login: true`). Asked once per app run; a
 * failed ask is tried again by the next sheet.
 */
let configPromise = null;

export default function usePhoneLogin() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    if (!configPromise) {
      configPromise = apiClient.get('/auth/phone/config')
        .then((res) => Boolean(res?.data?.login))
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
