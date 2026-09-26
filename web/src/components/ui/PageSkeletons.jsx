import Skeleton from './Skeleton';
import './PageSkeletons.css';

/**
 * Page-shaped loading placeholders, built from the shared Skeleton shimmer.
 * Each mirrors the layout of the page it stands in for, so nothing jumps
 * when the real content arrives. Where a page's title drives the phone back
 * bar, the real <h1> is rendered so the bar is titled while loading.
 */

const PageTitle = ({ title }) => (title ? (
  <header className="profile-page-header">
    <h1 className="profile-page-title">{title}</h1>
  </header>
) : null);

/** A shop: header card, tabs, product rows. */
export function StoreSkeleton() {
  return (
    <div className="psk psk-store" aria-busy="true" aria-label="Loading shop">
      <div className="psk-store-cover" />
      <div className="psk-card psk-store-card">
        <div className="psk-row">
          <Skeleton width={64} height={64} circle />
          <div className="psk-lines">
            <Skeleton height={16} width="70%" />
            <Skeleton height={11} width="40%" />
            <Skeleton height={11} width="55%" />
          </div>
          <div className="psk-stack">
            <Skeleton height={32} width={92} radius={999} />
            <Skeleton height={32} width={92} radius={999} />
          </div>
        </div>
        <Skeleton height={44} radius={12} />
      </div>
      <div className="psk-tabs">
        {[0, 1, 2].map((i) => <Skeleton key={i} height={14} width={72} />)}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="psk-card psk-row psk-product-row">
          <Skeleton width={96} height={96} radius={12} />
          <div className="psk-lines">
            <Skeleton height={14} width="85%" />
            <Skeleton height={11} width="35%" />
            <div className="psk-row psk-spread">
              <Skeleton height={16} width={70} />
              <Skeleton height={32} width={96} radius={10} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The Profile tab: account card, counts, order shortcuts, menu rows. */
export function ProfileSkeleton() {
  return (
    <div className="psk psk-profile" aria-busy="true" aria-label="Loading profile">
      <div className="psk-card psk-row">
        <Skeleton width={64} height={64} circle />
        <div className="psk-lines">
          <Skeleton height={16} width="55%" />
          <Skeleton height={11} width="40%" />
        </div>
      </div>
      <div className="psk-card psk-counts">
        {[0, 1, 2].map((i) => (
          <div key={i} className="psk-count">
            <Skeleton height={18} width={28} />
            <Skeleton height={10} width={56} />
          </div>
        ))}
      </div>
      <div className="psk-card">
        <Skeleton height={14} width={110} />
        <div className="psk-icons">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="psk-icon">
              <Skeleton width={28} height={28} radius={8} />
              <Skeleton height={10} width={48} />
            </div>
          ))}
        </div>
      </div>
      <div className="psk-card psk-menu">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="psk-row psk-menu-row">
            <Skeleton width={22} height={22} radius={6} />
            <Skeleton height={13} width="50%" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Order cards: shop line, one item, total and status. */
export function OrderCardsSkeleton({ title, count = 3 }) {
  return (
    <div className="psk psk-orders" aria-busy="true" aria-label="Loading">
      <PageTitle title={title} />
      <div className="psk-chips">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={32} width={78} radius={999} />)}
      </div>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="psk-card">
          <div className="psk-row psk-spread">
            <Skeleton height={13} width="45%" />
            <Skeleton height={20} width={80} radius={999} />
          </div>
          <div className="psk-row psk-order-item">
            <Skeleton width={64} height={64} radius={10} />
            <div className="psk-lines">
              <Skeleton height={13} width="80%" />
              <Skeleton height={11} width="30%" />
            </div>
          </div>
          <div className="psk-row psk-spread">
            <Skeleton height={11} width={90} />
            <Skeleton height={15} width={80} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Review cards: product, stars, a few lines. */
export function ReviewCardsSkeleton({ count = 3 }) {
  return (
    <div className="psk" aria-busy="true" aria-label="Loading reviews">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="psk-card">
          <div className="psk-row">
            <Skeleton width={52} height={52} radius={10} />
            <div className="psk-lines">
              <Skeleton height={13} width="70%" />
              <Skeleton height={12} width={90} />
            </div>
          </div>
          <Skeleton.Text lines={2} height={11} />
        </div>
      ))}
    </div>
  );
}

/** A receipt: header, lines, totals. */
export function ReceiptSkeleton() {
  return (
    <div className="psk psk-receipt" aria-busy="true" aria-label="Loading receipt">
      <div className="psk-card">
        <div className="psk-row psk-spread">
          <Skeleton height={18} width={120} />
          <Skeleton height={12} width={90} />
        </div>
        <Skeleton.Text lines={3} height={11} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="psk-row psk-spread">
            <Skeleton height={12} width="55%" />
            <Skeleton height={12} width={64} />
          </div>
        ))}
        <div className="psk-row psk-spread psk-total">
          <Skeleton height={16} width={60} />
          <Skeleton height={16} width={90} />
        </div>
      </div>
    </div>
  );
}

/** Chat list rows: avatar, name, last message, time. */
export function ConversationListSkeleton({ rows = 7 }) {
  return (
    <div className="psk-convos" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="psk-row psk-convo">
          <Skeleton width={48} height={48} circle />
          <div className="psk-lines">
            <Skeleton height={13} width={`${45 + ((i * 13) % 30)}%`} />
            <Skeleton height={11} width={`${60 + ((i * 17) % 30)}%`} />
          </div>
          <Skeleton height={10} width={34} />
        </div>
      ))}
    </div>
  );
}

/** Store cards (Stores page, Followed stores). */
export function StoreCardsSkeleton({ count = 6, className = '' }) {
  return (
    <div className={`psk-store-cards ${className}`} aria-busy="true" aria-label="Loading shops">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="psk-card psk-store-tile">
          <div className="psk-row">
            <Skeleton width={48} height={48} circle />
            <div className="psk-lines">
              <Skeleton height={14} width="65%" />
              <Skeleton height={11} width="45%" />
            </div>
          </div>
          <div className="psk-thumbs">
            {[0, 1, 2].map((t) => <Skeleton key={t} height={64} radius={10} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Photo cards with a caption (municipality highlights). */
export function HighlightCardsSkeleton({ count = 6 }) {
  return (
    <div className="psk-highlights" aria-busy="true" aria-label="Loading highlights">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="psk-highlight">
          <Skeleton height={140} radius={12} />
          <Skeleton height={12} width="75%" />
          <Skeleton height={11} width="45%" />
        </div>
      ))}
    </div>
  );
}
