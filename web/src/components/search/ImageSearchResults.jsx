import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Camera, CaretDown, CaretUp, MapPin, ShoppingCart, SlidersHorizontal, Star,
} from '@phosphor-icons/react';
import ProductImage from '../ProductImage';
import EmptyState from '../ui/EmptyState';
import { SaleWas } from '../ui/SaleTag';
import KindPrice from '../product/kinds/KindPrice';
import { ProductTodayTag } from '../today/TodayTag';
import { notTakingOrders } from '../../lib/availability';
import useProductPeek from '../peek/useProductPeek';
import SearchFilterSheet from './SearchFilterSheet';
import useCartStore from '../../store/cartStore';
import { useCategories, useMunicipalities } from '../../hooks/useReferenceData';
import { saleInfo } from '../../lib/variantPricing';
import { parseImages } from '../../lib/media';
import { isStockless, productKind } from '../../lib/productKinds';
import './ImageSearchResults.css';

/*
 * The matches of a search by image, sorted and filtered like the search
 * results page (Best match / Newest / Top Sales / Price, then Filter ·
 * Municipality · Category · Price; here on the matches already found).
 *
 *   variant 'sheet'  phones: a sheet rising over the photo, dragged by its
 *                    top between about half the screen and nearly full
 *   variant 'panel'  desktop: a panel beside the photo
 */

