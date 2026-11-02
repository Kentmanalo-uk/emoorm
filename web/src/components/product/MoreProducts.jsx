import { useEffect, useState } from 'react';
import useAuthStore from '../../store/authStore';
import { fetchForYou } from '../../lib/forYou';
import ProductTile from './ProductTile';
import './MoreProducts.css';

const COUNT = 20;

// The last answer and whose it was, so coming back to a page shows cards at once.
let saved = { owner: null, products: [] };

/**
 * More to look at, under the end of a page that has run out of its own
 * content (Messages, Notifications, Profile): the same cards as Home, picked
 * for this person (lib/forYou), with no heading. Nothing shows until there
 * are products to show, and a failed request leaves the page as it was.
 */
export default function MoreProducts({ className = '' }) {
  const userId = useAuthStore((s) => s.user?.id) || null;
  const [products, setProducts] = useState(() => (saved.owner === userId ? saved.products : []));

  useEffect(() => {
    let live = true;
    fetchForYou(userId, { pageSize: COUNT })
      .then((res) => {
        if (!live || !res?.data?.length) return;
        saved = { owner: userId, products: res.data };
        setProducts(res.data);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [userId]);

  if (!products.length) return null;
  return (
    <section className={`more-products ${className}`.trim()} aria-label="More products">
      {products.map((product) => <ProductTile key={product.id} product={product} />)}
    </section>
  );
}
