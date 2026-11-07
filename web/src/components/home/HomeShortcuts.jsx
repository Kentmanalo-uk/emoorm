import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  BubbleArt, BuoyArt, CameraArt, GridArt, HeadsetArt, HeartArt, MapArt, MegaphoneArt, ParcelArt,
  PiggyArt, PinArt, PotArt, QrArt, ReturnArt, ShopArt, SparkArt, StarArt, TagArt, TownArt, TrendArt, TruckArt,
} from '../art/FlatArt';
import useShortcutLook, { useShortcutScale } from '../../hooks/useShortcutLook';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import './HomeShortcuts.css';

/**
 * The quick entries under the banner (the app's HomeShortcuts.js): the
 * shortest route to everything the site can already do. Phones get two pages
 * of ten, swiped sideways, with a little bar saying which page you are on;
 * computers get all twenty on one line, larger, scrolled sideways under the
 * same bar.
 *
 * The split is real, not decorative: the first ten are ways to find
 * something to buy, the second ten are your own orders and the places to get
 * help. Every tile goes somewhere that already exists.
 *
 * Each has its own mark and colour, so the grid is scanned by colour before
 * it is read, and the marks sit uncased: no tile behind them.
 */

const PER_PAGE = 10;

const ENTRIES = [
  // Ways to shop.
  { key: 'today', label: 'Today’s Menu', Art: PotArt, to: '/today' },
  { key: 'new', label: 'New Arrivals', Art: SparkArt, to: '/products?sort=newest' },
  { key: 'best', label: 'Best Sellers', Art: TrendArt, to: '/products?sort=top-sales' },
  { key: 'budget', label: 'Budget Finds', Art: PiggyArt, to: '/products?sort=price-low' },
  { key: 'all', label: 'All Products', Art: GridArt, to: '/products' },
  { key: 'towns', label: 'Municipals', Art: TownArt, to: '/stores' },
  { key: 'map', label: 'Store Map', Art: MapArt, to: '/stores/map' },
  { key: 'photo', label: 'Photo Search', Art: CameraArt, to: '/search/image' },
  { key: 'wishlist', label: 'Wishlist', Art: HeartArt, to: '/wishlist' },
  { key: 'sell', label: 'Start Selling', Art: MegaphoneArt, to: '/sell' },

  // Yours, and where to get help.
  { key: 'orders', label: 'My Orders', Art: ParcelArt, to: '/profile/orders' },
  { key: 'offers', label: 'My Offers', Art: TagArt, to: '/profile/offers' },
  { key: 'following', label: 'Following', Art: ShopArt, to: '/profile/followed-stores' },
  { key: 'returns', label: 'Returns', Art: ReturnArt, to: '/profile/returns' },
  { key: 'reviews', label: 'My Reviews', Art: StarArt, to: '/profile/reviews' },
  { key: 'addresses', label: 'Addresses', Art: PinArt, to: '/profile/addresses' },
  // The app's tile here opens its QR scanner, which a browser does not have.
  { key: 'app', label: 'Get the App', Art: QrArt, to: '/app' },
  { key: 'help', label: 'Help Centre', Art: BuoyArt, to: '/help' },
  { key: 'care', label: 'Customer Care', Art: HeadsetArt, to: '/customer-care' },
  { key: 'feedback', label: 'Feedback', Art: BubbleArt, to: '/feedback' },
];

/* Phones: the Wishlist lives in Profile, so Get the App takes its place on
   the first page, and To Receive takes Get the App's on the second. */
const APP = ENTRIES.find((e) => e.key === 'app');
const PHONE_SWAPS = {
  wishlist: APP,
  app: {
    key: 'receive', label: 'To Receive', Art: TruckArt, to: '/profile/orders?status=to_receive',
  },
};
const PHONE_ENTRIES = ENTRIES.map((e) => PHONE_SWAPS[e.key] || e);

const PAGES = Math.ceil(ENTRIES.length / PER_PAGE);
const paged = (entries) => Array.from({ length: PAGES }, (_, p) => entries.slice(p * PER_PAGE, (p + 1) * PER_PAGE));

export default function HomeShortcuts() {
  const look = useShortcutLook();
  const scale = useShortcutScale();
  const isPhone = usePhoneLayout();
  const pages = useMemo(() => paged(isPhone ? PHONE_ENTRIES : ENTRIES), [isPhone]);
  const thumbRef = useRef(null);
  const dragRef = useRef(null);

  // The bar is the scroll itself, scaled down: it moves with the finger
  // rather than jumping once the page has settled. Written straight to the
  // element, so a swipe does not render Home on every frame.
  const onScroll = (e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    const travel = scrollWidth - clientWidth;
    if (thumbRef.current && travel > 0) {
      thumbRef.current.style.transform = `translateX(${(scrollLeft / travel) * (PAGES - 1) * 100}%)`;
    }
  };

  // A mouse has no sideways swipe and there is no scrollbar to grab, so the
  // row is dragged. It only counts past a few pixels: a click that wobbles
  // is still a click on the tile under it.
  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragRef.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false };
  };
  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const by = e.clientX - drag.x;
    if (!drag.moved && Math.abs(by) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add('is-dragging');
    }
    e.currentTarget.scrollLeft = drag.left - by;
  };
  const endDrag = (e) => {
    dragRef.current = null;
    e.currentTarget.classList.remove('is-dragging');
  };

  return (
    <section className="hsc" aria-label="Shortcuts" style={{ '--sc-scale': scale }}>
      <div className="container">
        <div
          className="hsc-pages"
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {pages.map((page, p) => (
            <div className="hsc-page" key={`page-${p}`}>
              {page.map(({
                key, label, Art, to,
              }) => (
                <Link key={key} to={to} className="hsc-tile" draggable={false}>
                  <Art size={36} glass look={look} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="hsc-track" aria-hidden="true">
          <span ref={thumbRef} style={{ width: `${100 / PAGES}%` }} />
        </div>
      </div>
    </section>
  );
}
