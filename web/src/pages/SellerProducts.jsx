import React, { useState, useEffect, useRef } from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, PencilSimple as Edit2, Trash as Trash2, Eye, ArrowSquareOut,
  MagnifyingGlass as Search, WarningCircle as AlertCircle, CheckCircle, Clock, X, CircleNotch as Loader2,
  EyeSlash as EyeOff, Archive, DotsThree, SlidersHorizontal, Check, Minus, Prohibit, CaretRight,
} from '@phosphor-icons/react';
import { usePhoneLayout } from '../hooks/useMobileNav';
import PhoneSheet from '../components/seller/PhoneSheet';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { resolveImg } from '../lib/media';
import './SellerDashboard.css';
import './SellerStore.css';
import './SellerApp.css';
import './SellerProducts.css';
import { useCategories } from '../hooks/useReferenceData';
import SellerPageHead from '../components/seller/SellerPageHead';
import ProductForm from '../components/seller/ProductForm';
import PackageForm from '../components/seller/PackageForm';
import { sellBlockers } from '../lib/sellerSetup';
import { readCache, writeCache } from '../lib/pageCache';
import { isTodayProduct, isOpen as windowOpen, windowState } from '../lib/availability';
import { headsLabel, isStockless, priceUnit, productKind } from '../lib/productKinds';

const STATUS_LABELS = {
  PENDING: { label: 'Pending Approval', cls: 'status-pending', icon: <Clock size={12} /> },
  APPROVED: { label: 'Live', cls: 'status-confirmed', icon: <CheckCircle size={12} /> },
  HIDDEN: { label: 'Hidden', cls: 'status-pending', icon: <EyeOff size={12} /> },
  SUSPENDED: { label: 'Suspended', cls: 'status-cancelled', icon: <AlertCircle size={12} /> },
  ARCHIVED: { label: 'Archived', cls: 'status-cancelled', icon: <Archive size={12} /> },
};

// A live product in a shop that cannot sell yet is not shown to buyers.

// Filter tabs. A status key is sent as `status` to GET /products/my/products;
// "restock" (out of stock or running low) is sent as `stock=restock`.
const PRODUCT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'APPROVED', label: 'Live' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'HIDDEN', label: 'Hidden' },
  { key: 'restock', label: 'Needs restock' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'ARCHIVED', label: 'Archived' },
];

// How many products each tab holds, from GET /products/my/summary.
const countFor = (summary, key) => {
  if (!summary) return null;
  if (key === 'all') return summary.total;
  if (key === 'restock') return (summary.outOfStock || 0) + (summary.lowStock || 0);
  return summary.byStatus?.[key] ?? 0;
};

// Phones show these as chips; the rest of PRODUCT_TABS sit in a sheet.
const PHONE_QUICK_TABS = ['all', 'APPROVED', 'PENDING'];

const stockLevel = (product) => {
  // Available Today: at 0 between posts on purpose, never "out of stock";
  // cooked-to-order food keeps no stock at all.
  if (isTodayProduct(product) || isStockless(product)) return 'ok';
  const stock = Number(product?.stock ?? 0);
  if (stock <= 0) return 'out';
  const threshold = Number(product?.lowStockThreshold ?? 0);
  return stock <= threshold ? 'low' : 'ok';
};

const hasStockPerChoice = (product) => Array.isArray(product?.variations)
  && product.variations.some((v) => v?.stocks && Object.keys(v.stocks).length);

// What a product's stock counts, in the words of its kind: live animals by
// the head, packages by the package.
const stockWords = (product) => {
  const kind = productKind(product);
  if (kind === 'LIVESTOCK') return { add: 'Add heads', now: 'Heads available now', unit: (n) => (n === 1 ? 'head' : 'heads') };
  if (kind === 'PACKAGE') return { add: 'Add packages', now: 'Packages available now', unit: (n) => (n === 1 ? 'package' : 'packages') };
  return { add: 'Add stock', now: 'In stock now', unit: null };
};

// How many different products a package holds.
const itemsLabel = (product) => {
  const n = Array.isArray(product?.packageItems) ? product.packageItems.length : 0;
  return `${n} ${n === 1 ? 'item' : 'items'}`;
};

// A package item deleted or taken off show since: the seller should fix the package.
const packageIssue = (product) => (Array.isArray(product?.packageItems)
  && product.packageItems.some((it) => it.product?.deletedAt
    || ['HIDDEN', 'SUSPENDED', 'ARCHIVED'].includes(it.product?.status)));

