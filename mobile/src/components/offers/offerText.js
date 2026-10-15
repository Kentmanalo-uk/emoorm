/**
 * Shared words and numbers for livestock deals (offers talked over in chat):
 * the app's copy of web/src/components/offers/offerText.js. Dates are
 * written out by hand (the phone's local time) so every Android build reads
 * them the same.
 */

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const heads = (n) => `${n} head${Number(n) === 1 ? '' : 's'}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "3:00 PM" */
export const clock = (d) => {
  const at = new Date(d);
  const h = at.getHours();
  return `${h % 12 || 12}:${String(at.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Oct 8, 3:00 PM" */
export const when = (d) => {
  const at = new Date(d);
  return `${MONTHS[at.getMonth()]} ${at.getDate()}, ${clock(at)}`;
};

/** "Sat, Oct 11" */
export const day = (d) => {
  const at = new Date(d);
  return `${DAYS[at.getDay()]}, ${MONTHS[at.getMonth()]} ${at.getDate()}`;
};

/** How far below the asking price, as a whole percent. */
export const below = (price, list) => (list > 0 ? Math.round((1 - price / list) * 100) : 0);

/** Lowest price per head a buyer or seller may name: half the asking price. */
export const MIN_SHARE = 0.5;

/** Deals still going: talked over, agreed, or a sale waiting to be confirmed. */
export const OPEN = ['PENDING', 'COUNTERED', 'ACCEPTED', 'CONFIRMING'];
export const TALKING = ['PENDING', 'COUNTERED'];

/** "Not enough heads left" and the like: why a deal closed by itself. */
const CLOSED_WHY = {
  NOT_ENOUGH_HEADS: 'Not enough heads left',
  SOLD_OUT: 'Sold out',
  CALLED_OFF: 'Called off',
};

/**
 * Where a deal stands, in a few words, from the buyer's side or the seller's
 * ("Your turn", "Waiting for the seller"…), and its tone for the badge.
 */
export const dealStatus = (deal, side = 'buyer') => {
  const mine = (s) => (side === 'buyer' ? s === 'BUYER' : s === 'SELLER');
  switch (deal.status) {
    case 'PENDING':
    case 'COUNTERED':
      return mine(deal.turn)
        ? { label: 'Your turn to answer', tone: 'amber' }
        : { label: side === 'buyer' ? 'Waiting for the seller' : 'Waiting for the buyer', tone: 'blue' };
    case 'ACCEPTED':
      return { label: side === 'buyer' ? 'Agreed · meet the seller' : 'Agreed · meet, then mark as done', tone: 'green' };
    case 'CONFIRMING':
      return side === 'buyer'
        ? { label: 'Confirm your purchase', tone: 'amber' }
        : { label: 'Waiting for the buyer to confirm', tone: 'blue' };
    case 'SOLD': return { label: 'Sold', tone: 'green' };
    case 'DECLINED': return { label: 'Declined', tone: 'gray' };
    case 'CANCELLED':
      return { label: CLOSED_WHY[deal.closedReason] || 'Withdrawn', tone: 'gray' };
    case 'EXPIRED': return { label: 'Expired', tone: 'gray' };
    default: return { label: deal.status, tone: 'gray' };
  }
};

/** The price per head that counts right now. */
export const currentPrice = (deal) => deal.price ?? deal.agreedPrice ?? deal.counterPrice ?? deal.offerPrice;

/** A phone number for a tel: link (digits and a leading +). */
export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;

/**
 * The chat a deal is talked over in. Buyers and sellers both open a chat at
 * /conversation/<id>; without one yet, the buyer starts it from the shop.
 */
export const chatPath = (deal, side = 'buyer') => {
  if (deal?.conversationId) return `/conversation/${deal.conversationId}`;
  if (side === 'buyer') return deal?.store?.id ? `/messages?store=${deal.store.id}` : '/messages';
  return '/seller/messages';
};

/** An order made by a deal, on this side's orders page. */
export const orderPath = (deal, side = 'buyer') => (side === 'seller' ? `/seller/orders?id=${deal.orderId}` : `/orders?id=${deal.orderId}`);
