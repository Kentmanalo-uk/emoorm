/**
 * The heading block at the top of every Seller Center page.
 *
 * Three pages had grown their own version — Returns carried a "kicker" label
 * and its own wrapper, Analytics used the analytics component's header, and
 * Fulfillment had no subtitle at all — so the title size, the gap under it and
 * the alignment of the right-hand controls all differed page to page. This is
 * the one shape they share.
 *
 * `actions` is the right-hand slot: a button, a filter, a summary figure. It
 * is laid out for the caller so pages cannot drift apart on spacing again.
 */
export default function SellerPageHead({ title, subtitle, actions, className = '' }) {
  return (
    <div className={`seller-header ${className}`.trim()}>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="seller-welcome">{subtitle}</p>}
      </div>
      {actions && <div className="seller-header-actions">{actions}</div>}
    </div>
  );
}
