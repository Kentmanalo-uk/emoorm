import React, {
  useState, useEffect, useMemo, useRef,
} from 'react';
import EmptyArt from '../components/ui/EmptyArt';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Package, Plus, PencilSimple as Edit2, Trash as Trash2, Eye, ArrowSquareOut,
  MagnifyingGlass as Search, WarningCircle as AlertCircle, CheckCircle, Clock, X, CircleNotch as Loader2,
  EyeSlash as EyeOff, Archive, DotsThree, SlidersHorizontal, Check, Prohibit, CaretRight, Cube, Copy, Tag,
} from '@phosphor-icons/react';
import { usePhoneLayout } from '../hooks/useMobileNav';
import PhoneSheet from '../components/seller/PhoneSheet';
import toast from 'react-hot-toast';
import axios from '../lib/axios';
import Skeleton from '../components/ui/Skeleton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import LoadFailed from '../components/ui/LoadFailed';
import Select from '../components/ui/Select';
import { resolveImg } from '../lib/media';
import { peso } from '../lib/format';
import './SellerDashboard.css';
import './SellerStore.css';
import './SellerApp.css';
import './SellerProducts.css';
import { useCategories } from '../hooks/useReferenceData';
import SellerPageHead from '../components/seller/SellerPageHead';
import ProductForm from '../components/seller/ProductForm';
import PackageForm from '../components/seller/PackageForm';
import StockSheet from '../components/seller/products/StockSheet';
import { InlinePrice, PriceSheet } from '../components/seller/products/PriceEdit';
import RowMenu from '../components/seller/products/RowMenu';
import {
  STOCK_MODES, countOf, hasPricePerChoice, hasStockPerChoice, stockDelta, stockLevel, stockWords,
} from '../components/seller/products/stock';
import { sellBlockers } from '../lib/sellerSetup';
import { readCache, writeCache } from '../lib/pageCache';
import { isTodayProduct, isOpen as windowOpen, windowState } from '../lib/availability';
import { headsLabel, isStockless, priceUnit, productKind } from '../lib/productKinds';
import useAppSettings from '../hooks/useAppSettings';

// The badge on a row and the tab that lists it say the same words.
const STATUS_LABELS = {
  PENDING: { label: 'Waiting for approval', cls: 'status-pending', icon: <Clock size={12} /> },
  APPROVED: { label: 'Live', cls: 'status-confirmed', icon: <CheckCircle size={12} /> },
  HIDDEN: { label: 'Hidden', cls: 'status-pending', icon: <EyeOff size={12} /> },
  SUSPENDED: { label: 'Suspended', cls: 'status-cancelled', icon: <AlertCircle size={12} /> },
  ARCHIVED: { label: 'Archived', cls: 'status-cancelled', icon: <Archive size={12} /> },
};

// Filter tabs. A status key is sent as `status` to GET /products/my/products;
// "restock" (out of stock or running low) is sent as `stock=restock`.
const PRODUCT_TABS = [
  { key: 'all', label: 'All' },
  { key: 'APPROVED', label: 'Live' },
  { key: 'PENDING', label: 'Waiting for approval' },
  { key: 'HIDDEN', label: 'Hidden' },
  { key: 'restock', label: 'Needs restock' },
  { key: 'SUSPENDED', label: 'Suspended' },
  { key: 'ARCHIVED', label: 'Archived' },
];

// The order of the list: all of them the server's own sorts.
const SORTS = [
  { key: 'newest', label: 'Newest first', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'oldest', label: 'Oldest first', sortBy: 'createdAt', sortOrder: 'asc' },
  { key: 'best', label: 'Best-selling', sortBy: 'orderCount', sortOrder: 'desc' },
  { key: 'stock', label: 'Stock: lowest first', sortBy: 'stock', sortOrder: 'asc' },
  { key: 'price-low', label: 'Price: low to high', sortBy: 'price', sortOrder: 'asc' },
  { key: 'price-high', label: 'Price: high to low', sortBy: 'price', sortOrder: 'desc' },
  { key: 'name', label: 'Name: A to Z', sortBy: 'name', sortOrder: 'asc' },
];
const sortOf = (key) => SORTS.find((s) => s.key === key) || SORTS[0];

