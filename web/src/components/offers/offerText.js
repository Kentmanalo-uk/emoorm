/** Shared words and numbers for price offers (livestock). */

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const heads = (n) => `${n} head${Number(n) === 1 ? '' : 's'}`;

/** "Oct 8, 3:00 PM" */
export const when = (d) => new Date(d).toLocaleString('en-PH', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

/** How far below the asking price, as a whole percent. */
export const below = (price, list) => (list > 0 ? Math.round((1 - price / list) * 100) : 0);

export const OPEN = ['PENDING', 'COUNTERED', 'ACCEPTED'];

/** The status line, from the buyer's side or the seller's. */
export const statusText = (offer, side = 'buyer') => {
  switch (offer.status) {
    case 'PENDING':
      return side === 'buyer'
        ? `Waiting for the seller · answer by ${when(offer.respondBy)}`
        : `Answer by ${when(offer.respondBy)}`;
    case 'COUNTERED':
      return side === 'buyer'
        ? `Counteroffer · answer by ${when(offer.respondBy)}`
        : `You countered · the buyer answers by ${when(offer.respondBy)}`;
    case 'ACCEPTED':
      return side === 'buyer'
        ? `Agreed · buy by ${when(offer.buyBy)}`
        : `Agreed · the buyer can buy until ${when(offer.buyBy)}`;
    case 'USED': return 'Bought';
    case 'DECLINED': return 'Declined';
    case 'CANCELLED': return 'Withdrawn';
    case 'EXPIRED': return 'Expired';
    default: return offer.status;
  }
};

/** The price that counts right now: agreed, else the counter, else the offer. */
export const currentPrice = (offer) => offer.agreedPrice ?? offer.counterPrice ?? offer.offerPrice;
