import { Suspense, lazy, useEffect, useRef, useState } from 'react';

/*
 * Home's stores map, loaded only when its section comes near the screen.
 * The map library (Leaflet, about 150 kB) used to come with every first
 * visit; most shoppers never scroll that far. Until then a frame of the
 * same height holds the place, so the page does not jump.
 *
 *   <HomeStoresMapLazy stores={stores} height={440} onSelect={(store) => …} />
 */
const HomeStoresMap = lazy(() => import('./HomeStoresMap'));

export default function HomeStoresMapLazy({ height = 440, ...props }) {
  const holder = useRef(null);
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (near || !holder.current) return undefined;
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: '600px 0px' });
    watch.observe(holder.current);
    return () => watch.disconnect();
  }, [near]);

  const placeholder = <div ref={holder} className="store-map-frame home-map-placeholder" style={{ height }} aria-hidden="true" />;
  if (!near) return placeholder;
  return (
    <Suspense fallback={placeholder}>
      <HomeStoresMap height={height} {...props} />
    </Suspense>
  );
}
