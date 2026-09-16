import React, { useEffect, useState } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour as LayoutGrid, Users, Package, Flag, Tag, MapPin, ChartPie as PieChart,
  CaretDown as ChevronDown, CaretRight as ChevronRight, CaretLeft as ChevronLeft, Bell, SignOut as LogOut, Storefront as StoreIcon,
  Megaphone, FileText, Gear as SettingsIcon, Image as ImageIcon, Ticket,
} from '@phosphor-icons/react';
import axios from '../../lib/axios';
import { resolveImg } from '../../lib/media';
import useAuthStore from '../../store/authStore';
import useSidebarCollapse from '../../hooks/useSidebarCollapse';
import LanguageSwitcher from '../LanguageSwitcher';
import AppLogo from '../AppLogo';
import './AdminLayout.css';

/**
 * Persistent shell for /admin/* pages — mirrors SellerLayout look & feel.
 * Content is rendered via `children` (existing admin pages don't use <Outlet />).
 */
export default function AdminLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuthStore();

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [collapsed, toggleCollapsed] = useSidebarCollapse();
  const [reviewsOpen, setReviewsOpen] = useState(
    location.pathname.startsWith('/admin/sellers') ||
    location.pathname.startsWith('/admin/all-sellers') ||
    location.pathname.startsWith('/admin/buyers') ||
    location.pathname.startsWith('/admin/products') ||
    location.pathname.startsWith('/admin/orders') ||
    location.pathname.startsWith('/admin/reports')
  );
  const [systemOpen, setSystemOpen] = useState(
    location.pathname.startsWith('/admin/users') ||
    location.pathname.startsWith('/admin/categories') ||
    location.pathname.startsWith('/admin/municipalities')
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [municipalityName, setMunicipalityName] = useState(user?.municipality?.name || '');
  const [municipalityLogo, setMunicipalityLogo] = useState(user?.municipality?.logo || '');

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

  useEffect(() => {
    if (isSuperAdmin || !user?.id) return;
    let cancelled = false;
    axios.get('/auth/profile')
      .then((response) => {
        const profile = response.data;
        if (cancelled || !profile) return;
        updateUser(profile);
        setMunicipalityName(profile.municipality?.name || '');
        setMunicipalityLogo(profile.municipality?.logo || '');
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [isSuperAdmin, updateUser, user?.id]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initial = (user?.fullName || user?.email || 'A').trim().charAt(0).toUpperCase();
  const shortName = user?.fullName
    ? user.fullName.length > 14 ? user.fullName.slice(0, 14) + '…' : user.fullName
    : 'Admin';
  const roleLabel = isSuperAdmin ? 'Super Admin' : 'Municipal Admin';
  const assignedMunicipalityName = municipalityName || user?.municipality?.name || '';
  const centerTitle = isSuperAdmin
    ? 'Super Admin'
    : assignedMunicipalityName ? `${assignedMunicipalityName} Admin` : 'Admin';

  const crumbs = buildCrumbs(location.pathname);

  return (
    <div className={`ac-shell ${collapsed ? 'is-collapsed' : ''}`}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="ac-sidebar">
        <div className="ac-sidebar-inner">
          <div className="ac-brand-row">
            <Link to="/admin" className="ac-brand">
              {!isSuperAdmin ? (
                <span className="ac-brand-logo-stack">
                  <AppLogo className="ac-brand-logo ac-brand-logo-base" />
                  {municipalityLogo ? (
                    <img src={resolveImg(municipalityLogo)} alt={assignedMunicipalityName} className="ac-brand-logo ac-brand-logo-badge" />
                  ) : (
                    <span className="ac-brand-logo-badge ac-brand-logo-placeholder" aria-label={`${assignedMunicipalityName} logo`}>
                      {assignedMunicipalityName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
              ) : (
                <AppLogo className="ac-brand-logo" />
              )}
              <span className="ac-brand-text">
                <strong>Emoorm</strong>
                <span>{centerTitle}</span>
              </span>
            </Link>
            <button
              type="button"
              className="ac-collapse-btn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>

          <nav className="ac-nav">
            <NavLink to="/admin" end className={navCls} title="Dashboard">
              <LayoutGrid size={17} weight="fill" /> <span>Dashboard</span>
            </NavLink>

            {isSuperAdmin ? (
              <>
                <button
                  type="button"
                  className={`ac-nav-item ac-nav-group ${reviewsOpen && !collapsed ? 'is-open' : ''}`}
                  onClick={() => collapsed ? navigate('/admin/sellers') : setReviewsOpen((v) => !v)}
                  aria-expanded={reviewsOpen && !collapsed}
                  title="Marketplace"
                >
                  <Flag size={17} weight="fill" />
                  <span>Marketplace</span>
                  <ChevronDown size={15} className="ac-nav-chevron" />
                </button>
                {reviewsOpen && (
                  <div className="ac-subnav">
                    <NavLink to="/admin/sellers" className={subNavCls}>Seller Applications</NavLink>
                    <NavLink to="/admin/all-sellers" className={subNavCls}>All Sellers</NavLink>
                    <NavLink to="/admin/buyers" className={subNavCls}>All Buyers</NavLink>
                    <NavLink to="/admin/products" className={subNavCls}>Products</NavLink>
                    <NavLink to="/admin/orders" className={subNavCls}>Orders / Activity</NavLink>
                    <NavLink to="/admin/reports" className={subNavCls}>Reports / Issues</NavLink>
                  </div>
                )}
              </>
            ) : (
              <>
                <NavLink to="/admin/sellers" className={navCls} title="Seller Applications">
                  <Flag size={17} weight="fill" /> <span>Seller Applications</span>
                </NavLink>
                <NavLink to="/admin/all-sellers" className={navCls} title="Sellers">
                  <StoreIcon size={17} weight="fill" /> <span>Sellers</span>
                </NavLink>
                <NavLink to="/admin/buyers" className={navCls} title="Buyers">
                  <Users size={17} weight="fill" /> <span>Buyers</span>
                </NavLink>
                <NavLink to="/admin/products" className={navCls} title="Products">
                  <Package size={17} weight="fill" /> <span>Products</span>
                </NavLink>
                <NavLink to="/admin/orders" className={navCls} title="Orders / Activity">
                  <FileText size={17} weight="fill" /> <span>Orders / Activity</span>
                </NavLink>
                <NavLink to="/admin/reports" className={navCls} title="Reports / Issues">
                  <Flag size={17} weight="fill" /> <span>Reports / Issues</span>
                </NavLink>
              </>
            )}

            <NavLink to="/admin/announcements" className={navCls} title="Announcements">
              <Megaphone size={17} weight="fill" /> <span>Announcements</span>
            </NavLink>

            {isSuperAdmin && (
              <>
                {/* System group */}
                <button
                  type="button"
                  className={`ac-nav-item ac-nav-group ${systemOpen && !collapsed ? 'is-open' : ''}`}
                  onClick={() => collapsed ? navigate('/admin/users') : setSystemOpen((v) => !v)}
                  aria-expanded={systemOpen && !collapsed}
                  title="System"
                >
                  <StoreIcon size={17} weight="fill" />
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
                    <NavLink to="/admin/junior-admins" className={subNavCls}>
                      Municipal Admins
                    </NavLink>
                  </div>
                )}

                <NavLink to="/admin/banners" className={navCls} title="Banners">
                  <ImageIcon size={17} weight="fill" /> <span>Banners</span>
                </NavLink>

                <NavLink to="/admin/vouchers" className={navCls} title="Vouchers">
                  <Ticket size={17} weight="fill" /> <span>Vouchers</span>
                </NavLink>

                <NavLink to="/admin/audit-logs" className={navCls} title="Audit Logs">
                  <FileText size={17} weight="fill" /> <span>Audit Logs</span>
                </NavLink>
              </>
            )}

            <NavLink to="/admin/analytics" className={navCls} title="Analytics">
              <PieChart size={17} weight="fill" /> <span>Analytics</span>
            </NavLink>

            <NavLink to="/admin/settings" className={navCls} title="Settings">
              <SettingsIcon size={17} weight="fill" /> <span>Settings</span>
            </NavLink>
          </nav>

          <Link to="/profile" className="ac-user-card" title="View profile">
            {user?.profilePhoto ? (
              <img src={resolveImg(user.profilePhoto)} alt="" className="ac-user-avatar" />
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
  '/admin/all-sellers': 'All Sellers',
  '/admin/buyers': 'All Buyers',
  '/admin/products': 'Products',
  '/admin/orders': 'Orders / Activity',
  '/admin/reports': 'Reports / Issues',
  '/admin/users': 'All Users',
  '/admin/categories': 'Categories',
  '/admin/municipalities': 'Municipalities',
  '/admin/analytics': 'Analytics',
  '/admin/announcements': 'Announcements',
  '/admin/banners': 'Banners',
  '/admin/vouchers': 'Vouchers',
  '/admin/junior-admins': 'Municipal Admins',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/settings': 'Settings',
};

function buildCrumbs(pathname) {
  const clean = pathname.replace(/\/$/, '') || '/admin';
  const crumbs = [{ to: '/admin', label: 'Admin Panel' }];

  if (clean === '/admin') {
    return [{ to: '/admin', label: 'Dashboard' }];
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