const NO_FILTERS = { municipalityId: '', category: '', minPrice: '', maxPrice: '' };
const SORTS = {
  newest: (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  'top-sales': (a, b) => (Number(b.soldCount) || 0) - (Number(a.soldCount) || 0),
  'price-low': (a, b) => saleInfo(a).price - saleInfo(b).price,
  'price-high': (a, b) => saleInfo(b).price - saleInfo(a).price,
};
// Where the sheet rests: nearly full (this far from the top), or about half the screen.
const FULL_TOP = 60;
const HALF = 0.44;

const peso = (n, digits = 2) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export default function ImageSearchResults({
  results, photoUrl, onRetake, variant = 'panel',
}) {
  const sheet = variant === 'sheet';
  const navigate = useNavigate();
  const peekProduct = useProductPeek();
  const addItem = useCartStore((s) => s.addItem);

  const [sortBy, setSortBy] = useState('relevance');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [filterSheet, setFilterSheet] = useState(null);
  const { municipalities } = useMunicipalities();
  const { categories } = useCategories();

  const shown = useMemo(() => {
    const min = Number(filters.minPrice) || 0;
    const max = Number(filters.maxPrice) || Infinity;
    const list = results.filter((p) => {
      const price = saleInfo(p).price || Number(p.price) || 0;
      if (filters.municipalityId && (p.municipality?.id || p.municipalityId || p.store?.municipality?.id) !== filters.municipalityId) return false;
      if (filters.category && (p.category?.id || p.categoryId) !== filters.category) return false;
      return price >= min && price <= max;
    });
    const by = SORTS[sortBy];
    return by ? [...list].sort(by) : list;
  }, [results, filters, sortBy]);

  const filterCount = [filters.municipalityId, filters.category, filters.minPrice || filters.maxPrice].filter(Boolean).length;
  const priceActive = Boolean(filters.minPrice || filters.maxPrice);
  const priceOn = sortBy === 'price-low' || sortBy === 'price-high';
  const town = municipalities.find((m) => m.id === filters.municipalityId)?.name;
  const cat = categories.find((c) => c.id === filters.category)?.name;
  const priceLabel = priceActive
    ? (filters.maxPrice ? `₱${filters.minPrice || 0} – ₱${filters.maxPrice}` : `₱${filters.minPrice} and up`)
    : 'Price';

  const addToCart = (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    // Live animals are bought by making an offer; options are chosen on the page.
    if (productKind(product) === 'LIVESTOCK' || (Array.isArray(product.variations) && product.variations.length > 0)) {
      navigate(`/product/${product.slug}`);
      return;
    }
    if (product.stock === 0 && !isStockless(product)) {
      toast.error('Out of stock');
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
  };

  /* ── The sheet's drag (phones) ─────────────────────────────────────── */
  const [viewH, setViewH] = useState(() => window.innerHeight);
  const halfY = Math.max(0, Math.round(viewH * HALF) - FULL_TOP);
  // Its offset from the nearly-full spot; starts below the screen and rises.
  const [y, setY] = useState(viewH);
  const [dragging, setDragging] = useState(false);
  const at = useRef(halfY);
  const drag = useRef(null);

  useEffect(() => {
    if (!sheet) return undefined;
    const onResize = () => setViewH(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sheet]);

  useEffect(() => {
    if (!sheet) return undefined;
    // Rise to half the screen once it is on the page.
    const frame = requestAnimationFrame(() => {
      at.current = at.current === 0 ? 0 : halfY;
      setY(at.current);
    });
    return () => cancelAnimationFrame(frame);
  }, [sheet, halfY]);

  const snap = useCallback((to) => {
    at.current = to;
    setY(to);
  }, []);

  const onPointerDown = (e) => {
    if (!sheet || e.target.closest('button, a')) return;
    // A mouse would otherwise select text or pick up the photo.
    if (e.pointerType === 'mouse') e.preventDefault();
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false, id: e.pointerId };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.abs(dy) < 6) return;
      d.moved = true;
      setDragging(true);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    setY(Math.max(0, Math.min(viewH - 120 - FULL_TOP, at.current + dy)));
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    setDragging(false);
    if (!d.moved) {
      // A tap on the handle: the other height.
      if (e.target.closest('.isr-handle')) snap(at.current === 0 ? halfY : 0);
      return;
    }
    const end = at.current + (e.clientY - d.startY) + d.v * 120;
    snap(Math.abs(end) < Math.abs(end - halfY) ? 0 : halfY);
  };
  // Scrolling the matches at half height: the sheet opens up first.
  const onScroll = (e) => {
    if (sheet && at.current !== 0 && e.currentTarget.scrollTop > 8) snap(0);
  };

  const head = (
    <div
      className="isr-grab"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {sheet && <span className="isr-handle" role="presentation" />}
      <div className="isr-head">
        {photoUrl ? <img className="isr-thumb" src={photoUrl} alt="Your photo" draggable={false} /> : <span className="isr-thumb" />}
        <div className="isr-title">
          <h2>{`${shown.length} ${shown.length === 1 ? 'match' : 'matches'}`}</h2>
          <p>Similar products from local shops</p>
        </div>
        <button type="button" className="isr-retake" onClick={onRetake}>
          <Camera size={15} /> Retake
        </button>
      </div>
    </div>
  );

  const controls = (
    <div className="isr-controls">
      <div className="srch-m-sorts isr-sorts" role="tablist" aria-label="Sort by">
        {[['relevance', 'Best match'], ['newest', 'Newest'], ['top-sales', 'Top Sales']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={sortBy === key} className={sortBy === key ? 'is-on' : ''} onClick={() => setSortBy(key)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={priceOn}
          aria-label={sortBy === 'price-low' ? 'Price, low to high' : sortBy === 'price-high' ? 'Price, high to low' : 'Price'}
          className={priceOn ? 'is-on' : ''}
          onClick={() => setSortBy(sortBy === 'price-low' ? 'price-high' : 'price-low')}
        >
          Price
          <span className="srch-m-sort-dir" aria-hidden="true">
            <CaretUp size={10} weight="bold" className={sortBy === 'price-low' ? 'is-on' : ''} />
            <CaretDown size={10} weight="bold" className={sortBy === 'price-high' ? 'is-on' : ''} />
          </span>
        </button>
      </div>
      <div className="srch-m-filters isr-filters" role="toolbar" aria-label="Filters">
        <button type="button" className={`srch-m-fchip${filterCount ? ' is-active' : ''}`} onClick={() => setFilterSheet('all')}>
          <SlidersHorizontal size={15} /> Filter{filterCount ? ` (${filterCount})` : ''}
        </button>
        <button type="button" className={`srch-m-fchip${filters.municipalityId ? ' is-active' : ''}`} onClick={() => setFilterSheet('municipality')}>
          <MapPin size={15} /> {town || 'Municipality'} <CaretDown size={12} />
        </button>
        <button type="button" className={`srch-m-fchip${filters.category ? ' is-active' : ''}`} onClick={() => setFilterSheet('category')}>
          {cat || 'Category'} <CaretDown size={12} />
        </button>
        <button type="button" className={`srch-m-fchip${priceActive ? ' is-active' : ''}`} onClick={() => setFilterSheet('price')}>
          {priceLabel} <CaretDown size={12} />
        </button>
      </div>
    </div>
  );

  const body = !results.length ? (
    <EmptyState
      className="isr-empty"
      art="search"
      title="No matches for this photo"
      text="Try a clearer photo of a single product, in good light."
      actions={[{ label: 'Retake', icon: Camera, onClick: onRetake }]}
    />
  ) : !shown.length ? (
    <EmptyState
      className="isr-empty"
      art="search"
      title="Nothing matches these filters"
      actions={[{ label: 'Clear filters', variant: 'outline', onClick: () => setFilters(NO_FILTERS) }]}
    />
  ) : (
    <div className="isr-grid">
      {shown.map((product) => {
        const place = product.municipality?.name || product.store?.municipality?.name;
        const reviews = Number(product.reviewCount) || 0;
        const sold = Number(product.soldCount) || 0;
        return (
          <Link key={product.id} to={`/product/${product.slug}`} className="product-card isr-card" {...peekProduct(product)}>
            <div className="product-image">
              <ProductImage src={parseImages(product.images)[0]} alt={product.name} />
              {product.stock === 0 && !isStockless(product) && !notTakingOrders(product) && <div className="product-badge out-of-stock">Out of Stock</div>}
              {!notTakingOrders(product) && (
              <button type="button" className="product-cart-fab" onClick={(e) => addToCart(e, product)} aria-label="Add to cart">
                <ShoppingCart size={16} />
              </button>
              )}
            </div>
            <div className="product-info isr-info">
              <h3 className="product-name"><ProductTodayTag product={product} />{product.name}</h3>
              <span className="isr-price"><KindPrice product={product}>{peso(saleInfo(product).price)}</KindPrice> <SaleWas product={product} compact /></span>
              <span className="isr-meta">
                {reviews > 0 && <span className="isr-rating"><Star size={13} weight="fill" /> {Number(product.averageRating || 0).toFixed(1)}</span>}
                {sold > 0 && <span>{sold} sold</span>}
                {!reviews && !sold && <span className="isr-new">New</span>}
              </span>
              {place && <span className="isr-place"><MapPin size={13} /> {place}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <section
        className={`isr ${sheet ? 'is-sheet' : 'is-panel'}${dragging ? ' is-dragging' : ''}`}
        style={sheet ? { top: FULL_TOP, transform: `translateY(${y}px)` } : undefined}
        aria-label="Matches"
      >
        {head}
        <div className="isr-scroll" onScroll={onScroll}>
          {controls}
          {body}
        </div>
      </section>

      {/* Straight on <body>: inside the sheet (its slide) or the site layout
          the filter sheet would sit under the header. */}
      {createPortal(
        <div className="isr-filter-host">
          <SearchFilterSheet
            focus={filterSheet}
            onClose={() => setFilterSheet(null)}
            municipalities={municipalities}
            categories={categories}
            value={filters}
            onChange={(part) => setFilters((f) => ({ ...f, ...part }))}
            onReset={() => setFilters(NO_FILTERS)}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
