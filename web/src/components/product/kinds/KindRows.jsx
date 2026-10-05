import { Link } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import ProductImage from '../../ProductImage';
import { parseImages } from '../../../lib/media';
import {
  productKind, minOrder, prepLabel, cookDaysLabel, animalLabel, ageLabel, sexLabel, weightLabel, PACKAGE_KINDS,
} from '../../../lib/productKinds';
import { aheadLabel, clockLabel, servesText } from './buying';

/** One fact in the product page's rows, like "Age: 8 months old" (styles in ProductDetails.css). */
function Fact({ label, children, note = false }) {
  return (
    <div className={`pdp-row pdp-fact${note ? ' is-note' : ''}`}>
      <div className="pdp-row-label">{label}</div>
      <div className="pdp-row-content">{children}</div>
    </div>
  );
}

/**
 * What a package holds: each item's photo, how many and its name, opening
 * the item's own page while the shop still sells it on its own.
 */
function PackageItems({ product, made, ahead }) {
  const items = Array.isArray(product.packageItems) ? product.packageItems : [];
  if (!items.length) return null;
  return (
    <div className="pdp-row pdp-pkg">
      <div className="pdp-row-label">What&apos;s included:</div>
      <div className="pdp-row-content">
        <span className="pdp-pkg-sum">
          {[made && `${made} package`, `${items.length} ${items.length === 1 ? 'product' : 'products'}`, ahead && `Order ${ahead} ahead`].filter(Boolean).join(' · ')}
        </span>
        <ul className="pdp-pkg-list">
          {items.map((it) => {
            const item = it.product || {};
            const onSale = Boolean(item.slug) && !item.deletedAt && item.status === 'APPROVED';
            const body = (
              <>
                <span className="pdp-pkg-img"><ProductImage src={parseImages(item.images)[0]} alt="" /></span>
                <span className="pdp-pkg-qty">{it.quantity}×</span>
                <span className="pdp-pkg-name">{item.name || 'Item'}</span>
              </>
            );
            return (
              <li key={it.productId}>
                {onSale ? (
                  <Link to={`/product/${item.slug}`} className="pdp-pkg-item">
                    {body}
                    <CaretRight size={14} className="pdp-pkg-caret" />
                  </Link>
                ) : <span className="pdp-pkg-item">{body}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * A kind's facts: one row each, or (compact, on computers) side by side in
 * one row so the page stays short.
 */
function Facts({ facts, compact }) {
  const list = facts.filter(([, value]) => value);
  if (!compact) return list.map(([label, value]) => <Fact key={label} label={`${label}:`}>{value}</Fact>);
  return (
    <div className="pdp-row pdp-facts">
      <div className="pdp-row-label">Details:</div>
      <dl className="pdp-row-content pdp-facts-grid" style={{ '--pdp-fact-cols': list.length === 4 ? 4 : 3 }}>
        {list.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * The product page's rows for a product's kind (lib/productKinds), before
 * the delivery rows: a paluto's serving, minimum order, preparation and
 * cooking days; a live animal's facts; a package's items and how far ahead
 * to order. Nothing for regular goods and ready-to-eat food.
 * @param {boolean} [compact] - computers: the facts side by side in one row
 */
export default function KindRows({ product, compact = false }) {
  const kind = productKind(product);
  const d = product?.details || {};

  if (kind === 'COOK_TO_ORDER') {
    const least = minOrder(product);
    const orderBy = clockLabel(d.orderBy);
    return (
      <>
        <Facts
          compact={compact}
          facts={[
            ['Good for', d.serves && servesText(d.serves)],
            ['Minimum order', least > 1 && least],
            ['Ready in', prepLabel(d) && `${prepLabel(d)} after ${compact ? 'confirming' : 'the shop confirms your order'}`],
            ['Cooking days', `${cookDaysLabel(d)}${orderBy ? `, order by ${orderBy}` : ''}`],
          ]}
        />
        {d.notes && <Fact label="Seller notes:" note>{d.notes}</Fact>}
      </>
    );
  }

  if (kind === 'LIVESTOCK') {
    const heads = Math.max(0, Number(product.stock) || 0);
    return (
      <>
        <Facts
          compact={compact}
          facts={[
            ['Animal', animalLabel(d)],
            ['Age', ageLabel(d)],
            ['Sex', sexLabel(d)],
            ['Weight', weightLabel(d)],
            ['Heads available', heads || 'Sold out'],
            ['Farm visit', d.visitFirst && (compact ? 'You can visit first' : 'You can visit the farm first. Message the shop to set a day.')],
          ]}
        />
        {d.notes && <Fact label="Seller notes:" note>{d.notes}</Fact>}
      </>
    );
  }

  if (kind === 'PACKAGE') {
    const notice = Number(d.noticeHours) || 0;
    const made = d.packageKind !== 'OTHER' && PACKAGE_KINDS.find((k) => k.key === d.packageKind)?.label;
    return (
      <>
        <PackageItems product={product} made={made} ahead={notice > 0 ? aheadLabel(notice) : ''} />
      </>
    );
  }

  return null;
}
