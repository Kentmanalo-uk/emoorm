import { useCallback, useMemo } from 'react';
import { Link, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowRight, CaretLeft, MapPin, Storefront, Tag, WarningCircle,
} from '../lib/icons';
import Layout from '../components/layout/Layout';
import PageMenu from '../components/layout/PageMenu';
import PullToRefresh from '../components/native/PullToRefresh';
import ProductTile from '../components/product/ProductTile';
import PalengkeBasket from '../components/palengke/PalengkeBasket';
import ListEnd from '../components/ui/ListEnd';
import Select from '../components/ui/Select';
import Skeleton from '../components/ui/Skeleton';
import useInfiniteList from '../hooks/useInfiniteList';
import { usePhoneLayout } from '../hooks/useMobileNav';
import { useMunicipalities } from '../hooks/useReferenceData';
import axios from '../lib/axios';
import { parseImages } from '../lib/media';
import { readCache, writeCache } from '../lib/pageCache';
import { isStockless, productKind } from '../lib/productKinds';
import useSeo from '../lib/seo';
import { saleInfo } from '../lib/variantPricing';
import useAuthStore from '../store/authStore';
import useCartStore from '../store/cartStore';
import './Palengke.css';

// The sort chips, as GET /products sorts (the same values as Products.jsx).
const SORTS = [
  { key: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'top-sales', label: 'Best selling', sortBy: 'orderCount', sortOrder: 'desc' },
  { key: 'price-low', label: 'Lowest price', sortBy: 'price', sortOrder: 'asc' },
];

// Products per batch; the next comes on its own as the end of the grid
// nears. Fills whole rows of the grid (5 / 4 / 3 / 2 columns).
const BATCH = 20;

/**
 * E-MOORM Palengke (/palengke): the fresh-market products, every product a
 * seller tagged Palengke (product.badge PALENGKE), in one grid that loads
 * on as it is scrolled. A hero with a basket of produce, sort chips and a
 * town filter (kept in the address, so a view can be shared), and Back
 * finds the list and the spot in it as left (pageCache, like Products).
 * Phones: the page's own top (Back, the title, ⋯) instead of the usual bar;
 * the chips stay at the top of the screen while the grid scrolls.
 */
