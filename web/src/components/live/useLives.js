import { useEffect, useState } from 'react';
import { listLives } from '../../lib/live';

const REFRESH_MS = 30 * 1000;

/**
 * The lives on now (most watched first), checked every 30 seconds while
 * the page is in view. Nothing at all when nobody is live.
 *
 *   useLives()            every live
 *   useLives(storeId)     one shop's
 */
export default function useLives(storeId) {
  const [lives, setLives] = useState([]);
  useEffect(() => {
    let stopped = false;
    let timer = null;
    const load = () => {
      if (document.hidden) { timer = setTimeout(load, REFRESH_MS); return; }
      listLives(storeId)
        .then((list) => { if (!stopped) setLives(list); })
        .catch(() => {})
        .finally(() => { if (!stopped) timer = setTimeout(load, REFRESH_MS); });
    };
    load();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [storeId]);
  return lives;
}
