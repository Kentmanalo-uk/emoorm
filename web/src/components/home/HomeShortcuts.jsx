import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  BasketArt, BowlArt, BrushArt, BubbleArt, BuoyArt, CalendarArt, CameraArt, CapArt, ClockArt, FishArt,
  GiftArt, GridArt, HeadsetArt, HeartArt, LiveArt, LivestockArt, MapArt, MegaphoneArt, MountainArt,
  PackageArt, ParcelArt, PickupArt, PiggyArt, PinArt, PotArt, QrArt, ReturnArt, SaleArt, ShopArt,
  SparkArt, StarArt, TagArt, TONES, TownArt, TrendArt,
} from '../art/FlatArt';
import useShortcutLook, { useShortcutScale } from '../../hooks/useShortcutLook';
import { usePhoneLayout } from '../../hooks/useMobileNav';
import './HomeShortcuts.css';

/**
 * The quick entries under the banner (the app's HomeShortcuts.js): the
 * shortest route to everything the site can do. Phones get pages of ten,
 * swiped sideways, with a little bar saying which page you are on;
 * computers get every tile on one line, larger, scrolled sideways under the
 * same bar.
 *
 * The first tiles keep the places people already know (on phones the
 * first page is the one they have always had); the newer ones follow them,
 * on the next pages: the market, deals and kinds of things, then ways to
 * get them. On computers your own orders and the places to get help sit
 * among the first ones, as before (on phones the Profile tab has those).
 *
 * Each has its own mark and colour, so the grid is scanned by colour before
 * it is read, and the marks sit uncased: no tile behind them.
 */

const PER_PAGE = 10;

// The tiles Home has always had, in their places.
const ENTRIES = [
  { key: 'today', label: 'Today’s Menu', Art: PotArt, to: '/today' },
  { key: 'new', label: 'New Arrivals', Art: SparkArt, to: '/products?sort=newest' },
  { key: 'best', label: 'Best Sellers', Art: TrendArt, to: '/products?sort=top-sales' },
  { key: 'budget', label: 'Budget Finds', Art: PiggyArt, to: '/products?sort=price-low' },
  { key: 'all', label: 'All Products', Art: GridArt, to: '/products' },
  { key: 'towns', label: 'Municipals', Art: TownArt, to: '/stores' },
  { key: 'map', label: 'Store Map', Art: MapArt, to: '/stores/map' },
  { key: 'live', label: 'Live Now', Art: LiveArt, to: '/live' },
  { key: 'wishlist', label: 'Wishlist', Art: HeartArt, to: '/wishlist' },
  { key: 'sell', label: 'Start Selling', Art: MegaphoneArt, to: '/sell' },
  // Computers: yours, and where to get help.
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

// The newer ones, after them: the market and deals, kinds of things, then
// ways to get them and places to explore.
const ADDED = [
  { key: 'palengke', label: 'Palengke', Art: BasketArt, to: '/palengke' },
  { key: 'sale', label: 'On Sale', Art: SaleArt, to: '/c/on-sale' },
  { key: 'ready', label: 'Ready to Eat', Art: BowlArt, to: '/c/ready-to-eat' },
  { key: 'pasalubong', label: 'Pasalubong', Art: GiftArt, to: '/c/pasalubong' },
  {
    key: 'open', label: 'Open Now', Art: ClockArt, tone: TONES.emerald, to: '/stores?open=now',
  },
  { key: 'preorder', label: 'Pre-order', Art: CalendarArt, to: '/c/pre-order' },
  { key: 'diy', label: 'DIY & Crafts', Art: BrushArt, to: '/c/diy' },
  { key: 'packages', label: 'Packages', Art: PackageArt, to: '/c/packages' },
  { key: 'seafood', label: 'Seafood', Art: FishArt, to: '/category/seafood' },
  { key: 'livestock', label: 'Livestock', Art: LivestockArt, to: '/category/livestock' },
  { key: 'photo', label: 'Photo Search', Art: CameraArt, to: '/search/image' },
  { key: 'pickup', label: 'Pickup Near Me', Art: PickupArt, to: '/stores?pickup=1' },
  { key: 'explore', label: 'Explore Mindoro', Art: MountainArt, to: '/explore' },
  { key: 'academy', label: 'Seller Academy', Art: CapArt, to: '/sell/academy' },
];

/* Phones: what the Profile tab already offers is left out here -- your
   orders, offers, followed shops, returns, reviews, addresses and wishlist
   are its shortcuts, help is on its strip (Customer Care and Feedback open
   the Help Centre too) -- so the first page keeps the ways to shop it has
   always had, with Get the App where the Wishlist was, and the newer tiles
   follow on the next pages. (Start Selling stays: Profile only offers it to
   a signed-in buyer, Home to everyone.) */
const IN_PROFILE = ['orders', 'offers', 'following', 'returns', 'reviews', 'addresses', 'help', 'care', 'feedback'];
const APP = ENTRIES.find((e) => e.key === 'app');
const PHONE_ENTRIES = [
  ...ENTRIES
    .filter((e) => e.key !== 'app' && !IN_PROFILE.includes(e.key))
    .map((e) => (e.key === 'wishlist' ? APP : e)),
  ...ADDED,
];
const DESKTOP_ENTRIES = [...ENTRIES, ...ADDED];

const paged = (entries) => Array.from(
  { length: Math.ceil(entries.length / PER_PAGE) },
  (_, p) => entries.slice(p * PER_PAGE, (p + 1) * PER_PAGE),
);

export default function HomeShortcuts() {
  const look = useShortcutLook();
  const scale = useShortcutScale();
  const isPhone = usePhoneLayout();
  const pages = useMemo(() => paged(isPhone ? PHONE_ENTRIES : DESKTOP_ENTRIES), [isPhone]);
  const count = pages.length;
  const thumbRef = useRef(null);
  const dragRef = useRef(null);

  // The bar is the scroll itself, scaled down: it moves with the finger
  // rather than jumping once the page has settled. Written straight to the
  // element, so a swipe does not render Home on every frame.
  const onScroll = (e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    const travel = scrollWidth - clientWidth;
    if (thumbRef.current && travel > 0) {
      thumbRef.current.style.transform = `translateX(${(scrollLeft / travel) * (count - 1) * 100}%)`;
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
                key, label, Art, tone, to,
              }) => (
                <Link key={key} to={to} className="hsc-tile" draggable={false}>
                  <Art size={36} tone={tone} glass look={look} />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </div>
        {count > 1 && (
          <div className="hsc-track" aria-hidden="true">
            <span ref={thumbRef} style={{ width: `${100 / count}%` }} />
          </div>
        )}
      </div>
    </section>
  );
}