export default function Palengke() {
  useSeo({
    title: 'E-MOORM Palengke',
    description: 'Fresh from Oriental Mindoro’s markets: gulay, prutas and more, straight from local sellers on E-MOORM.',
    path: '/palengke',
  });
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const isPhone = usePhoneLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const isSeller = useAuthStore((s) => s.user?.role?.toUpperCase() === 'SELLER');
  const addItem = useCartStore((s) => s.addItem);
  const { municipalities } = useMunicipalities();

  const sortKey = SORTS.some((s) => s.key === searchParams.get('sort')) ? searchParams.get('sort') : 'newest';
  const sort = SORTS.find((s) => s.key === sortKey);
  const town = searchParams.get('town') || '';
  const townName = municipalities.find((m) => m.id === town)?.name || '';

  const params = useMemo(() => {
    const p = {
      badge: 'PALENGKE', pageSize: BATCH, sortBy: sort.sortBy, sortOrder: sort.sortOrder,
    };
    if (town) p.municipalityId = town;
    return p;
  }, [sort, town]);
  const firstView = sortKey === 'newest' && !town;

  const list = useInfiniteList({
    listKey: `palengke-list:${JSON.stringify(params)}`,
    loadPage: async (page) => {
      const response = await axios.get('/products', { params: { ...params, page } });
      const items = response.data || [];
      return {
        items,
        total: response.pagination?.total ?? items.length,
        totalPages: response.pagination?.totalPages ?? 1,
      };
    },
    readSaved: readCache,
    // Back to another sort or town of this page: all of it, as it was left.
    restoreAll: navigationType === 'POP',
    // The device keeps the first batch of the default view; the rest, for this visit.
    save: (k, saved) => writeCache(k, saved, { visitOnly: !firstView || saved.page > 1 }),
  });
  const products = list.items;

  // A sort or a town starts the list over, from the top of the grid.
  const update = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setSearchParams(next, { replace: true });
    const grid = document.getElementById('plg-grid-top');
    if (grid && grid.getBoundingClientRect().top < 0) {
      window.scrollTo({ top: window.scrollY + grid.getBoundingClientRect().top - (isPhone ? 64 : 160) });
    }
  };

  const handleAddToCart = useCallback((e, product) => {
    e.preventDefault();
    e.stopPropagation();
    // Live animals are bought by making an offer on their page.
    if (productKind(product) === 'LIVESTOCK') { navigate(`/product/${product.slug}`); return; }
    if (product.stock === 0 && !isStockless(product)) {
      toast.error('Out of stock');
      return;
    }
    // Options are chosen on the product page.
    if (Array.isArray(product.variations) && product.variations.length > 0) {
      navigate(`/product/${product.slug}`);
      return;
    }
    try {
      addItem({
        id: product.id,
        productId: product.id,
        name: product.name,
        price: saleInfo(product).price,
        image: parseImages(product.images)[0] || '/placeholder-product.png',
        storeId: product.storeId || product.store?.id,
        storeName: product.store?.name,
        storeLogo: product.store?.logoUrl || product.store?.logo || null,
        readyToSell: product.store?.readyToSell,
        stock: product.stock,
        listingKind: product.listingKind,
        availability: product.availability,
        productType: product.productType,
        details: product.details,
        fulfillment: product.fulfillment,
        weightGrams: product.weightGrams,
        slug: product.slug,
        categoryId: product.categoryId,
        selectedVariations: null,
      }, 1);
      toast.success(`${product.name} added to cart`);
    } catch (error) {
      toast.error(error.message || 'Failed to add to cart');
    }
  }, [addItem, navigate]);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/'));

  const countLine = list.loading
    ? <Skeleton height={12} width={120} />
    : (
      <>
        <strong>{list.total}</strong> {list.total === 1 ? 'product' : 'products'}
        {townName ? <> in {townName}</> : null}
      </>
    );

  let body;
  if (list.loading) {
    body = <Skeleton.Cards count={isPhone ? 6 : 10} />;
  } else if (list.error) {
    body = (
      <div className="plg-state" role="alert">
        <WarningCircle size={56} weight="fill" className="plg-state-warn" />
        <h2>Couldn’t load the palengke</h2>
        <p>{list.error.message || 'Check your connection and try again.'}</p>
        <button type="button" className="plg-btn is-primary" onClick={list.reload}>Try again</button>
      </div>
    );
  } else if (products.length === 0) {
    body = (
      <div className="plg-state">
        <div className="plg-state-art"><PalengkeBasket size={132} /></div>
        <h2>{town ? `No palengke products in ${townName || 'this town'} yet` : 'The palengke is still setting up'}</h2>
        <p>
          {town
            ? 'Sellers in this town haven’t tagged any products Palengke yet. Try all towns, or browse everything on E-MOORM.'
            : 'No seller has tagged a product Palengke yet. Fresh gulay, prutas and more will show here as soon as they do.'}
        </p>
        <div className="plg-state-actions">
          {town && <button type="button" className="plg-btn is-primary" onClick={() => update({ town: '' })}>Show all towns</button>}
          <Link to="/products" className={`plg-btn${town ? '' : ' is-primary'}`}>Browse all products <ArrowRight size={16} /></Link>
        </div>
        {isSeller && (
          <p className="plg-seller-hint">
            <Tag size={16} weight="fill" />
            <span>
              Selling fresh produce? Pick the <strong>Palengke</strong> badge in your product form and it shows here.
              {' '}<Link to="/seller/products">Your products</Link>
            </span>
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <div className="plg-grid">
        {products.map((product) => (
          <ProductTile key={product.id} product={product} onAddToCart={handleAddToCart} />
        ))}
      </div>
    );
  }

  return (
    <Layout phoneBar={false}>
      <PullToRefresh onRefresh={list.reload}>
        <div className="plg">
          <div className="plg-wrap">
            {!isPhone && (
              <nav className="plg-crumbs" aria-label="Breadcrumb">
                <Link to="/">Home</Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">Palengke</span>
              </nav>
            )}

            <header className="plg-hero">
              <div className="plg-awning" aria-hidden="true" />
              {isPhone && (
                <div className="plg-hero-bar">
                  <button type="button" className="plg-round" onClick={goBack} aria-label="Back">
                    <CaretLeft size={22} weight="bold" />
                  </button>
                  <PageMenu className="plg-menu" />
                </div>
              )}
              <div className="plg-hero-body">
                <div className="plg-hero-copy">
                  <p className="plg-kicker"><Storefront size={15} weight="fill" /> Fresh market</p>
                  <h1 className="plg-title">
                    <span className="plg-title-brand">E-MOORM</span>
                    {' '}
                    <span className="plg-title-word">Palengke</span>
                  </h1>
                  <p className="plg-lede">
                    Fresh from Mindoro’s markets — gulay, prutas and more, straight from local sellers.
                  </p>
                  <p className="plg-count">{countLine}</p>
                </div>
                <div className="plg-hero-art">
                  <span className="plg-hero-glow" aria-hidden="true" />
                  <PalengkeBasket size={isPhone ? 124 : 270} className="plg-basket" />
                </div>
              </div>
            </header>

            <div className="plg-tools" role="toolbar" aria-label="Sort and filter">
              <div className="plg-sorts" role="radiogroup" aria-label="Sort by">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="radio"
                    aria-checked={sortKey === s.key}
                    className={`plg-chip${sortKey === s.key ? ' is-on' : ''}`}
                    onClick={() => update({ sort: s.key === 'newest' ? '' : s.key })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className={`plg-town-wrap${town ? ' is-on' : ''}`}>
                <MapPin size={15} weight="fill" className="plg-town-pin" aria-hidden="true" />
                <Select
                  aria-label="Town"
                  value={town}
                  onChange={(e) => update({ town: e.target.value })}
                  className="plg-town"
                >
                  <option value="">All towns</option>
                  {municipalities.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </div>
            </div>

            <div id="plg-grid-top" />
            {body}
            {!list.loading && !list.error && products.length > 0 && (
              <ListEnd list={list} done={list.total > BATCH ? 'That’s everything in the palengke for now' : ''} />
            )}
          </div>
        </div>
      </PullToRefresh>
    </Layout>
  );
}
