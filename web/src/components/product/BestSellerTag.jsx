import '../today/TodayTag.css';

/**
 * "Best seller": the product its shop has sold the most of (the server marks
 * it, storeBestSeller; backend bestSeller.service). Drawn exactly like the
 * Pre-order tag (.today-tag), in gold, before the product's name.
 */
export default function BestSellerTag({ product, className = '' }) {
  if (!product?.storeBestSeller) return null;
  return <span className={`today-tag is-best-seller ${className}`.trim()}>Best seller</span>;
}
