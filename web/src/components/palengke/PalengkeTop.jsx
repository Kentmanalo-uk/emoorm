import { Link } from 'react-router-dom';
import ProductImage from '../ProductImage';
import KindPrice from '../product/kinds/KindPrice';
import { parseImages } from '../../lib/media';
import { saleInfo } from '../../lib/variantPricing';

/**
 * "Top Palengke": the three best-selling palengke products (units sold,
 * GET /products?badge=PALENGKE&sortBy=orderCount), Top 1 in the middle and
 * a little larger, each with its ribbon. The page shows it only when three
 * products have really sold, so the ranking is never made up.
 */
export default function PalengkeTop({ products }) {
  return (
    <section className="plg-top" aria-labelledby="plg-top-title">
      <div className="plg-top-head">
        {/* The words in a span: phones hold headings at medium (index.css). */}
        <h2 id="plg-top-title" className="notranslate" translate="no"><span>Top Palengke</span></h2>
        <span>Most sold</span>
      </div>
      <ol className="plg-top-row">
        {products.map((p, i) => (
          <li key={p.id} className={`plg-rank is-${i + 1}`}>
            <Link to={`/product/${p.slug}`} className="plg-rank-card">
              <span className="plg-rank-photo">
                <ProductImage
                  src={parseImages(p.images)[0]}
                  alt=""
                  sizes={i === 0 ? '(max-width: 768px) 38vw, 240px' : '(max-width: 768px) 32vw, 200px'}
                />
              </span>
              <span className="plg-ribbon notranslate" translate="no">
                Top <span className="plg-ribbon-n">{i + 1}</span>
              </span>
              <span className="plg-rank-info">
                <span className="plg-rank-name">{p.name}</span>
                <span className="plg-rank-price">
                  <KindPrice product={p}>₱{saleInfo(p).price.toFixed(2)}</KindPrice>
                </span>
                <span className="plg-rank-sold">{Number(p.soldCount)} sold</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
