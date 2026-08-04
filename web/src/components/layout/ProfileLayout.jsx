import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  User, MapPin, Star, Package, Heart, Store,
  MessageSquare, Bell, Settings, HelpCircle,
} from 'lucide-react';
import Layout from './Layout';
import '../../pages/Profile.css';

const navItems = [
  { to: '/profile', label: 'My Profile', icon: User, end: true },
  { to: '/profile/addresses', label: 'My Addresses', icon: MapPin },
  { to: '/profile/reviews', label: 'My Reviews', icon: Star },
  { to: '/profile/orders', label: 'My Orders', icon: Package },
  { to: '/profile/wishlist', label: 'My Wishlist', icon: Heart },
  { to: '/profile/followed-stores', label: 'Followed Stores', icon: Store },
  { to: '/profile/messages', label: 'Messages', icon: MessageSquare },
  { to: '/profile/notifications', label: 'Notifications', icon: Bell },
  { to: '/profile/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help Center', icon: HelpCircle },
];

const ProfileLayout = () => {
  return (
    <Layout>
      <div className="profile-page">
        <div className="container">
          <div className="profile-grid">
            <aside className="profile-sidebar">
              <nav className="profile-nav">
                {navItems.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `profile-nav-item${isActive ? ' profile-nav-item-active' : ''}`
                    }
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </nav>
            </aside>

            <main className="profile-main">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ProfileLayout;
