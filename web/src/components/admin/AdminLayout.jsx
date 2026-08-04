import React, { useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutGrid, Users, Package, Flag, Tag, MapPin, BarChart2,
  ChevronDown, ChevronRight, Bell, LogOut, Shield, Store as StoreIcon,
} from 'lucide-react';
import axios from '../../lib/axios';
import useAuthStore from '../../store/authStore';
import LanguageSwitcher from '../LanguageSwitcher';
import './AdminLayout.css';

/**
 * Persistent shell for /admin/* pages — mirrors SellerLayout look & feel.
 * Content is rendered via `children` (existing admin pages don't use <Outlet />).
 */
export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [reviewsOpen, setReviewsOpen] = useState(
    location.pathname.startsWith('/admin/sellers') ||
    location.pathname.startsWith('/admin/products') ||
    location.pathname.startsWith('/admin/reports')
  );
  const [systemOpen, setSystemOpen] = useState(
    location.pathname.startsWith('/admin/users') ||
    location.pathname.startsWith('/admin/categories') ||
    location.pathname.startsWith('/admin/municipalities')
  );
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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

  const initial = (user?.fullName || user?.email || 'A').trim().charAt(0).toUpperCase();
  const shortName = user?.fullName
    ? user.fullName.length > 14 ? user.fullName.slice(0, 14) + '…' : user.fullName
    : 'Admin';
  const roleLabel = isSuperAdmin ? 'Super Admin' : 'Municipal Admin';
  const centerTitle = isSuperAdmin ? 'Super Admin' : 'Municipal Admin';

  const crumbs = buildCrumbs(location.pathname);

  return (
    <div className="ac-shell">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="ac-sidebar">
        <div className="ac-sidebar-inner">
          <Link to="/admin" className="ac-brand">
            <span className="ac-brand-mark">
              <Shield size={18} />
            </span>
            <span className="ac-brand-text">
              <strong>Emoorm</strong>
              <span>{centerTitle}</span>
            </span>
          </Link>

          <nav className="ac-nav">
            <NavLink to="/admin" end className={navCls}>
              <LayoutGrid size={17} /> <span>Dashboard</span>
            </NavLink>

            {/* Reviews group */}
            <button
              type="button"
              className={`ac-nav-item ac-nav-group ${reviewsOpen ? 'is-open' : ''}`}
              onClick={() => setReviewsOpen((v) => !v)}
              aria-expanded={reviewsOpen}
            >
              <Flag size={17} />
              <span>Approvals</span>
              <ChevronDown size={15} className="ac-nav-chevron" />
            </button>
            {reviewsOpen && (
              <div className="ac-subnav">
                <NavLink to="/admin/sellers" className={subNavCls}>
                  Seller Applications
                </NavLink>
                <NavLink to="/admin/products" className={subNavCls}>
                  Product Approvals
                </NavLink>
                <NavLink to="/admin/reports" className={subNavCls}>
                  Reports
                </NavLink>
              </div>
            )}

            {isSuperAdmin && (
              <>
                {/* System group */}
                <button
                  type="button"
                  className={`ac-nav-item ac-nav-group ${systemOpen ? 'is-open' : ''}`}
                  onClick={() => setSystemOpen((v) => !v)}
                  aria-expanded={systemOpen}
                >
                  <StoreIcon size={17} />
                  <span>System</span>
                  <ChevronDown size={15} className="ac-nav-chevron" />
                </button>
                {systemOpen && (
                  <div className="ac-subnav">
                    <NavLink to="/admin/users" className={subNavCls}>
                      All Users
                    </NavLink>
                    <NavLink to="/admin/categories" className={subNavCls}>
                      Categories
                    </NavLink>
                    <NavLink to="/admin/municipalities" className={subNavCls}>
                      Municipalities
                    </NavLink>
                  </div>
                )}

                <NavLink to="/admin/analytics" className={navCls}>
                  <BarChart2 size={17} /> <span>Analytics</span>
                </NavLink>
              </>
            )}
          </nav>

          <Link to="/profile" className="ac-user-card" title="View profile">
            {user?.profilePhoto ? (
              <img src={user.profilePhoto} alt="" className="ac-user-avatar" />
            ) : (
              <span className="ac-user-avatar ac-user-avatar--fallback">{initial}</span>
            )}
            <span className="ac-user-meta">
              <strong>{shortName}</strong>
              <span>{roleLabel}</span>
            </span>
            <ChevronRight size={14} className="ac-user-caret" />
          </Link>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────── */}
      <div className="ac-main">
        <header className="ac-topbar">
          <nav className="ac-crumbs" aria-label="Breadcrumb">
            {crumbs.map((c, i) => (
              <React.Fragment key={c.to}>
                {i > 0 && <ChevronRight size={14} className="ac-crumb-sep" />}
                {i === crumbs.length - 1 ? (
                  <span className="ac-crumb ac-crumb--current">{c.label}</span>
                ) : (
                  <Link to={c.to} className="ac-crumb">{c.label}</Link>
                )}
              </React.Fragment>
            ))}
          </nav>

          <div className="ac-topbar-actions">
            <LanguageSwitcher variant="shell" />
            <Link to="/notifications" className="ac-icon-btn" title="Notifications">
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="ac-icon-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </Link>
            <button
              type="button"
              className="ac-icon-btn"
              onClick={handleLogout}
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>

        <main className="ac-content">{children}</main>
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

function navCls({ isActive }) {
  return `ac-nav-item ${isActive ? 'ac-nav-item--active' : ''}`;
}

function subNavCls({ isActive }) {
  return `ac-subnav-link ${isActive ? 'ac-subnav-link--active' : ''}`;
}

const LABELS = {
  '/admin': 'Dashboard',
  '/admin/sellers': 'Seller Applications',
  '/admin/products': 'Product Approvals',
  '/admin/reports': 'Reports',
  '/admin/users': 'All Users',
  '/admin/categories': 'Categories',
  '/admin/municipalities': 'Municipalities',
  '/admin/analytics': 'Analytics',
};

function buildCrumbs(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/admin';
  const crumbs = [{ to: '/admin', label: 'Admin Panel' }];

  if (clean === '/admin') {
    crumbs.push({ to: '/admin', label: 'Dashboard' });
    return crumbs;
  }

  const parts = clean.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < parts.length; i++) {
    acc += '/' + parts[i];
    if (i === 0) continue;
    const label = LABELS[acc] || capitalize(parts[i]);
    crumbs.push({ to: acc, label });
  }
  return crumbs;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
}