export default function SellerProducts() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { categories } = useCategories();
  // Until the shop is ready to sell, buyers can see its products but cannot order them.
  const outlet = useOutletContext();
  const blockers = sellBlockers(outlet?.setup);
  const notReady = blockers.length > 0;
  const statusOf = (product) => STATUS_LABELS[product.status] || STATUS_LABELS.PENDING;
  const tabLabel = (key) => PRODUCT_TABS.find((t) => t.key === key)?.label;
  // Seeded from ?search= so a top-bar search result opens filtered.
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = searchParams.get('status');
    return PRODUCT_TABS.some((t) => t.key === fromUrl) ? fromUrl : 'all';
  });
  // Each tab's first page as it showed last time: shown at once while it is
  // asked for again. Editing waits for the fresh list (productsFresh).
  const [saved] = useState(() => (search ? undefined : readCache(`seller:products:${statusFilter}`)));
  const [products, setProducts] = useState(() => saved?.products || []);
  const [productsFresh, setProductsFresh] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !saved);
  const [pagination, setPagination] = useState(() => ({ total: 0, page: 1, totalPages: 1, ...(saved?.pagination || {}) }));
  // Counts for the tabs and the phone's "needs attention" rows.
  const [summary, setSummary] = useState(() => readCache('seller:products:summary') || null);
  // Inline restock: per-row draft quantity and the row currently saving.
  const [restockDrafts, setRestockDrafts] = useState({});
  const [restockingId, setRestockingId] = useState(null);

  // The form is a page of its own: /seller/products/new adds a product and
  // ?edit=<id> edits one, so the phone's back button closes it.
  const isNewRoute = /\/seller\/products\/new\/?$/.test(location.pathname) || searchParams.get('action') === 'new';
  const editParam = searchParams.get('edit');
  const [editingProduct, setEditingProduct] = useState(null);
  const showForm = isNewRoute || (!!editParam && !!editingProduct);
  // Packages have their own form: /seller/products/new?type=package, or
  // editing one.
  const packageForm = isNewRoute
    ? searchParams.get('type') === 'package'
    : productKind(editingProduct) === 'PACKAGE';

  // Phones: status sheet, a product's "more" sheet and its add-stock sheet.
  const isPhone = usePhoneLayout();
  const [statusSheet, setStatusSheet] = useState(false);
  // The chips row scrolls sideways; the chosen chip is always brought into view.
  const chipsRef = useRef(null);
  useEffect(() => {
    let live = true;
    const reveal = () => {
      const row = chipsRef.current;
      const chip = row?.querySelector('.scm-chip.is-on');
      if (!live || !row || !chip) return;
      const left = chip.offsetLeft - row.offsetLeft;
      if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) {
        row.scrollTo({ left: Math.max(0, left + chip.offsetWidth - row.clientWidth) });
      }
    };
    // After layout (the chips appear once the phone layout is known), and
    // again once the web font has loaded and widened the labels.
    const frame = requestAnimationFrame(reveal);
    document.fonts?.ready.then(reveal);
    return () => { live = false; cancelAnimationFrame(frame); };
  }, [statusFilter, summary, isPhone, isLoading]);
  const [moreFor, setMoreFor] = useState(null);
  const [stockFor, setStockFor] = useState(null);
  const [stockAmount, setStockAmount] = useState(1);

  // Bulk selection + confirm dialogs
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { type: 'delete-one'|'bulk-delete', product?, ids? }

  useEffect(() => {
    loadProducts();
  }, [pagination.page, search, statusFilter]);

  // Follows ?search= when it changes, so a second search from the top bar
  // re-filters instead of leaving the first term in place. Only a change to
  // the URL counts, so typing in this page's own box is left alone.
  const urlSearch = searchParams.get('search') || '';
  const lastUrlSearch = useRef(urlSearch);
  useEffect(() => {
    if (urlSearch === lastUrlSearch.current) return;
    lastUrlSearch.current = urlSearch;
    setSearch(urlSearch);
    setPagination((p) => ({ ...p, page: 1 }));
  }, [urlSearch]);

  // ?edit=<id> follows the URL: going back closes the form, and a reload
  // reopens it once the product is in the loaded list.
  useEffect(() => {
    if (!editParam) {
      if (editingProduct) setEditingProduct(null);
      return;
    }
    if (editingProduct?.id === editParam) return;
    // The form starts from the fresh product, never the saved copy.
    if (!productsFresh) return;
    const found = products.find((p) => p.id === editParam);
    if (found) setEditingProduct(found);
    else if (!isLoading) navigate('/seller/products', { replace: true });
  }, [editParam, products, productsFresh, isLoading]);

  // Opening or closing the form starts at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [showForm]);

  // The counts are extra: the list works without them.
  const loadSummary = async () => {
    try {
      const res = await axios.get('/products/my/summary');
      if (res.data) {
        setSummary(res.data);
        writeCache('seller:products:summary', res.data);
      }
    } catch {
      // Keep the last counts.
    }
  };

  const loadProducts = async () => {
    loadSummary();
    const viewKey = pagination.page === 1 && !search ? `seller:products:${statusFilter}` : null;
    const kept = viewKey ? readCache(viewKey) : undefined;
    if (kept) {
      setProducts(kept.products || []);
      if (kept.pagination) setPagination((p) => ({ ...p, ...kept.pagination }));
    } else {
      setIsLoading(true);
    }
    try {
      const res = await axios.get('/products/my/products', {
        params: {
          page: pagination.page,
          pageSize: 15,
          search: search || undefined,
          status: statusFilter !== 'all' && statusFilter !== 'restock' ? statusFilter : undefined,
          stock: statusFilter === 'restock' ? 'restock' : undefined,
        },
      });
      setProducts(res.data || []);
      setProductsFresh(true);
      if (res.pagination) {
        setPagination(p => ({ ...p, total: res.pagination.total, totalPages: res.pagination.totalPages }));
      }
      if (viewKey) {
        writeCache(viewKey, {
          products: res.data || [],
          pagination: res.pagination ? { total: res.pagination.total, totalPages: res.pagination.totalPages } : null,
        });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to load products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPagination(p => ({ ...p, page: 1 }));
    loadProducts();
  };

  const selectStatusTab = (key) => {
    if (key === statusFilter) return;
    setStatusFilter(key);
    setSelectedIds([]);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  // POST /products/:id/stock { delta } — the response is the updated product,
  // so the row is replaced in place instead of reloading the whole page.
  const changeStock = async (product, delta) => {
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error('Enter how many to add (or a minus number to remove)');
      return false;
    }
    setRestockingId(product.id);
    try {
      const res = await axios.post(`/products/${product.id}/stock`, { delta });
      const updated = res.data || {};
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...updated } : p)));
      setRestockDrafts((prev) => ({ ...prev, [product.id]: '' }));
      loadSummary();
      const unit = stockWords(product).unit;
      const n = Math.abs(delta);
      toast.success(unit
        ? `${delta > 0 ? 'Added' : 'Removed'} ${n} ${unit(n)}`
        : delta > 0 ? `Added ${delta} to stock` : `Removed ${n} from stock`);
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to update stock');
      return false;
    } finally {
      setRestockingId(null);
    }
  };

  const handleRestock = (product) => changeStock(product, parseInt(restockDrafts[product.id], 10));

  const openStockSheet = (product) => {
    setStockAmount(1);
    setStockFor(product);
  };

  const openNew = () => navigate('/seller/products/new', { state: { fromList: true } });
  const openNewPackage = () => navigate('/seller/products/new?type=package', { state: { fromList: true } });

  const openEdit = (product) => {
    setEditingProduct(product);
    navigate(`/seller/products?edit=${product.id}`, { state: { fromList: true } });
  };

  const closeForm = () => {
    // On phones the package form adds a history entry per step (?step=3).
    const steps = Math.max(1, parseInt(searchParams.get('step') || '1', 10) || 1);
    if (location.state?.fromList) navigate(-steps);
    else navigate('/seller/products', { replace: true });
  };

  const handleSaved = (saved, { created }) => {
    if (created && isTodayProduct(saved)) {
      toast.success("Product added. Post it in Today's menu when you have it.");
      closeForm();
      navigate('/seller/today');
      return;
    }
    const what = productKind(saved) === 'PACKAGE' ? 'Package' : 'Product';
    if (created) {
      toast.success(notReady && saved?.status === 'APPROVED'
        ? `${what} added. Buyers can see it, and can order once your shop is ready to sell.`
        : saved?.status === 'APPROVED'
          ? `${what} added. It is now live.`
          : `${what} added. It will go live once approved.`);
    } else {
      toast.success('Changes saved');
    }
    closeForm();
    loadProducts();
  };

  const handleDelete = (product) => {
    setConfirmState({ type: 'delete-one', product });
  };

  const confirmDeleteOne = async () => {
    const product = confirmState?.product;
    if (!product) return;
    setBulkLoading(true);
    try {
      await axios.delete(`/products/${product.id}`);
      toast.success(productKind(product) === 'PACKAGE' ? 'Package deleted' : 'Product deleted');
      setSelectedIds((ids) => ids.filter((id) => id !== product.id));
      loadProducts();
      setConfirmState(null);
    } catch (err) {
      toast.error(err.message || 'Failed to delete product');
    } finally {
      setBulkLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const runBulkAction = async (action) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await axios.patch('/products/bulk', { ids: selectedIds, action });
      toast.success(res.message || `${res.data?.updatedCount ?? 0} product(s) updated`);
      setSelectedIds([]);
      setConfirmState(null);
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Bulk action failed');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleToggleVisibility = async (product) => {
    setBulkLoading(true);
    try {
      const action = product.status === 'HIDDEN' ? 'UNHIDE' : 'HIDE';
      await axios.patch('/products/bulk', { ids: [product.id], action });
      toast.success(action === 'HIDE' ? 'Product hidden from buyers' : 'Product is live again');
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'Failed to update product');
    } finally {
      setBulkLoading(false);
    }
  };

  const restockCount = countFor(summary, 'restock') || 0;
  const suspendedCount = summary?.byStatus?.SUSPENDED || 0;
  // A tab's name with how many products it holds.
  const tabWithCount = (key) => {
    const count = countFor(summary, key);
    return (
      <>
        {tabLabel(key)}
        {count != null && <span className="products-tab-count"> {count}</span>}
      </>
    );
  };

  if (showForm && packageForm) {
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SellerPageHead
            className="pkf-head"
            title={isNewRoute ? 'Create a package' : 'Edit package'}
            subtitle="Sell some of your products together at one price."
          />
          <PackageForm
            key={isNewRoute ? 'new-package' : editingProduct?.id}
            product={isNewRoute ? null : editingProduct}
            store={outlet?.store}
            onCancel={closeForm}
            onSaved={handleSaved}
            sellBlockers={blockers}
          />
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SellerPageHead
            className="pf-head"
            title={editingProduct && !isNewRoute ? 'Edit product' : 'Add a product'}
            subtitle="Fill in the boxes below, top to bottom. Parts marked * are needed."
          />
          <ProductForm
            key={isNewRoute ? 'new' : editingProduct?.id}
            product={isNewRoute ? null : editingProduct}
            categories={categories}
            recentProducts={products}
            onCancel={closeForm}
            onSaved={handleSaved}
            sellBlockers={blockers}
          />
        </div>
      </div>
    );
  }

  const searchBar = (
    <div className={isPhone ? 'products-toolbar' : 'seller-card products-toolbar'}>
      <form onSubmit={handleSearchSubmit} className="products-search-form" role="search">
        <Search size={16} className="products-search-icon" />
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products…"
          className="products-search-input"
          enterKeyHint="search"
          aria-label="Search products"
        />
        {search && (
          <button type="button" className="products-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
            <X size={12} weight="bold" />
          </button>
        )}
        <button type="submit" className="products-search-btn">Search</button>
      </form>
    </div>
  );

  return (
    <div className="seller-dashboard">
      <div className="seller-container">
        <SellerPageHead
          title="My Products"
          subtitle="Add, edit, and manage your inventory"
          // Phones add products from the + in the header.
          actions={isPhone ? null : (
            <>
              <button className="btn-seller-outline" onClick={openNewPackage}>
                <Package size={16} /> Create a package
              </button>
              <button className="btn-seller-primary" onClick={openNew}>
                <Plus size={16} /> Add Product
              </button>
            </>
          )}
        />

        {/* Bulk action bar */}
        {selectedIds.length > 0 && (
          <div className="seller-card products-bulk-bar">
            <span className="products-bulk-count">{selectedIds.length} selected</span>
            <div className="products-bulk-actions">
              <button className="btn-seller-outline" disabled={bulkLoading} onClick={() => runBulkAction('HIDE')}>
                <EyeOff size={14} /> Hide
              </button>
              <button className="btn-seller-outline" disabled={bulkLoading || notReady} title={notReady ? 'Finish your shop setup first' : undefined} onClick={() => runBulkAction('UNHIDE')}>
                <Eye size={14} /> Unhide
              </button>
              <button
                className="btn-seller-outline btn-danger-outline"
                disabled={bulkLoading}
                onClick={() => setConfirmState({ type: 'bulk-delete', ids: selectedIds })}
              >
                <Trash2 size={14} /> Delete
              </button>
              <button className="seller-icon-btn" onClick={() => setSelectedIds([])} title="Clear selection" aria-label="Clear selection">
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* Phones: what needs doing, one Home-style row each. */}
        {isPhone && (notReady || restockCount > 0 || suspendedCount > 0) && (
          <div className="spm spm-notices">
            {notReady && (
              <Link to={blockers[0]?.to || '/seller'} className="sh-notice is-amber">
                <span className="sh-notice-icon"><AlertCircle size={22} weight="fill" /></span>
                <span className="sh-notice-text">
                  <b>Buyers can't order yet</b>
                  <span>Finish: {blockers.map((b) => b.label).join(', ')}</span>
                </span>
                <span className="sh-notice-cta">Finish</span>
              </Link>
            )}
            {restockCount > 0 && statusFilter !== 'restock' && (
              <button type="button" className={`sh-notice spm-notice is-${summary.outOfStock > 0 ? 'red' : 'amber'}`} onClick={() => selectStatusTab('restock')}>
                <span className="sh-notice-icon"><Package size={22} weight="fill" /></span>
                <span className="sh-notice-text">
                  <b>{restockCount === 1 ? '1 product needs restocking' : `${restockCount} products need restocking`}</b>
                  <span>{[summary.outOfStock > 0 && `${summary.outOfStock} out of stock`, summary.lowStock > 0 && `${summary.lowStock} running low`].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="sh-notice-cta">View</span>
              </button>
            )}
            {suspendedCount > 0 && statusFilter !== 'SUSPENDED' && (
              <button type="button" className="sh-notice spm-notice is-red" onClick={() => selectStatusTab('SUSPENDED')}>
                <span className="sh-notice-icon"><Prohibit size={22} weight="fill" /></span>
                <span className="sh-notice-text">
                  <b>{suspendedCount === 1 ? '1 product was suspended' : `${suspendedCount} products were suspended`}</b>
                  <span>Read the admin's note, then edit to send it back for review.</span>
                </span>
                <span className="sh-notice-cta">View</span>
              </button>
            )}
          </div>
        )}

        {notReady && !isPhone && (
          <div className="seller-card products-notlive" role="status">
            <AlertCircle size={20} weight="fill" className="products-notlive-icon" />
            <div className="products-notlive-text">
              <strong>Buyers can't order yet</strong>
              <span>
                Your products are on show. Buyers can order them once your shop is ready to sell. Still to do:{' '}
                {blockers.map((b, i) => (
                  <React.Fragment key={b.key}>
                    {i > 0 && ', '}
                    {b.to ? <Link to={b.to}>{b.label}</Link> : b.label}
                  </React.Fragment>
                ))}
                .
              </span>
            </div>
            <Link to={blockers[0]?.to || '/seller'} className="btn-seller-primary products-notlive-btn">Finish setup</Link>
          </div>
        )}

        {/* Status filter tabs (phones: under the search, on one panel as in Chat) */}
        {isPhone ? (
          <div className="spm-filterbar">
          {searchBar}
          <div className="scm-chips products-tabs" role="group" aria-label="Show products" ref={chipsRef}>
            {PHONE_QUICK_TABS.map((key) => (
              <button
                key={key}
                type="button"
                className={`scm-chip${statusFilter === key ? ' is-on' : ''}`}
                onClick={() => selectStatusTab(key)}
              >
                {tabWithCount(key)}
              </button>
            ))}
            <button
              type="button"
              className={`scm-chip scm-chip--more${PHONE_QUICK_TABS.includes(statusFilter) ? ' is-icon' : ' is-on'}`}
              onClick={() => setStatusSheet(true)}
              aria-label={PHONE_QUICK_TABS.includes(statusFilter) ? 'More filters' : undefined}
              title="More filters"
            >
              <SlidersHorizontal size={17} weight="bold" />
              {!PHONE_QUICK_TABS.includes(statusFilter) && tabWithCount(statusFilter)}
            </button>
          </div>
          </div>
        ) : (
          <div className="seller-tabs products-tabs">
            {PRODUCT_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`seller-tab ${statusFilter === t.key ? 'seller-tab--active' : ''}`}
                onClick={() => selectStatusTab(t.key)}
              >
                {tabWithCount(t.key)}
              </button>
            ))}
          </div>
        )}

        {!isPhone && searchBar}

        {/* Phones: packages start here (the header's + adds a product). */}
        {isPhone && statusFilter === 'all' && !search && products.length > 0 && (
          <button type="button" className="spm-package" onClick={openNewPackage}>
            <Package size={26} weight="fill" className="spm-package-icon" />
            <span className="spm-package-text">
              <b>Create a package</b>
              <span>Sell some of your products together at one price</span>
            </span>
            <CaretRight size={18} className="spm-package-arrow" />
          </button>
        )}

        {/* Products table */}
        <div className="seller-card">
          {isLoading ? (
            <Skeleton.Table cols={6} rows={6} />
          ) : products.length === 0 ? (
            statusFilter === 'all' && !search ? (
              <div className="seller-empty products-first">
                <EmptyArt name="products" size={136} />
                <strong>Add your first product</strong>
                <p>A photo, a name and a price are enough.</p>
                <button type="button" className="products-first-add" onClick={openNew} aria-label="Add product" title="Add product">
                  <Plus size={26} weight="bold" />
                </button>
              </div>
            ) : (
              <div className="seller-empty">
                <EmptyArt name={statusFilter === 'restock' && !search ? 'healthy' : 'search'} size={88} />
                <p>
                  {statusFilter === 'restock' && !search
                    ? 'All good: every product has enough stock.'
                    : 'No products match this filter.'}
                </p>
              </div>
            )
          ) : (
            <>
              <table className="seller-table products-table">
                <thead>
                  <tr>
                    <th className="products-th-check" data-label="Select all">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === products.length}
                        onChange={toggleSelectAll}
                        aria-label="Select all products"
                      />
                    </th>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => {
                    const s = statusOf(product);
                    const thumb = product.images?.[0];
                    const level = stockLevel(product);
                    const kind = productKind(product);
                    const words = stockWords(product);
                    const showNote = Boolean(product.moderationNote)
                      && (product.status === 'SUSPENDED' || product.status === 'ARCHIVED');
                    return (
                      <React.Fragment key={product.id}>
                      <tr className={showNote ? 'products-row--noted' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(product.id)}
                            onChange={() => toggleSelect(product.id)}
                            aria-label={`Select ${product.name}`}
                          />
                        </td>
                        <td>
                          <div className="product-cell">
                            {thumb ? (
                              <img src={resolveImg(thumb) || thumb} alt={product.name} className="product-thumb" />
                            ) : (
                              <div className="product-thumb product-thumb--placeholder">
                                <Package size={16} />
                              </div>
                            )}
                            <span className="product-cell-name">{product.name}</span>
                          </div>
                        </td>
                        <td>{product.category?.name || '—'}</td>
                        <td>
                          ₱{Number(product.price).toFixed(2)}
                          {priceUnit(product) && <span className="product-price-unit">{priceUnit(product)}</span>}
                        </td>
                        <td data-label="Stock">
                          {isTodayProduct(product) ? (
                            <div className="product-stock product-stock--today">
                              <span className="product-stock-line">
                                <span className="seller-badge product-today-badge">Available Today</span>
                                <span className="product-stock-label">
                                  {windowOpen(product.availability)
                                    ? `${product.stock} left`
                                    : windowState(product.availability).tone === 'soon' ? windowState(product.availability).text : 'Not posted now'}
                                </span>
                              </span>
                              {!isPhone && (
                                <Link to="/seller/today" className="btn-seller-outline product-restock-btn">Today&apos;s menu</Link>
                              )}
                            </div>
                          ) : isStockless(product) ? (
                            // Paluto: cooked when ordered, so no stock to count or add.
                            <div className="product-stock product-stock--made">
                              <span className="product-stock-line">
                                <span className="seller-badge product-kind-badge">Made to order</span>
                              </span>
                            </div>
                          ) : (
                          <div className={`product-stock ${level !== 'ok' ? `product-stock--${level}` : ''}`}>
                            {kind === 'PACKAGE' && (
                              <span className="product-stock-line">
                                <span className="seller-badge product-kind-badge">Package</span>
                                <span className="product-stock-note" title={product.packageItems?.map((it) => `${it.quantity} x ${it.product?.name || ''}`).join(', ')}>
                                  {itemsLabel(product)}
                                </span>
                              </span>
                            )}
                            {kind === 'PACKAGE' && packageIssue(product) && (
                              <span className="product-stock-line">
                                <span className="seller-badge status-pending product-stock-badge" title="An item in it was deleted or is hidden. Edit the package to check.">
                                  Check its items
                                </span>
                              </span>
                            )}
                            <span className="product-stock-line">
                              {kind === 'LIVESTOCK' ? (
                                <span className="product-stock-value" title={headsLabel(product.stock)}>
                                  {product.stock} <span className="product-stock-note">{Number(product.stock) === 1 ? 'head' : 'heads'}</span>
                                </span>
                              ) : kind === 'PACKAGE' ? (
                                <span className="product-stock-value">
                                  {product.stock} <span className="product-stock-note">available</span>
                                </span>
                              ) : (
                                <>
                                  <span className="product-stock-label">Stock</span>
                                  <span className="product-stock-value">{product.stock}</span>
                                </>
                              )}
                              {level === 'out' && (
                                <span className="seller-badge status-cancelled product-stock-badge">
                                  {kind === 'REGULAR' ? 'Out of stock' : 'Sold out'}
                                </span>
                              )}
                              {level === 'low' && (
                                <span className="seller-badge status-pending product-stock-badge">Low stock</span>
                              )}
                            </span>
                            {isPhone ? null : hasStockPerChoice(product) ? (
                              <button type="button" className="btn-seller-outline product-restock-btn" onClick={() => openEdit(product)}>
                                Edit stock
                              </button>
                            ) : (
                            <form
                              className="product-restock"
                              onSubmit={(e) => { e.preventDefault(); handleRestock(product); }}
                            >
                              <input
                                type="number"
                                step="1"
                                inputMode="numeric"
                                className="form-input product-restock-input"
                                placeholder="Qty"
                                aria-label={`How many ${product.name} to add`}
                                value={restockDrafts[product.id] ?? ''}
                                onChange={(e) => setRestockDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))}
                                disabled={restockingId === product.id}
                              />
                              <button
                                type="submit"
                                className="btn-seller-outline product-restock-btn"
                                disabled={restockingId === product.id || !restockDrafts[product.id]}
                              >
                                {restockingId === product.id ? <Loader2 size={13} className="spin" /> : words.add}
                              </button>
                            </form>
                            )}
                          </div>
                          )}
                        </td>
                        <td>
                          <span className={`seller-badge ${s.cls}`}>
                            {s.icon} {s.label}
                          </span>
                        </td>
                        <td>
                          {isPhone ? (
                            // Phones: the two everyday actions, the rest under ⋯.
                            <div className={`product-actions pm-actions${isStockless(product) ? ' pm-actions--two' : ''}`}>
                              <button type="button" className="pm-btn" onClick={() => openEdit(product)} aria-label={`Edit ${product.name}`}>
                                <Edit2 size={16} /> Edit
                              </button>
                              {isTodayProduct(product) ? (
                                <Link to="/seller/today" className="pm-btn">
                                  <Plus size={16} /> Post today
                                </Link>
                              ) : isStockless(product) ? null : hasStockPerChoice(product) ? (
                                <button type="button" className="pm-btn" onClick={() => openEdit(product)}>
                                  <Plus size={16} /> Edit stock
                                </button>
                              ) : (
                                <button type="button" className="pm-btn" onClick={() => openStockSheet(product)}>
                                  <Plus size={16} /> {words.add}
                                </button>
                              )}
                              <button
                                type="button"
                                className="pm-btn pm-btn--more"
                                onClick={() => setMoreFor(product)}
                                aria-label={`More for ${product.name}`}
                              >
                                <DotsThree size={20} weight="bold" />
                              </button>
                            </div>
                          ) : (
                          <div className="product-actions">
                            <button
                              className="seller-icon-btn product-action"
                              title="Edit"
                              aria-label={`Edit ${product.name}`}
                              onClick={() => openEdit(product)}
                            >
                              <Edit2 size={15} /><span>Edit</span>
                            </button>
                            {(product.status === 'APPROVED' || product.status === 'HIDDEN') && (
                              <button
                                className="seller-icon-btn product-action"
                                title={product.status === 'HIDDEN'
                                  ? 'Show to buyers again'
                                  : 'Hide from buyers'}
                                onClick={() => handleToggleVisibility(product)}
                                disabled={bulkLoading}
                              >
                                {product.status === 'HIDDEN' ? <Eye size={15} /> : <EyeOff size={15} />}
                                <span>{product.status === 'HIDDEN' ? 'Show' : 'Hide'}</span>
                              </button>
                            )}
                            <a
                              href={`/product/${product.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="seller-icon-btn product-action"
                              title="See it as a buyer"
                            >
                              <ArrowSquareOut size={15} /><span>View</span>
                            </a>
                            <button
                              className="seller-icon-btn seller-icon-btn--danger product-action"
                              title="Delete"
                              aria-label={`Delete ${product.name}`}
                              onClick={() => handleDelete(product)}
                            >
                              <Trash2 size={15} /><span>Delete</span>
                            </button>
                          </div>
                          )}
                        </td>
                      </tr>
                      {showNote && (
                        <tr className="products-note-row">
                          <td colSpan={7}>
                            <div className="products-moderation-note">
                              <AlertCircle size={14} />
                              <span>
                                <strong>{product.status === 'SUSPENDED' ? 'Suspended by admin: ' : 'Archived by admin: '}</strong>
                                {product.moderationNote}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="products-pagination">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    className="btn-seller-outline pagination-btn"
                  >
                    Prev
                  </button>
                  <span>{pagination.page} / {pagination.totalPages}</span>
                  <button
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                    className="btn-seller-outline pagination-btn"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Phones: every status */}
      <PhoneSheet open={statusSheet} title="Show products" onClose={() => setStatusSheet(false)}>
        {PRODUCT_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`scm-choice${statusFilter === t.key ? ' is-on' : ''}`}
            onClick={() => { selectStatusTab(t.key); setStatusSheet(false); }}
          >
            <span className="products-choice-label">{tabWithCount(t.key)}</span>
            {statusFilter === t.key && <Check size={18} weight="bold" />}
          </button>
        ))}
      </PhoneSheet>

      {/* Phones: a product's other actions */}
      <PhoneSheet open={!!moreFor} title={moreFor?.name || 'Product'} onClose={() => setMoreFor(null)}>
        {moreFor && (moreFor.status === 'APPROVED' || moreFor.status === 'HIDDEN') && (
          <button
            type="button"
            className="scm-choice"
            disabled={bulkLoading}
            onClick={() => { const p = moreFor; setMoreFor(null); handleToggleVisibility(p); }}
          >
            {moreFor.status === 'HIDDEN'
              ? 'Show to buyers again'
              : 'Hide from buyers'}
            {moreFor.status === 'HIDDEN' ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        )}
        {moreFor?.slug && (
          <a href={`/product/${moreFor.slug}`} target="_blank" rel="noreferrer" className="scm-choice">
            See it as a buyer <ArrowSquareOut size={18} />
          </a>
        )}
        <button
          type="button"
          className="scm-choice scm-choice--danger"
          onClick={() => { const p = moreFor; setMoreFor(null); handleDelete(p); }}
        >
          {productKind(moreFor) === 'PACKAGE' ? 'Delete package' : 'Delete product'} <Trash2 size={18} />
        </button>
      </PhoneSheet>

      {/* Phones: add stock with a counter */}
      <PhoneSheet
        open={!!stockFor}
        title={stockWords(stockFor).add}
        onClose={() => setStockFor(null)}
        footer={(
          <button
            type="button"
            className="scm-btn"
            disabled={restockingId === stockFor?.id || !(stockAmount > 0)}
            onClick={async () => { if (await changeStock(stockFor, stockAmount)) setStockFor(null); }}
          >
            {restockingId === stockFor?.id
              ? 'Saving…'
              : stockWords(stockFor).unit && stockAmount > 0
                ? `Add ${stockAmount} ${stockWords(stockFor).unit(stockAmount)}`
                : `Add ${stockAmount > 0 ? stockAmount : ''} to stock`}
          </button>
        )}
      >
        {stockFor && (
          <div className="pm-stock">
            <p className="pm-stock-name">{stockFor.name}</p>
            <p className="pm-stock-now">{stockWords(stockFor).now}: <strong>{stockFor.stock}</strong></p>
            <div className="pm-stepper">
              <button
                type="button"
                aria-label="Less"
                onClick={() => setStockAmount((n) => Math.max(1, (Number(n) || 1) - 1))}
              >
                <Minus size={20} weight="bold" />
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={stockAmount}
                onChange={(e) => setStockAmount(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                aria-label="How many to add"
              />
              <button
                type="button"
                aria-label="More"
                onClick={() => setStockAmount((n) => (Number(n) || 0) + 1)}
              >
                <Plus size={20} weight="bold" />
              </button>
            </div>
            <div className="pm-quick">
              {[5, 10, 20, 50].map((n) => (
                <button key={n} type="button" className="scm-chip" onClick={() => setStockAmount(n)}>+{n}</button>
              ))}
            </div>
          </div>
        )}
      </PhoneSheet>

      {/* On the body: the page fades in (opacity), which would otherwise keep
          these sheets under the phone tab bar. */}
      {createPortal(
        <>
          <ConfirmDialog
            open={confirmState?.type === 'delete-one'}
            title={`Delete "${confirmState?.product?.name}"?`}
            message={productKind(confirmState?.product) === 'PACKAGE'
              ? 'This package will be removed from your store. The products in it stay as they are.'
              : 'This product will be permanently removed from your store and cannot be undone.'}
            confirmLabel="Delete"
            danger
            loading={bulkLoading}
            onConfirm={confirmDeleteOne}
            onCancel={() => setConfirmState(null)}
          />

          <ConfirmDialog
            open={confirmState?.type === 'bulk-delete'}
            title={`Delete ${confirmState?.ids?.length || 0} product(s)?`}
            message="These products will be permanently removed from your store and cannot be undone."
            confirmLabel="Delete All"
            danger
            loading={bulkLoading}
            onConfirm={() => runBulkAction('DELETE')}
            onCancel={() => setConfirmState(null)}
          />
        </>,
        document.body,
      )}
    </div>
  );
}
