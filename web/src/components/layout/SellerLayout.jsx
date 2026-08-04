import React, { useState, useEffect } from 'react';
import { NavLink, Link, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, ShoppingBag, MessageSquare, Package, Star, BarChart2,
  Wallet, Store as StoreIcon, ChevronDown, ChevronRight, Bell, LogOut,
} from 'lucide-react';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import LanguageSwitcher from '../LanguageSwitcher';
import './SellerLayout.css';

/**
 * Persistent shell for /seller/* routes.
 * Guards SELLER role, renders sidebar + topbar + <Outlet />.
 */
export default function SellerLayout() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();

  const [store, setStore] = useState(null);
  const [productsOpen, setProductsOpen] = useState(
    location.pathname.startsWith('/seller/products')
  );
  const [shopOpen, setShopOpen] = useState(
    location.pathname.startsWith('/seller/store') || location.pathname === '/seller/shop-profile'
  );
  const [unreadCount, setUnreadCount] = useState(0);

  if (!isAuthenticated) return <Navigate to="/login?redirect=/seller" replace />;
  if (user?.role !== 'SELLER' && user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/sell" replace />;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/stores/my/store');
        if (!cancelled) setStore(res.data);
      } catch {
        /* no store yet */
      }
      try {
        const n = await axios.get('/notifications/unread/count');
        if (!cancelled) setUnreadCount(n.data?.count ?? 0);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initial = (user?.fullName || user?.email || 'S').trim().charAt(0).toUpperCase();
  const shortName = user?.fullName
    ? user.fullName.length > 12 ? user.fullName.slice(0, 12) + '…' : user.fullName
    : 'Seller';
  const shortEmail = user?.email
    ? user.email.length > 18 ? user.email.slice(0, 18) + '…' : user.email
    : '';

  const crumbs = buildCrumbs(location.pathname);

  return (
    <div className="sc-shell">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="sc-sidebar">
        <div className="sc-sidebar-inner">
          <Link to="/seller" className="sc-brand">
            <span className="sc-brand-mark">
              <StoreIcon size={18} />
            </span>
            <span className="sc-brand-text">
              <strong>Emoorm</strong>
              <span>Seller Center</span>
            </span>
          </Link>

          <nav className="sc-nav">
            <NavLink to="/seller" end className={navCls}>
              <LayoutGrid size={17} /> <span>Dashboard</span>
            </NavLink>
            <NavLink to="/seller/orders" className={navCls}>
              <ShoppingBag size={17} /> <span>My Orders</span>
            </NavLink>
            <NavLink to="/seller/messages" className={navCls}>
              <MessageSquare size={17} /> <span>Messages</span>
            </NavLink>

            {/* Products group */}
            <button
              type="button"
              className={`sc-nav-item sc-nav-group ${productsOpen ? 'is-open' : ''}`}
              onClick={() => setProductsOpen((v) => !v)}
              aria-expanded={productsOpen}
            >
              <Package size={17} />
              <span>Products</span>
              <ChevronDown size={15} className="sc-nav-chevron" />
            </button>
            {productsOpen && (
              <div className="sc-subnav">
                <NavLink to="/seller/products" end className={subNavCls}>
                  All Products
                </NavLink>
                <NavLink to="/seller/products/new" className={subNavCls}>
                  Add New
                </NavLink>
              </div>
            )}

            <NavLink to="/seller/reviews" className={navCls}>
              <Star size={17} /> <span>Reviews</span>
            </NavLink>
            <NavLink to="/seller/analytics" className={navCls}>
              <BarChart2 size={17} /> <span>Analytics</span>
            </NavLink>
            <NavLink to="/seller/finance" className={navCls}>
              <Wallet size={17} /> <span>Finance</span>
            </NavLink>

            {/* Shop group */}
            <button
              type="button"
              className={`sc-nav-item sc-nav-group ${shopOpen ? 'is-open' : ''}`}
              onClick={() => setShopOpen((v) => !v)}
              aria-expanded={shopOpen}
            >
              <StoreIcon size={17} />
              <span>My Shop</span>
              <ChevronDown size={15} className="sc-nav-chevron" />
            </button>
            {shopOpen && (
              <div className="sc-subnav">
                <NavLink to="/seller/store" className={subNavCls}>
                  Shop Profile
                </NavLink>
                {store?.slug && (
                  <a
                    href={`/store/${store.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sc-subnav-link"
                  >
                    View Storefront
                  </a>
                )}
              </div>
            )}
          </nav>

          <Link to="/profile" className="sc-user-card" title="View profile">
            {user?.profilePhoto ? (
              <img src={user.profilePhoto} alt="" className="sc-user-avatar" />
            ) : (
              <span className="sc-user-avatar sc-user-avatar--fallback">{initial}</span>
            )}
            <span className="sc-user-meta">
              <strong>{shortName}</strong>
              <span>{shortEmail}</span>
            </span>
            <ChevronRight size={14} className="sc-user-caret" />
          </Link>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────── */}
      <div className="sc-main">
        <header className="sc-topbar">
          <nav className="sc-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <React.Fragment key={c.to}>
                {i > 0 && <ChevronRight size={14} className="sc-crumb-sep" />}
                {i === crumbs.length - 1 ? (
                  <span className="sc-crumb sc-crumb--current">{c.label}</span>
                ) : (
                  <Link to={c.to} className="sc-crumb">{c.label}</Link>
                )}
              </React.Fragment>
            ))}
          </nav>

          <div className="sc-topbar-actions">
            <LanguageSwitcher variant="shell" />
            <Link to="/notifications" className="sc-icon-btn" title="Notifications">
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="sc-icon-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <button
              type="button"
              className="sc-icon-btn"
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="sc-content">
          <Outlet context={{ store, setStore }} />
        </main>
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

function navCls({ isActive }) {
  return `sc-nav-item ${isActive ? 'sc-nav-item--active' : ''}`;
}

function subNavCls({ isActive }) {
  return `sc-subnav-link ${isActive ? 'sc-subnav-link--active' : ''}`;
}

const LABELS = {
  '/seller': 'Dashboard',
  '/seller/orders': 'My Orders',
  '/seller/messages': 'Messages',
  '/seller/products': 'Products',
  '/seller/products/new': 'New Product',
  '/seller/reviews': 'Reviews',
  '/seller/analytics': 'Analytics',
  '/seller/finance': 'Finance',
  '/seller/store': 'Shop Profile',
};

function buildCrumbs(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/seller';
  const crumbs = [{ to: '/seller', label: 'Seller Center' }];

  if (clean === '/seller') {
    crumbs.push({ to: '/seller', label: 'Dashboard' });
    return crumbs;
  }

  // Handle nested paths: /seller/products/new
  const parts = clean.split('/').filter(Boolean); // ['seller', 'products', 'new']
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += '/' + parts[i];
    if (i === 0) continue; // skip 'seller' root
    const label = LABELS[acc] || capitalize(parts[i]);
    crumbs.push({ to: acc, label });
  }
  return crumbs;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}
