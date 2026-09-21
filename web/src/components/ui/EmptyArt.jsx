import activity from '../../assets/empty/activity.svg?raw';
import analytics from '../../assets/empty/analytics.svg?raw';
import calendar from '../../assets/empty/calendar.svg?raw';
import inbox from '../../assets/empty/inbox.svg?raw';
import launch from '../../assets/empty/launch.svg?raw';
import maintenance from '../../assets/empty/maintenance.svg?raw';
import payments from '../../assets/empty/payments.svg?raw';
import places from '../../assets/empty/places.svg?raw';
import products from '../../assets/empty/products.svg?raw';
import revenue from '../../assets/empty/revenue.svg?raw';
import savings from '../../assets/empty/savings.svg?raw';
import shopping from '../../assets/empty/shopping.svg?raw';
import stores from '../../assets/empty/stores.svg?raw';
import reviews from '../../assets/empty/reviews.svg?raw';
import messages from '../../assets/empty/messages.svg?raw';
import delivery from '../../assets/empty/delivery.svg?raw';
import workspace from '../../assets/empty/workspace.svg?raw';
import './EmptyArt.css';

/**
 * Illustration for an empty state.
 *
 * A screen with nothing on it still has to look finished, and a single outline
 * icon on a wide card does not carry that on its own. See assets/empty for
 * where these come from and the licence they carry.
 *
 * The drawings are embedded rather than linked so the theme reaches them:
 * colours inside an <img> are sealed off from the page, and these have to
 * follow the palette like everything else. Each one's fills resolve through
 * the --art-* tokens, so a purple theme gets purple illustrations rather than
 * a green drawing marooned on a purple card.
 *
 * They are decorative: the heading beside them already says what is empty, so
 * every one is hidden from assistive technology rather than repeating it.
 */
const ART = {
  activity,
  analytics,
  calendar,
  inbox,
  launch,
  maintenance,
  payments,
  places,
  products,
  revenue,
  savings,
  shopping,
  stores,
  reviews,
  messages,
  delivery,
  workspace,
};

export default function EmptyArt({ name, size = 96, className = '' }) {
  // The markup is a build-time asset from this repository, not anything a
  // user can reach — the same trust as the stylesheet next to it.
  const markup = ART[name] || ART.inbox;

  return (
    <span
      aria-hidden="true"
      // Height drives the size and width follows: the set runs from a tall
      // rocket to a very wide row of books, so a fixed box would squash them.
      style={{ height: size }}
      className={`empty-art ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
