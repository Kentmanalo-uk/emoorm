import { Link, useNavigationType, useParams, useSearchParams } from 'react-router-dom';
import { ShoppingBag, WarningCircle } from '../lib/icons';
import Layout from '../components/layout/Layout';
import ProductTile from '../components/product/ProductTile';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ListEnd from '../components/ui/ListEnd';
import PullToRefresh from '../components/native/PullToRefresh';
import {
  GiftArt, CalendarArt, BrushArt, BowlArt, PackageArt, SaleArt,
} from '../components/art/FlatArt';
import useInfiniteList from '../hooks/useInfiniteList';
import useShortcutLook from '../hooks/useShortcutLook';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { readCache, writeCache } from '../lib/pageCache';
import useSeo from '../lib/seo';
import axios from '../lib/axios';
import NotFound from './NotFound';
import './Collection.css';

/*
 * A collection: one of Home's shortcuts opened into the whole list (/c/:key),
 * e.g. Pasalubong or On Sale. A header (the shortcut's mark, a title, one
 * line), three sorts, and every product of it, a batch at a time as the end
 * of the grid nears (as Products). Back finds the list and the spot in it.
 */

// Each collection: its words and what GET /products is asked for.
const COLLECTIONS = {
  pasalubong: {
    title: 'Pasalubong',
    line: 'Local delicacies and handmade crafts to bring home.',
    params: { categories: 'local-delicacies,handicrafts' },
    Art: GiftArt,
  },
  'pre-order': {
    title: 'Pre-order',
    line: 'Order ahead from local sellers.',
    params: { badge: 'PRE_ORDER' },
    Art: CalendarArt,
  },
  diy: {
    title: 'DIY & Crafts',
    line: 'Crafts and do-it-yourself finds from local sellers.',
    params: { badge: 'DIY' },
    Art: BrushArt,
  },
  'ready-to-eat': {
    title: 'Ready to Eat',
    line: 'Cooked meals and snacks from local kitchens.',
    params: { productType: 'READY_TO_EAT' },
    Art: BowlArt,
  },
  packages: {
    title: 'Packages',
    line: 'Bundles from local shops, like party and family meal packs.',
    params: { productType: 'PACKAGE' },
    Art: PackageArt,
  },
  'on-sale': {
    title: 'On Sale',
    line: 'Products with a sale price right now.',
    params: { onSale: 1 },
    Art: SaleArt,
  },
};

// The sorts offered, as Products' sort values (its SORTS) and the API's.
const SORTS = [
  { key: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'top-sales', label: 'Best selling', sortBy: 'orderCount', sortOrder: 'desc' },
  { key: 'price-low', label: 'Lowest price', sortBy: 'price', sortOrder: 'asc' },
];

// Products per batch: whole rows of the grid (5 / 4 / 2 columns).
const BATCH = 20;

export default function Collection() {
  const { key } = useParams();
  const preset = Object.hasOwn(COLLECTIONS, key) ? COLLECTIONS[key] : null;
  if (!preset) return <NotFound />;
  return <CollectionPage key={key} slug={key} preset={preset} />;
}

function CollectionPage({ slug, preset }) {
  const { title, line, params: filter, Art } = preset;
  useSeo({ title, description: `${line} From local sellers across Oriental Mindoro on E-MOORM.` });
  const isPhone = usePhoneLayout();
  const look = useShortcutLook();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const sortKey = SORTS.some((s) => s.key === searchParams.get('sort')) ? searchParams.get('sort') : 'newest';
  const sort = SORTS.find((s) => s.key === sortKey);

  const params = {
    ...filter, pageSize: BATCH, sortBy: sort.sortBy, sortOrder: sort.sortOrder,
  };
  const list = useInfiniteList({
    listKey: `collection:${slug}:${sortKey}`,
    loadPage: async (page) => {
      const res = await axios.get('/products', { params: { ...params, page } });
      const items = Array.isArray(res?.data) ? res.data : [];
      return {
        items,
        total: res.pagination?.total ?? items.length,
        totalPages: res.pagination?.totalPages ?? 1,
      };
    },
    readSaved: readCache,
    // Back to the other sort of this page: all of it, as it was left.
    restoreAll: navigationType === 'POP',
    save: (k, saved) => writeCache(k, saved, { visitOnly: true }),
  });

  const pickSort = (next) => {
    if (next === sortKey) return;
    window.scrollTo(0, 0);
    const p = new URLSearchParams(searchParams);
    if (next === 'newest') p.delete('sort'); else p.set('sort', next);
    setSearchParams(p, { replace: true });
  };

  const count = list.loading ? null : list.total;
  const empty = !list.loading && !list.error && list.items.length === 0;

  const sorts = (
    <div className="coll-sorts" role="group" aria-label="Sort by">
      {SORTS.map((s) => (
        <button
          key={s.key}
          type="button"
          className={`coll-sort${s.key === sortKey ? ' is-on' : ''}`}
          aria-pressed={s.key === sortKey}
          onClick={() => pickSort(s.key)}
        >
          {s.label}
        </button>
      ))}
    </div>
  );

  let body;
  if (list.loading) {
    body = <Skeleton.Cards count={isPhone ? 6 : 10} />;
  } else if (list.error) {
    body = (
      <div className="coll-error" role="alert">
        <WarningCircle size={48} weight="fill" />
        <h2>Couldn’t load {title}</h2>
        <p>Check your connection and try again.</p>
        <button type="button" onClick={list.reload}>Try again</button>
      </div>
    );
  } else if (list.items.length === 0) {
    body = (
      <EmptyState
        className="coll-empty"
        art="products"
        roomy
        title={`No ${title} products yet`}
        text="Local sellers add new products every day. Check back soon, or browse everything for now."
        actions={[{ label: 'Browse all products', to: '/products', icon: ShoppingBag }]}
      />
    );
  } else {
    body = (
      <>
        <div className="coll-grid">
          {list.items.map((product) => <ProductTile key={product.id} product={product} />)}
        </div>
        <ListEnd list={list} done={list.total > BATCH ? `That’s all of ${title} for now` : ''} />
      </>
    );
  }

  return (
    <Layout>
      <PullToRefresh onRefresh={list.reload}>
        <div className={`coll${isPhone ? ' is-phone' : ''}`}>
          <div className="coll-container">
            {!isPhone && (
              <nav className="coll-crumbs" aria-label="Breadcrumb">
                <Link to="/">Home</Link>
                <span aria-hidden="true">/</span>
                <span>{title}</span>
              </nav>
            )}

            <header className="coll-head">
              <span className="coll-art" aria-hidden="true"><Art size={isPhone ? 40 : 56} look={look} /></span>
              <div className="coll-head-text">
                <h1 className="coll-title">{title}</h1>
                <p className="coll-line">{line}</p>
              </div>
            </header>

            {/* Nothing to sort or count in an empty list. */}
            {!empty && (
              <div className="coll-bar">
                {sorts}
                <p className="coll-count" aria-live="polite">
                  {count == null ? <Skeleton height={11} width={90} /> : (
                    <><strong>{count}</strong> {count === 1 ? 'product' : 'products'}</>
                  )}
                </p>
              </div>
            )}

            {body}
          </div>
        </div>
      </PullToRefresh>
    </Layout>
  );
}
