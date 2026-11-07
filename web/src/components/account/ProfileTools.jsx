import { Children, useRef } from 'react';

/**
 * Phones: Profile's shortcuts, in pages of eight (four across, two down)
 * swiped sideways like Home's (HomeShortcuts), with the same little bar
 * under them saying where you are. Children are the tiles.
 */
const PER_PAGE = 8;

export default function ProfileTools({ scale = 1, children }) {
  const thumbRef = useRef(null);
  const tiles = Children.toArray(children);
  const count = Math.max(1, Math.ceil(tiles.length / PER_PAGE));
  const pages = Array.from({ length: count }, (_, p) => tiles.slice(p * PER_PAGE, (p + 1) * PER_PAGE));

  // The bar is the scroll itself, scaled down, written straight to the
  // element so a swipe does not render the page on every frame.
  const onScroll = (e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    const travel = scrollWidth - clientWidth;
    if (thumbRef.current && travel > 0) {
      thumbRef.current.style.transform = `translateX(${(scrollLeft / travel) * (count - 1) * 100}%)`;
    }
  };

  return (
    <div className="pf-m-tools" style={{ '--sc-scale': scale }}>
      <div className="pf-m-tools-pages" onScroll={onScroll}>
        {pages.map((page, p) => (
          <div className="pf-m-tools-page" key={`page-${p}`}>{page}</div>
        ))}
      </div>
      {count > 1 && (
        <div className="pf-m-tools-track" aria-hidden="true">
          <span ref={thumbRef} style={{ width: `${100 / count}%` }} />
        </div>
      )}
    </div>
  );
}
