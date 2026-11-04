import { useEffect, useState } from 'react';

/*
 * Whether an element has come near the screen (within `margin` of it), once:
 * true from then on. Sections far down a page ask for their data only then,
 * so a first visit loads what is on screen first, and a section that is never
 * shown (the footer on phones, display: none) never asks at all.
 *
 *   const ref = useRef(null);
 *   const near = useNearScreen(ref);
 *   useQuery({ …, enabled: near });
 *   <section ref={ref}>…
 *
 * `enabled: false` holds off watching: while the content above is still
 * loading the page is short, and everything would count as near at once.
 */
export default function useNearScreen(ref, { margin = '600px', enabled = true } = {}) {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (near || !el || !enabled) return undefined;
    const watch = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin: `${margin} 0px` });
    watch.observe(el);
    return () => watch.disconnect();
  }, [ref, near, margin, enabled]);

  return near;
}