const PAGE_SIZE = 15;

// How many products each tab holds, from GET /products/my/summary.
const countFor = (summary, key) => {
  if (!summary) return null;
  if (key === 'all') return summary.total;
  if (key === 'restock') return (summary.outOfStock || 0) + (summary.lowStock || 0);
  return summary.byStatus?.[key] ?? 0;
};

// Phones show these as chips; the rest of PRODUCT_TABS sit in a sheet.
const PHONE_QUICK_TABS = ['all', 'APPROVED', 'PENDING'];

const productsWord = (n) => `${n} ${n === 1 ? 'product' : 'products'}`;

// What a bulk action did, in words: "2 products hidden from buyers".
const BULK_DONE = {
  HIDE: (n) => `${productsWord(n)} hidden from buyers`,
  UNHIDE: (n) => `${productsWord(n)} showing to buyers again`,
  DELETE: (n) => `${productsWord(n)} deleted`,
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

// Stock kept and counted (not Available Today, paluto or stock per choice):
// the quick stock change works on these.
const quickStock = (product) => !isTodayProduct(product) && !isStockless(product) && !hasStockPerChoice(product);

// Why the price can't be changed from the list, or '' when it can.
const priceLock = (product) => {
  if (hasPricePerChoice(product)) return 'Each choice has its own price. Change them in Edit.';
  if (['SUSPENDED', 'ARCHIVED'].includes(product?.status)) return 'Edit it to send it back for review.';
  return '';
};

// Categories as one list (a category may carry its sub-categories).
const flatCategories = (list) => {
  const out = [];
  const walk = (items) => (items || []).forEach((c) => {
    if (!c?.id) return;
    out.push(c);
    walk(c.children);
  });
  walk(list);
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

/**
 * Computers: the stock box on a row says what it does: Add, Remove or Set
 * to, how many, and a button with the change in words ("Add 5", "Set to 12").
 */
function RowRestock({ product, busy, onSave }) {
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const delta = String(amount).trim() === '' ? null : stockDelta(mode, amount, product.stock);
  const label = STOCK_MODES.find((m) => m.key === mode)?.label || 'Add';
  const submit = async (e) => {
    e.preventDefault();
    if (delta === null) {
      toast.error(mode === 'remove' && Number(amount) > Number(product.stock)
        ? `There ${Number(product.stock) === 1 ? 'is' : 'are'} only ${product.stock} in stock`
        : mode === 'set' ? `It is already ${product.stock}` : 'Type how many first');
      return;
    }
    if (await onSave(delta, { mode })) setAmount('');
  };
  return (
    <form className="product-restock sp-restock" onSubmit={submit} id={`sp-restock-${product.id}`}>
      <Select
        className="sp-restock-mode"
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        aria-label={`Change the stock of ${product.name}`}
        disabled={busy}
      >
        {STOCK_MODES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
      </Select>
      <input
        type="number"
        step="1"
        min="0"
        inputMode="numeric"
        className="form-input product-restock-input"
        placeholder={mode === 'set' ? String(product.stock ?? 0) : 'How many'}
        aria-label={mode === 'set' ? `How many ${product.name} there are now` : `How many ${product.name} to ${mode === 'remove' ? 'remove' : 'add'}`}
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
        disabled={busy}
      />
      <button type="submit" className="btn-seller-outline product-restock-btn" disabled={busy || String(amount).trim() === ''}>
        {busy ? <Loader2 size={13} className="spin" /> : `${label}${String(amount).trim() !== '' ? ` ${amount}` : ''}`}
      </button>
    </form>
  );
}

export default function SellerProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { categories } = useCategories();
  const categoryList = useMemo(() => flatCategories(categories), [categories]);
  // Until the shop is ready to sell, buyers can see its products but cannot order them.
  const outlet = useOutletContext();
  const blockers = sellBlockers(outlet?.setup);
  const notReady = blockers.length > 0;
  const shopPrivate = outlet?.store?.isApproved === false;
  const statusOf = (product) => STATUS_LABELS[product.status] || STATUS_LABELS.PENDING;
  const tabLabel = (key) => PRODUCT_TABS.find((t) => t.key === key)?.label;
  // Seeded from ?search= so a top-bar search result opens filtered.
  const [search, setSearch] = useState(searchParams.get('search') || '');
  // ?status=<tab>; ?stock=low and ?restock=<id> (the dashboard's "Running
  // low") open on Needs restock.
  const [statusFilter, setStatusFilter] = useState(() => {
    const fromUrl = searchParams.get('status');
    if (PRODUCT_TABS.some((t) => t.key === fromUrl)) return fromUrl;
    if (['low', 'restock', 'out'].includes(searchParams.get('stock')) || searchParams.get('restock')) return 'restock';
    return 'all';
  });
  const [sort, setSort] = useState(() => sortOf(searchParams.get('sort')).key);
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('category') || '');
  // Each tab's first page as it showed last time: shown at once while it is
  // asked for again. Editing waits for the fresh list (productsFresh).
  const plainView = !search && sort === 'newest' && !categoryFilter;
  const [saved] = useState(() => (plainView ? readCache(`seller:products:${statusFilter}`) : undefined));
  const [products, setProducts] = useState(() => saved?.products || []);
  const [productsFresh, setProductsFresh] = useState(false);
  const [isLoading, setIsLoading] = useState(() => !saved);
  // The list could not be loaded (and nothing saved stands in for it).
  const [loadError, setLoadError] = useState(false);
  const [pagination, setPagination] = useState(() => ({ total: 0, page: 1, totalPages: 1, ...(saved?.pagination || {}) }));
  // Counts for the tabs and the phone's "needs attention" rows.
  const [summary, setSummary] = useState(() => readCache('seller:products:summary') || null);
  // The row whose stock or price is saving.
  const [restockingId, setRestockingId] = useState(null);
  const [pricingId, setPricingId] = useState(null);

  // The form is a page of its own: /seller/products/new adds a product and
  // ?edit=<id> edits one, so the phone's back button closes it.
  // /seller/products/new?copy=<id> starts a new product from another (Duplicate).
  const isNewRoute = /\/seller\/products\/new\/?$/.test(location.pathname) || searchParams.get('action') === 'new';
  const editParam = searchParams.get('edit');
  const copyParam = isNewRoute ? searchParams.get('copy') : null;
  const [editingProduct, setEditingProduct] = useState(null);
  // A duplicate's source asked for on its own: { id, product }.
  const [fetchedCopy, setFetchedCopy] = useState(null);
  const showForm = isNewRoute || (!!editParam && !!editingProduct);
  // Packages have their own form: /seller/products/new?type=package, or
  // editing one.
  const packageForm = isNewRoute
    ? searchParams.get('type') === 'package'
    : productKind(editingProduct) === 'PACKAGE';

  // Phones: status sheet, a product's "more" sheet, its stock and price sheets.
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
  const [priceFor, setPriceFor] = useState(null);

  // Bulk selection + confirm dialogs
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmState, setConfirmState] = useState(null); // { type: 'delete-one'|'bulk-delete', product?, ids? }

  useEffect(() => {
    loadProducts();
  }, [pagination.page, search, statusFilter, sort, categoryFilter]);

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

  // Duplicate: the product to copy, from the list, or (a reload of the copy
  // page) asked for on its own.
  const copyInList = copyParam ? products.find((p) => p.id === copyParam) || null : null;
  const copyListed = Boolean(copyInList);
  useEffect(() => {
    if (!copyParam || copyListed) return undefined;
    let live = true;
    axios.get(`/products/${copyParam}`)
      .then((res) => { if (live) setFetchedCopy({ id: copyParam, product: res.data?.id ? res.data : null }); })
      .catch(() => {
        if (!live) return;
        toast.error("Couldn't open the product to copy. Starting a blank one.");
        setFetchedCopy({ id: copyParam, product: null });
      });
    return () => { live = false; };
  }, [copyParam, copyListed]);
  // undefined while it is looked up; null when there is none to copy.
  const copySource = !copyParam ? null
    : copyInList || (fetchedCopy?.id === copyParam ? fetchedCopy.product : undefined);

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
    const viewKey = pagination.page === 1 && plainView ? `seller:products:${statusFilter}` : null;
    const kept = viewKey ? readCache(viewKey) : undefined;
    if (kept) {
      setProducts(kept.products || []);
      if (kept.pagination) setPagination((p) => ({ ...p, ...kept.pagination }));
    } else {
      setIsLoading(true);
    }
    const order = sortOf(sort);
    try {
      const res = await axios.get('/products/my/products', {
        params: {
          page: pagination.page,
          pageSize: PAGE_SIZE,
          search: search || undefined,
          status: statusFilter !== 'all' && statusFilter !== 'restock' ? statusFilter : undefined,
          stock: statusFilter === 'restock' ? 'restock' : undefined,
          sortBy: order.sortBy,
          sortOrder: order.sortOrder,
          categoryId: categoryFilter || undefined,
        },
      });
      setProducts(res.data || []);
      setProductsFresh(true);
      setLoadError(false);
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
      // With a saved list on screen a note is enough; with nothing, the
      // page says it couldn't load (not "no products").
      if (kept) toast.error(err.message || 'Could not refresh your products');
      else setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  // The server filters by category and sorts (stock too).
  const shown = products;

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

  const chooseSort = (key) => {
    setSort(key);
    setSelectedIds([]);
    setPagination((p) => ({ ...p, page: 1 }));
  };
  const chooseCategory = (id) => {
    setCategoryFilter(id);
    setSelectedIds([]);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  // section: 'model3d' opens the form at its 3D view.
  const openEdit = (product, section = null) => {
    setEditingProduct(product);
    navigate(`/seller/products?edit=${product.id}${section ? `&section=${section}` : ''}`, { state: { fromList: true } });
  };

  // POST /products/:id/stock { delta } — the response is the updated product,
  // so the row is replaced in place instead of reloading the whole page.
  const changeStock = async (product, delta, { mode = 'add' } = {}) => {
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error('Type how many first');
      return false;
    }
    setRestockingId(product.id);
    try {
      const res = await axios.post(`/products/${product.id}/stock`, { delta });
      const updated = res.data || {};
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...updated } : p)));
      setStockFor((open) => (open?.id === product.id ? null : open));
      loadSummary();
      const after = Number(updated.stock ?? (Number(product.stock) || 0) + delta);
      const n = Math.abs(delta);
      toast.success(mode === 'set'
        ? `${product.name}: stock set to ${after}`
        : `${delta > 0 ? 'Added' : 'Removed'} ${countOf(product, n)}. ${after} now.`);
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to update stock');
      return false;
    } finally {
      setRestockingId(null);
    }
  };

  // The stock sheet for products whose stock is counted; the others open
  // where their stock is set (Available today, the product's form).
  const openStockSheet = (product) => {
    if (isTodayProduct(product)) { navigate('/seller/today'); return; }
    if (!quickStock(product) && productKind(product) !== 'PACKAGE') { openEdit(product); return; }
    setStockFor(product);
  };

  // ?restock=<id> (the dashboard's "Running low"): that product's stock sheet.
  const restockParam = searchParams.get('restock');
  const handledRestock = useRef(null);
  useEffect(() => {
    if (!restockParam || !productsFresh || handledRestock.current === restockParam) return;
    handledRestock.current = restockParam;
    const clearParam = () => setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('restock');
      return next;
    }, { replace: true });
    const found = products.find((p) => p.id === restockParam);
    const pick = found
      ? Promise.resolve(found)
      : axios.get(`/products/${restockParam}`).then((res) => (res.data?.id ? res.data : null));
    pick
      .then((product) => {
        if (!product) return;
        // As openStockSheet: Available today and per-choice stock open where they are set.
        if (isTodayProduct(product)) navigate('/seller/today');
        else if (!quickStock(product) && productKind(product) !== 'PACKAGE') navigate(`/seller/products?edit=${product.id}`);
        else setStockFor(product);
      })
      .catch(() => toast.error("Couldn't open that product. It may have been deleted."))
      .finally(clearParam);
  }, [restockParam, productsFresh, products, navigate, setSearchParams]);

  // PUT /products/:id { price }: the one price, saved on its own.
  const changePrice = async (product, price) => {
    setPricingId(product.id);
    try {
      const res = await axios.put(`/products/${product.id}`, { price });
      const next = res.data?.price ?? price;
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, price: next, salePrice: res.data?.salePrice ?? p.salePrice } : p)));
      setPriceFor(null);
      toast.success(`${product.name}: now ${peso(next)}`);
      return true;
    } catch (err) {
      toast.error(err.message || 'Could not change the price');
      return false;
    } finally {
      setPricingId(null);
    }
  };

  const openNew = () => navigate('/seller/products/new', { state: { fromList: true } });
  const openNewPackage = () => navigate('/seller/products/new?type=package', { state: { fromList: true } });
  // Duplicate: a new draft filled in from this product (packages in theirs).
  const openCopy = (product) => {
    const pkg = productKind(product) === 'PACKAGE' ? 'type=package&' : '';
    navigate(`/seller/products/new?${pkg}copy=${product.id}`, { state: { fromList: true } });
  };

  // 3D views: goods kept in stock, while the super admin has them on.
  const { settings: appSettings } = useAppSettings();
  const takes3d = (product) => appSettings?.product3dEnabled === true && productKind(product) === 'REGULAR';
  // A part of a product saved on its own (the 3D view), kept in the list.
  const patchProduct = (id, fields) => {
    setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...fields } : p)));
  };

  const closeForm = () => {
    // On phones the package form adds a history entry per step (?step=3).
    const steps = Math.max(1, parseInt(searchParams.get('step') || '1', 10) || 1);
    if (location.state?.fromList) navigate(-steps);
    else navigate('/seller/products', { replace: true });
  };

  // next: Local Delicacies' new Cooked food, after "Saved to your list":
  // 'post' (Post it now) or 'done'.
  const handleSaved = (saved, { created, next = null }) => {
    if (created && isTodayProduct(saved) && next) {
      navigate(next === 'post' ? `/seller/today/new?product=${saved.id}` : '/seller/today', { replace: true });
      return;
    }
    if (created && isTodayProduct(saved)) {
      toast.success('Product added. Post it in Available today when you have it.');
      closeForm();
      navigate('/seller/today');
      return;
    }
    const what = productKind(saved) === 'PACKAGE' ? 'Package' : 'Product';
    if (created) {
      toast.success(shopPrivate
        ? `${what} added. Buyers see it once the admin approves your shop.`
        : notReady && saved?.status === 'APPROVED'
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
    if (shown.length > 0 && selectedIds.length === shown.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(shown.map((p) => p.id));
    }
  };

  const runBulkAction = async (action, ids = selectedIds) => {
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await axios.patch('/products/bulk', { ids, action });
      const n = res.data?.updatedCount ?? ids.length;
      toast.success(BULK_DONE[action]?.(n) || res.message || `${productsWord(n)} updated`);
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setConfirmState(null);
      loadProducts();
    } catch (err) {
      toast.error(err.message || 'That did not work. Please try again.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleToggleVisibility = async (product) => {
    setBulkLoading(true);
    try {
      const action = product.status === 'HIDDEN' ? 'UNHIDE' : 'HIDE';
      await axios.patch('/products/bulk', { ids: [product.id], action });
      toast.success(action === 'HIDE' ? `${product.name} is hidden from buyers` : `${product.name} is live again`);
      setConfirmState(null);
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
    if (copyParam && copySource === undefined) return <FormLoading />;
    const copying = isNewRoute && copySource ? copySource : null;
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SellerPageHead
            className="pkf-head"
            title={isNewRoute ? (copying ? 'Copy a package' : 'Create a package') : 'Edit package'}
            subtitle="Sell some of your products together at one price."
          />
          <PackageForm
            key={isNewRoute ? `new-package-${copying?.id || ''}` : editingProduct?.id}
            product={isNewRoute ? null : editingProduct}
            copyFrom={copying}
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
    if (copyParam && copySource === undefined) return <FormLoading />;
    const copying = isNewRoute && copySource ? copySource : null;
    return (
      <div className="seller-dashboard">
        <div className="seller-container">
          <SellerPageHead
            className="pf-head"
            title={editingProduct && !isNewRoute ? 'Edit product' : copying ? 'Copy a product' : 'Add a product'}
            subtitle={copying
              ? `Filled in from ${copying.name}. Change what is different, then save it as a new product.`
              : 'Fill in the boxes below, top to bottom. Parts marked * are needed.'}
          />
          <ProductForm
            key={isNewRoute ? `new-${copying?.id || ''}` : editingProduct?.id}
            product={isNewRoute ? null : editingProduct}
            copyFrom={copying}
            categories={categories}
            recentProducts={products}
            onCancel={closeForm}
            onSaved={handleSaved}
            sellBlockers={blockers}
            onPatched={patchProduct}
          />
        </div>
      </div>
    );
  }

  const searchForm = (
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
  );

  const sortSelect = (
    <Select value={sort} onChange={(e) => chooseSort(e.target.value)} aria-label="Sort products" className="sp-sort">
      {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </Select>
  );
  const categorySelect = (
    <Select value={categoryFilter} onChange={(e) => chooseCategory(e.target.value)} aria-label="Category" className="sp-sort">
      <option value="">All categories</option>
      {categoryList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  );

  const searchBar = isPhone ? (
    <div className="products-toolbar">{searchForm}</div>
  ) : (
    <div className="seller-card products-toolbar sp-toolbar">
      {searchForm}
      <div className="sp-toolbar-filters">
        <label className="sp-filter">
          <span>Sort</span>
          {sortSelect}
        </label>
        <label className="sp-filter">
          <span>Category</span>
          {categorySelect}
        </label>
      </div>
    </div>
  );

  // Delete asks first, and offers to hide instead when that is what the
  // seller wants (it can be shown again).
  const hideInstead = (ids) => {
    const live = products.filter((p) => ids.includes(p.id) && p.status === 'APPROVED');
    if (!live.length) return null;
    const one = live.length === 1;
    return (
      <p className="sp-hide-instead">
        Only want {ids.length === 1 ? 'it' : 'them'} off your shop for a while?{' '}
        <button
          type="button"
          className="sp-link"
          disabled={bulkLoading}
          onClick={() => (ids.length === 1 && one
            ? handleToggleVisibility(live[0])
            : runBulkAction('HIDE', live.map((p) => p.id)))}
        >
          {one && ids.length === 1 ? 'Hide it instead' : `Hide ${live.length === ids.length ? 'them' : `the ${live.length} live ones`} instead`}
        </button>
        {' '}Buyers won&apos;t see {one ? 'it' : 'them'}, and you can show {one ? 'it' : 'them'} again any time.
      </p>
    );
  };

  const deleteIds = confirmState?.type === 'bulk-delete' ? confirmState.ids || [] : [];

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
            <span className="products-bulk-count">{productsWord(selectedIds.length)} selected</span>
            <div className="products-bulk-actions">
              <button className="btn-seller-outline" disabled={bulkLoading} onClick={() => runBulkAction('HIDE')}>
                <EyeOff size={14} /> Hide
              </button>
              <button className="btn-seller-outline" disabled={bulkLoading || notReady} title={notReady ? 'Finish your shop setup first' : undefined} onClick={() => runBulkAction('UNHIDE')}>
                <Eye size={14} /> Show again
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
                {shopPrivate
                  ? 'Buyers see your live products once the admin approves your shop, and can order them once your shop is ready to sell. Still to do: '
                  : 'Your live products are on show. Buyers can order them once your shop is ready to sell. Still to do: '}
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
              aria-label={PHONE_QUICK_TABS.includes(statusFilter) ? 'More filters and sort' : undefined}
              title="More filters and sort"
            >
              <SlidersHorizontal size={17} weight="bold" />
              {(sort !== 'newest' || categoryFilter) && PHONE_QUICK_TABS.includes(statusFilter) && <span className="scm-chip-dot" />}
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
        <div className="seller-card sp-list-card">
          {isLoading ? (
            <Skeleton.Table cols={6} rows={6} />
          ) : loadError && products.length === 0 ? (
            <LoadFailed what="your products" onRetry={loadProducts} compact />
          ) : shown.length === 0 ? (
            statusFilter === 'all' && !search && !categoryFilter ? (
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
                <EmptyArt name={statusFilter === 'restock' && !search && !categoryFilter ? 'healthy' : 'search'} size={88} />
                <p>
                  {statusFilter === 'restock' && !search && !categoryFilter
                    ? 'All good: every product has enough stock.'
                    : 'No products match this filter.'}
                </p>
                {categoryFilter && (
                  <button type="button" className="btn-seller-outline" onClick={() => chooseCategory('')}>
                    Show all categories
                  </button>
                )}
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
                        checked={shown.length > 0 && selectedIds.length === shown.length}
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
                  {shown.map(product => {
                    const s = statusOf(product);
                    const thumb = product.images?.[0];
                    const level = stockLevel(product);
                    const kind = productKind(product);
                    const words = stockWords(product);
                    const showNote = Boolean(product.moderationNote)
                      && (product.status === 'SUSPENDED' || product.status === 'ARCHIVED');
                    const rowBusy = restockingId === product.id;
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
                          {isPhone ? (
                            <>
                              {peso(product.price)}
                              {priceUnit(product) && <span className="product-price-unit">{priceUnit(product)}</span>}
                            </>
                          ) : (
                            <InlinePrice
                              product={product}
                              unit={priceUnit(product)}
                              busy={pricingId === product.id}
                              disabledReason={priceLock(product)}
                              onSave={(price) => changePrice(product, price)}
                            />
                          )}
                        </td>
                        <td data-label="Stock">
                          {isTodayProduct(product) ? (
                            <div className="product-stock product-stock--today">
                              <span className="product-stock-line">
                                <span className="seller-badge product-today-badge">Available today</span>
                                <span className="product-stock-label">
                                  {windowOpen(product.availability)
                                    ? `${product.stock} left`
                                    : windowState(product.availability).tone === 'soon' ? windowState(product.availability).text : 'Not posted now'}
                                </span>
                              </span>
                              {!isPhone && (
                                <Link to="/seller/today" className="btn-seller-outline product-restock-btn">Post or change</Link>
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
                                Edit stock per choice
                              </button>
                            ) : (
                              <RowRestock
                                product={product}
                                busy={rowBusy}
                                onSave={(delta, meta) => changeStock(product, delta, meta)}
                              />
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
                              type="button"
                              className="seller-icon-btn product-action"
                              title={`Edit ${product.name}`}
                              onClick={() => openEdit(product)}
                            >
                              <Edit2 size={15} aria-hidden="true" /><span>Edit</span>
                            </button>
                            {(product.status === 'APPROVED' || product.status === 'HIDDEN') && (
                              <button
                                type="button"
                                className="seller-icon-btn product-action"
                                title={product.status === 'HIDDEN'
                                  ? 'Show to buyers again'
                                  : 'Hide from buyers (you can show it again)'}
                                onClick={() => handleToggleVisibility(product)}
                                disabled={bulkLoading}
                              >
                                {product.status === 'HIDDEN' ? <Eye size={15} aria-hidden="true" /> : <EyeOff size={15} aria-hidden="true" />}
                                <span>{product.status === 'HIDDEN' ? 'Show' : 'Hide'}</span>
                              </button>
                            )}
                            <a
                              href={`/product/${product.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="seller-icon-btn product-action"
                              title="See it as a buyer (opens a new tab)"
                            >
                              <ArrowSquareOut size={15} aria-hidden="true" /><span>View</span>
                            </a>
                            <RowMenu
                              label={`More for ${product.name}`}
                              items={[
                                takes3d(product) && {
                                  label: product.model3d ? 'Change 3D view' : 'Add a 3D view',
                                  icon: Cube,
                                  onClick: () => openEdit(product, 'model3d'),
                                },
                                { label: 'Duplicate', icon: Copy, onClick: () => openCopy(product) },
                                {
                                  label: kind === 'PACKAGE' ? 'Delete package' : 'Delete product',
                                  icon: Trash2,
                                  danger: true,
                                  onClick: () => handleDelete(product),
                                },
                              ].filter(Boolean)}
                            />
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

              {/* Pagination (not while every product is loaded at once) */}
              {pagination.totalPages > 1 && (
                <div className="products-pagination">
                  <button
                    disabled={pagination.page <= 1}
                    onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                    className="btn-seller-outline pagination-btn"
                  >
                    Prev
                  </button>
                  <span>Page {pagination.page} of {pagination.totalPages}</span>
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

      {/* Phones: every status, the order and the category */}
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
        <span className="scm-sheet-label">Sort</span>
        <label className="scm-field">{sortSelect}</label>
        <span className="scm-sheet-label">Category</span>
        <label className="scm-field">{categorySelect}</label>
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
        {moreFor && !priceLock(moreFor) && (
          <button
            type="button"
            className="scm-choice"
            onClick={() => { const p = moreFor; setMoreFor(null); setPriceFor(p); }}
          >
            Change price <Tag size={18} />
          </button>
        )}
        {moreFor && takes3d(moreFor) && (
          <button
            type="button"
            className="scm-choice"
            onClick={() => { const p = moreFor; setMoreFor(null); openEdit(p, 'model3d'); }}
          >
            {moreFor.model3d ? 'Change 3D view' : 'Add a 3D view'} <Cube size={18} />
          </button>
        )}
        {moreFor && (
          <button
            type="button"
            className="scm-choice"
            onClick={() => { const p = moreFor; setMoreFor(null); openCopy(p); }}
          >
            Duplicate <Copy size={18} />
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

      {/* Stock: add, remove or set the count (phones' rows; ?restock=<id>) */}
      <StockSheet
        key={stockFor?.id || 'none'}
        product={stockFor}
        busy={restockingId === stockFor?.id}
        onClose={() => setStockFor(null)}
        onSave={(delta, meta) => changeStock(stockFor, delta, meta)}
      />

      {/* Phones: change the price */}
      <PriceSheet
        key={priceFor?.id || 'none'}
        product={priceFor}
        busy={pricingId === priceFor?.id}
        onClose={() => setPriceFor(null)}
        onSave={(price) => changePrice(priceFor, price)}
      />

      {/* On the body: the page fades in (opacity), which would otherwise keep
          these sheets under the phone tab bar. */}
      {createPortal(
        <>
          <ConfirmDialog
            open={confirmState?.type === 'delete-one'}
            title={`Delete "${confirmState?.product?.name}"?`}
            message={productKind(confirmState?.product) === 'PACKAGE'
              ? 'This package is removed from your shop. The products in it stay as they are. This can\'t be undone.'
              : 'This product is removed from your shop for good. Orders already placed keep their record. This can\'t be undone.'}
            confirmLabel="Delete"
            danger
            loading={bulkLoading}
            onConfirm={confirmDeleteOne}
            onCancel={() => setConfirmState(null)}
          >
            {confirmState?.type === 'delete-one' && hideInstead([confirmState.product.id])}
          </ConfirmDialog>

          <ConfirmDialog
            open={confirmState?.type === 'bulk-delete'}
            title={`Delete ${productsWord(deleteIds.length)}?`}
            message={`${deleteIds.length === 1 ? 'It is' : 'They are'} removed from your shop for good. Orders already placed keep their record. This can't be undone.`}
            confirmLabel={deleteIds.length === 1 ? 'Delete' : `Delete all ${deleteIds.length}`}
            danger
            loading={bulkLoading}
            onConfirm={() => runBulkAction('DELETE', deleteIds)}
            onCancel={() => setConfirmState(null)}
          >
            {confirmState?.type === 'bulk-delete' && hideInstead(deleteIds)}
          </ConfirmDialog>
        </>,
        document.body,
      )}
    </div>
  );
}

/** While the product a duplicate starts from is looked up. */
function FormLoading() {
  return (
    <div className="seller-dashboard">
      <div className="seller-container" aria-busy="true">
        <Skeleton height={28} width="40%" radius={6} />
        <Skeleton height={320} radius={16} />
      </div>
    </div>
  );
}
